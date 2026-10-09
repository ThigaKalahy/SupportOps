import { z } from "zod"

import { labels } from "../lib/labels.ts"
import { computeOutcome, extractTicketRef } from "../lib/priority-validation.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import {
  priorityValidationFields,
  priorityValidationSchema,
  type ValidationCatalog,
} from "../lib/validators/priority-validation.ts"

import { writeAudit } from "./audit.ts"
import { resolveCentralId } from "./centrals.ts"
import { db } from "./db.ts"
import { canWrite, memberScope, type Viewer } from "./visibility.ts"

/**
 * Escrita de validação de prioridade (núcleo das Server Actions de
 * src/actions/priority-validations.ts). Não escreve TimelineEvent (D15).
 *
 * D14: o resultado e os ranks do momento (analystRankSnapshot,
 * supervisorRankSnapshot) são gravados na escrita e nunca recalculados.
 * Na edição, os snapshots só mudam se as prioridades ou o "devolver"
 * mudarem — corrigir a observação não reescreve o passado com a escala nova.
 *
 * validatedAt e validatedByUserId vêm do servidor, sem campo na tela.
 */

export type ValidationResult = { ok: true; id: string; ticketRef: string } | Extract<ActionResult, { ok: false }>

/** Catálogo da organização: níveis ativos (mais os já usados no registro editado) e motivos. */
async function catalogFor(viewer: Viewer, keepLevelIds: string[] = [], keepReasonId?: string | null) {
  const [levels, reasons, patterns] = await Promise.all([
    db.priorityLevel.findMany({
      where: { organizationId: viewer.organizationId, OR: [{ isActive: true }, { id: { in: keepLevelIds } }] },
      select: { id: true, rank: true },
    }),
    db.reclassificationReason.findMany({
      where: {
        organizationId: viewer.organizationId,
        OR: [{ isActive: true }, ...(keepReasonId ? [{ id: keepReasonId }] : [])],
      },
      select: { id: true, requiresDetail: true },
    }),
    db.ticketUrlPattern.findMany({
      where: { organizationId: viewer.organizationId, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, regex: true, captureGroup: true },
    }),
  ])
  return { catalog: { levels, reasons } satisfies ValidationCatalog, patterns }
}

function snapshot(
  catalog: ValidationCatalog,
  data: { analystPriorityId: string; supervisorPriorityId: string; returned: boolean },
) {
  const rank = (id: string) => catalog.levels.find((l) => l.id === id)?.rank ?? null
  const analystRank = rank(data.analystPriorityId)!
  const supervisorRank = data.returned ? null : rank(data.supervisorPriorityId)
  const outcome = computeOutcome({ analystRank, supervisorRank, returned: data.returned })!
  return {
    analystPriorityId: data.analystPriorityId,
    supervisorPriorityId: data.returned ? null : data.supervisorPriorityId,
    analystRankSnapshot: analystRank,
    supervisorRankSnapshot: supervisorRank,
    outcome,
  }
}

export async function createValidationRecord(user: Viewer, input: unknown): Promise<ValidationResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const { catalog, patterns } = await catalogFor(user)
  // ID vazio: o servidor tenta os padrões também (o cliente pode não ter extraído).
  const raw = withExtractedRef(input, patterns)
  const parsed = priorityValidationSchema(catalog).safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const data = parsed.data
  const member = await db.teamMember.findFirst({
    where: { id: data.memberId, ...memberScope(user), status: { in: ["ACTIVE", "OFFBOARDING"] } },
    select: { id: true },
  })
  if (!member) return { ok: false, error: labels.validation.generic, fieldErrors: { memberId: labels.validation.required } }
  const centralId = await resolveCentralId(user.organizationId, data.centralId)
  if (centralId === undefined) return { ok: false, error: labels.validation.generic, fieldErrors: { centralId: labels.validation.generic } }

  const values = snapshot(catalog, data)
  const reasonId = values.outcome === "MAINTAINED" ? null : data.reasonId
  const reasonOther = reasonId && catalog.reasons.find((r) => r.id === reasonId)?.requiresDetail ? data.reasonOther : null

  const created = await db.$transaction(async (tx) => {
    const row = await tx.priorityValidation.create({
      data: {
        organizationId: user.organizationId,
        ticketUrl: data.ticketUrl,
        ticketRef: data.ticketRef,
        memberId: member.id,
        centralId,
        ...values,
        reasonId,
        reasonOther,
        note: textOrNull(data.note),
        validatedAt: new Date(),
        validatedByUserId: user.id,
      },
    })
    await writeAudit(
      {
        action: "priorityValidation.create",
        entity: "PriorityValidation",
        entityId: row.id,
        after: {
          ticketRef: row.ticketRef,
          memberId: row.memberId,
          centralId: row.centralId,
          outcome: row.outcome,
          analystRank: row.analystRankSnapshot,
          supervisorRank: row.supervisorRankSnapshot,
          reasonId: row.reasonId,
        },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
    return row
  })
  return { ok: true, id: created.id, ticketRef: created.ticketRef }
}

export async function updateValidationRecord(user: Viewer, input: unknown): Promise<ValidationResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const id = z.object({ id: z.string().min(1) }).safeParse(input)
  if (!id.success) return { ok: false, error: labels.validation.generic }
  const before = await db.priorityValidation.findFirst({
    where: { id: id.data.id, organizationId: user.organizationId, member: memberScope(user) },
  })
  if (!before) return { ok: false, error: labels.validation.generic }

  const keep = [before.analystPriorityId, ...(before.supervisorPriorityId ? [before.supervisorPriorityId] : [])]
  const { catalog: current, patterns } = await catalogFor(user, keep, before.reasonId)
  const raw = withExtractedRef(input, patterns)
  const base = z.object(priorityValidationFields).safeParse(raw)
  const samePriorities =
    base.success &&
    base.data.analystPriorityId === before.analystPriorityId &&
    base.data.returned === (before.outcome === "RETURNED") &&
    (base.data.returned || base.data.supervisorPriorityId === before.supervisorPriorityId)
  // D14: sem mudança de prioridade, valem os ranks gravados — não os da escala de hoje.
  const catalog: ValidationCatalog = samePriorities
    ? {
        reasons: current.reasons,
        levels: current.levels.map((l) =>
          l.id === before.analystPriorityId
            ? { id: l.id, rank: before.analystRankSnapshot }
            : l.id === before.supervisorPriorityId && before.supervisorRankSnapshot !== null
              ? { id: l.id, rank: before.supervisorRankSnapshot }
              : l,
        ),
      }
    : current
  const parsed = priorityValidationSchema(catalog).safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const data = parsed.data
  const member = await db.teamMember.findFirst({ where: { id: data.memberId, ...memberScope(user) }, select: { id: true } })
  if (!member) return { ok: false, error: labels.validation.generic }
  // A central gravada continua valendo mesmo se tiver sido desativada depois; trocar exige uma ativa.
  const centralId =
    data.centralId && data.centralId === before.centralId ? before.centralId : await resolveCentralId(user.organizationId, data.centralId)
  if (centralId === undefined) return { ok: false, error: labels.validation.generic, fieldErrors: { centralId: labels.validation.generic } }

  const values = samePriorities
    ? {
        analystPriorityId: before.analystPriorityId,
        supervisorPriorityId: before.supervisorPriorityId,
        analystRankSnapshot: before.analystRankSnapshot,
        supervisorRankSnapshot: before.supervisorRankSnapshot,
        outcome: before.outcome,
      }
    : snapshot(catalog, data)
  const reasonId = values.outcome === "MAINTAINED" ? null : data.reasonId
  const reasonOther = reasonId && catalog.reasons.find((r) => r.id === reasonId)?.requiresDetail ? data.reasonOther : null

  await db.$transaction(async (tx) => {
    const after = await tx.priorityValidation.update({
      where: { id: before.id },
      data: {
        ticketUrl: data.ticketUrl,
        ticketRef: data.ticketRef,
        memberId: member.id,
        centralId,
        ...values,
        reasonId,
        reasonOther,
        note: textOrNull(data.note),
      },
    })
    await writeAudit(
      {
        action: "priorityValidation.update",
        entity: "PriorityValidation",
        entityId: before.id,
        before: auditView(before),
        after: auditView(after),
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true, id: before.id, ticketRef: data.ticketRef }
}

/** Exclusão lógica (deletedAt): a validação sai das listas e dos resumos. */
export async function deleteValidationRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = z.object({ id: z.string().min(1) }).safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const before = await db.priorityValidation.findFirst({
    where: { id: parsed.data.id, organizationId: user.organizationId, member: memberScope(user) },
  })
  if (!before) return { ok: false, error: labels.validation.generic }
  await db.$transaction(async (tx) => {
    await tx.priorityValidation.update({ where: { id: before.id }, data: { deletedAt: new Date() } })
    await writeAudit(
      {
        action: "priorityValidation.delete",
        entity: "PriorityValidation",
        entityId: before.id,
        before: auditView(before),
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

function auditView(v: {
  ticketRef: string
  memberId: string
  centralId: string | null
  outcome: string
  analystPriorityId: string
  supervisorPriorityId: string | null
  analystRankSnapshot: number
  supervisorRankSnapshot: number | null
  reasonId: string | null
  reasonOther: string | null
  note: string | null
}) {
  return {
    ticketRef: v.ticketRef,
    memberId: v.memberId,
    centralId: v.centralId,
    outcome: v.outcome,
    analystPriorityId: v.analystPriorityId,
    supervisorPriorityId: v.supervisorPriorityId,
    analystRank: v.analystRankSnapshot,
    supervisorRank: v.supervisorRankSnapshot,
    reasonId: v.reasonId,
    reasonOther: v.reasonOther,
    note: v.note,
  }
}

/** ID vazio: extrai da URL pelos padrões ativos (também usado pela devolução do desenvolvimento, P20). */
export function withExtractedRef(input: unknown, patterns: { id: string; regex: string; captureGroup: number }[]): unknown {
  if (typeof input !== "object" || input === null) return input
  const record = input as Record<string, unknown>
  const ref = typeof record.ticketRef === "string" ? record.ticketRef.trim() : ""
  if (ref || typeof record.ticketUrl !== "string") return input
  return { ...record, ticketRef: extractTicketRef(record.ticketUrl, patterns)?.ref ?? "" }
}
