import { z } from "zod"

import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import {
  businessDateOf,
  devReturnSchema,
  resolveDevReturnSchema,
  type DevReturnCatalog,
} from "../lib/validators/dev-return.ts"

import { writeAudit } from "./audit.ts"
import { resolveCentralId } from "./centrals.ts"
import { db } from "./db.ts"
import { withExtractedRef } from "./priority-validations.ts"
import { canWrite, memberScope, type Viewer } from "./visibility.ts"

/**
 * Escrita de devolução do desenvolvimento (núcleo de src/actions/dev-returns.ts).
 * Evento separado da validação de prioridade (D21): não altera
 * PriorityValidation e não escreve TimelineEvent (mesma razão da D15).
 *
 * `priorityValidationId` é ligado AQUI, pelo ticketRef: a validação mais
 * recente do mesmo chamado na organização; sem nenhuma, fica nulo (normal).
 * Quem registra e quando vêm do servidor.
 */

export type DevReturnResult = { ok: true; id: string; ticketRef: string } | Extract<ActionResult, { ok: false }>

async function catalogFor(viewer: Viewer, keepReasonId?: string) {
  const [reasons, patterns] = await Promise.all([
    db.devReturnReason.findMany({
      where: { organizationId: viewer.organizationId, OR: [{ isActive: true }, ...(keepReasonId ? [{ id: keepReasonId }] : [])] },
      select: { id: true, requiresDetail: true },
    }),
    db.ticketUrlPattern.findMany({
      where: { organizationId: viewer.organizationId, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, regex: true, captureGroup: true },
    }),
  ])
  return { catalog: { reasons } satisfies DevReturnCatalog, patterns }
}

/** A validação mais recente do chamado na organização (não excluída), ou null. */
export async function latestValidationFor(organizationId: string, ticketRef: string) {
  return db.priorityValidation.findFirst({
    where: { organizationId, ticketRef },
    orderBy: [{ validatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, memberId: true, centralId: true },
  })
}

function auditView(r: {
  ticketRef: string
  memberId: string
  centralId: string | null
  priorityValidationId: string | null
  returnedAt: Date
  reasonId: string
  reasonOther: string | null
  devContact: string | null
  note: string | null
  resolvedAt: Date | null
  resolutionNote: string | null
}) {
  return JSON.parse(JSON.stringify(r)) as Record<string, string | null>
}

async function parseInput(user: Viewer, input: unknown, keepReasonId?: string) {
  const { catalog, patterns } = await catalogFor(user, keepReasonId)
  // ID vazio: o servidor tenta os padrões também — a mesma função da validação de prioridade.
  const raw = withExtractedRef(input, patterns)
  return devReturnSchema(catalog).safeParse(raw)
}

export async function createDevReturnRecord(user: Viewer, input: unknown): Promise<DevReturnResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = await parseInput(user, input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const member = await db.teamMember.findFirst({
    where: { id: data.memberId, ...memberScope(user), status: { in: ["ACTIVE", "OFFBOARDING", "ON_LEAVE"] } },
    select: { id: true },
  })
  if (!member) return { ok: false, error: labels.validation.generic, fieldErrors: { memberId: labels.validation.required } }
  const centralId = await resolveCentralId(user.organizationId, data.centralId)
  if (centralId === undefined) return { ok: false, error: labels.validation.generic, fieldErrors: { centralId: labels.validation.generic } }
  const validation = await latestValidationFor(user.organizationId, data.ticketRef)

  const created = await db.$transaction(async (tx) => {
    const row = await tx.devReturn.create({
      data: {
        organizationId: user.organizationId,
        ticketUrl: data.ticketUrl,
        ticketRef: data.ticketRef,
        memberId: member.id,
        centralId,
        priorityValidationId: validation?.id ?? null,
        returnedAt: businessDateOf(data.returnedAt),
        reasonId: data.reasonId,
        reasonOther: textOrNull(data.reasonOther),
        devContact: textOrNull(data.devContact),
        note: textOrNull(data.note),
        registeredByUserId: user.id,
      },
    })
    await writeAudit(
      { action: "devReturn.create", entity: "DevReturn", entityId: row.id, after: auditView(row) },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
    return row
  })
  return { ok: true, id: created.id, ticketRef: created.ticketRef }
}

export async function updateDevReturnRecord(user: Viewer, input: unknown): Promise<DevReturnResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const id = z.object({ id: z.string().min(1) }).safeParse(input)
  if (!id.success) return { ok: false, error: labels.validation.generic }
  const before = await db.devReturn.findFirst({
    where: { id: id.data.id, organizationId: user.organizationId, member: memberScope(user) },
  })
  if (!before) return { ok: false, error: labels.validation.generic }
  const parsed = await parseInput(user, input, before.reasonId)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const member = await db.teamMember.findFirst({ where: { id: data.memberId, ...memberScope(user) }, select: { id: true } })
  if (!member) return { ok: false, error: labels.validation.generic }
  // A central gravada continua valendo mesmo se tiver sido desativada depois; trocar exige uma ativa.
  const centralId =
    data.centralId && data.centralId === before.centralId ? before.centralId : await resolveCentralId(user.organizationId, data.centralId)
  if (centralId === undefined) return { ok: false, error: labels.validation.generic, fieldErrors: { centralId: labels.validation.generic } }
  const returnedAt = businessDateOf(data.returnedAt)
  if (before.resolvedAt && before.resolvedAt < returnedAt) {
    return { ok: false, error: labels.devReturns.validation.resolvedBeforeReturn, fieldErrors: { returnedAt: labels.devReturns.validation.resolvedBeforeReturn } }
  }
  // Chamado trocado: o vínculo com a validação acompanha o novo ID.
  const priorityValidationId =
    data.ticketRef === before.ticketRef ? before.priorityValidationId : ((await latestValidationFor(user.organizationId, data.ticketRef))?.id ?? null)

  await db.$transaction(async (tx) => {
    const after = await tx.devReturn.update({
      where: { id: before.id },
      data: {
        ticketUrl: data.ticketUrl,
        ticketRef: data.ticketRef,
        memberId: member.id,
        centralId,
        priorityValidationId,
        returnedAt,
        reasonId: data.reasonId,
        reasonOther: textOrNull(data.reasonOther),
        devContact: textOrNull(data.devContact),
        note: textOrNull(data.note),
      },
    })
    await writeAudit(
      { action: "devReturn.update", entity: "DevReturn", entityId: before.id, before: auditView(before), after: auditView(after) },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true, id: before.id, ticketRef: data.ticketRef }
}

/** Marca como reenviado: resolvedAt (não antes da devolução) e a resolução opcional. */
export async function resolveDevReturnRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = resolveDevReturnSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const before = await db.devReturn.findFirst({
    where: { id: parsed.data.id, organizationId: user.organizationId, member: memberScope(user) },
  })
  if (!before) return { ok: false, error: labels.validation.generic }
  const resolvedAt = businessDateOf(parsed.data.resolvedAt)
  if (resolvedAt < before.returnedAt) {
    const message = labels.devReturns.validation.resolvedBeforeReturn
    return { ok: false, error: message, fieldErrors: { resolvedAt: message } }
  }
  await db.$transaction(async (tx) => {
    const after = await tx.devReturn.update({
      where: { id: before.id },
      data: { resolvedAt, resolutionNote: textOrNull(parsed.data.resolutionNote) },
    })
    await writeAudit(
      { action: "devReturn.resolve", entity: "DevReturn", entityId: before.id, before: auditView(before), after: auditView(after) },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

/** Exclusão lógica (deletedAt), auditada. */
export async function deleteDevReturnRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = z.object({ id: z.string().min(1) }).safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const before = await db.devReturn.findFirst({
    where: { id: parsed.data.id, organizationId: user.organizationId, member: memberScope(user) },
  })
  if (!before) return { ok: false, error: labels.validation.generic }
  await db.$transaction(async (tx) => {
    await tx.devReturn.update({ where: { id: before.id }, data: { deletedAt: new Date() } })
    await writeAudit(
      { action: "devReturn.delete", entity: "DevReturn", entityId: before.id, before: auditView(before) },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

