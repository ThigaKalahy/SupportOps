import { parseDisplayDate, todayBusinessDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import { pendingWatchIdsOf } from "../lib/validators/watch.ts"
import { vacationCovering } from "../lib/vacations.ts"
import {
  ALL_MEMBERS,
  cancelAgreementSchema,
  completeAgreementSchema,
  createAgreementSchema,
  editAgreementSchema,
  transferAgreementSchema,
} from "../lib/validators/agreement.ts"

import { auditOf, writeAudit } from "./audit.ts"
import { resolveCentralId } from "./centrals.ts"
import { linkPendingWatchItems } from "./watch.ts"
import { findWatchForWrite } from "./queries/watch.ts"
import { db } from "./db.ts"
import { moveAgreementEvents, recordTimelineEvents, syncTimelineContent, timelineEventFor } from "./timeline.ts"
import { requireManager, teamScope, type TeamContext } from "./scope.ts"

/**
 * Escrita de combinados (núcleo das Server Actions de src/actions/agreements.ts).
 * Criar grava o combinado com originalDueDate = dueDate (D17), a linha da
 * timeline e o AuditLog na mesma transação. Concluir grava status DONE,
 * completedAt (data de hoje) e a linha AGREEMENT_DONE. Editar muda título,
 * detalhes e prioridade (e o texto das linhas da timeline); cancelar grava
 * CANCELLED com o motivo no resultado. Reagendamento e substituição acontecem
 * na daily (P10), com AgreementCheckin — prazo nunca muda fora dela.
 * Transferir (C4) troca o responsável de um combinado em aberto: grava o
 * AgreementTransfer, leva a linha de criação para o novo dono e escreve uma linha
 * de transferência para cada pessoa. O prazo não muda.
 */

export async function createAgreementRecord(
  ctx: TeamContext,
  input: unknown,
): Promise<ActionResult | { ok: true; count: number }> {
  requireManager(ctx)
  const parsed = createAgreementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const data = parsed.data
  const due = parseDisplayDate(data.dueDate)
  if (!due) return { ok: false, error: labels.validation.date, fieldErrors: { dueDate: labels.validation.date } }
  // "Todos do time": quem estaria na daily do prazo — ativo (ou em desligamento) e fora de férias.
  const all = data.memberId === ALL_MEMBERS
  const members = await db.teamMember.findMany({
    where: all
      ? { ...teamScope(ctx), status: { in: ["ACTIVE", "OFFBOARDING"] }, vacations: { none: vacationCovering(ctx.teamId, due) } }
      : { ...teamScope(ctx), id: data.memberId },
    select: { id: true },
    orderBy: { preferredName: "asc" },
  })
  if (!members.length) {
    return all
      ? { ok: false, error: labels.forms.agreement.noMembersAvailable, fieldErrors: { memberId: labels.forms.agreement.noMembersAvailable } }
      : { ok: false, error: labels.validation.generic }
  }
  const centralId = await resolveCentralId(ctx, data.centralId)
  if (centralId === undefined) return { ok: false, error: labels.validation.generic, fieldErrors: { centralId: labels.validation.generic } }
  // C7: a observação precisa ser do time (e legível por quem escreve) e estar ativa.
  const watch = data.watchItemId ? await findWatchForWrite(ctx, data.watchItemId) : null
  if (data.watchItemId && (!watch || watch.status !== "ACTIVE")) return { ok: false, error: labels.watch.agreements.notActive }

  await db.$transaction(async (tx) => {
    for (const [i, member] of members.entries()) {
      const created = await tx.agreement.create({
        data: {
          ...teamScope(ctx),
          memberId: member.id,
          centralId,
          watchItemId: watch?.id ?? null,
          title: data.title,
          description: textOrNull(data.description),
          origin: data.origin,
          priority: data.priority,
          originalDueDate: due,
          dueDate: due,
          authorUserId: ctx.userId,
        },
      })
      await recordTimelineEvents(tx, ctx, [timelineEventFor.agreementCreated(created)])
      // P21: observação marcada no dialog antes de salvar passa a apontar para o combinado (o primeiro, com "Todos").
      if (i === 0) {
        await linkPendingWatchItems(tx, ctx, pendingWatchIdsOf(input), { agreementId: created.id }, { centralId: created.centralId })
      }
      await writeAudit(
        {
          action: "agreement.create",
          entity: "Agreement",
          entityId: created.id,
          after: {
            memberId: created.memberId,
            title: created.title,
            origin: created.origin,
            priority: created.priority,
            dueDate: data.dueDate,
            centralId,
            watchItemId: watch?.id ?? null,
            ...(all ? { allMembers: true } : {}),
          },
        },
        auditOf(ctx, tx),
      )
    }
  })
  return all ? { ok: true, count: members.length } : { ok: true }
}

export async function completeAgreementRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = completeAgreementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const before = await db.agreement.findFirst({ where: { id: parsed.data.id, ...teamScope(ctx) } })
  if (!before) return { ok: false, error: labels.validation.generic }
  if (before.status === "DONE" || before.status === "CANCELLED") {
    return { ok: false, error: labels.agreements.alreadyClosed }
  }
  const completedAt = todayBusinessDate()
  const outcome = textOrNull(parsed.data.outcome)

  await db.$transaction(async (tx) => {
    // updateMany com o status na condição: duas conclusões simultâneas não gravam duas linhas.
    const updated = await tx.agreement.updateMany({
      where: { ...teamScope(ctx), id: before.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      data: { status: "DONE", completedAt, outcome },
    })
    if (updated.count !== 1) throw new Error("Combinado encerrado durante a conclusão")
    await recordTimelineEvents(tx, ctx, [
      timelineEventFor.agreementDone({ ...before, completedAt, outcome, authorUserId: ctx.userId }),
    ])
    await writeAudit(
      {
        action: "agreement.complete",
        entity: "Agreement",
        entityId: before.id,
        before: { status: before.status },
        after: { status: "DONE", completedAt: completedAt.toISOString().slice(0, 10), outcome },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

export async function updateAgreementRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = editAgreementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const data = parsed.data
  const before = await db.agreement.findFirst({
    where: { id: data.id, ...teamScope(ctx) },
    select: { id: true, title: true, description: true, priority: true },
  })
  if (!before) return { ok: false, error: labels.validation.generic }
  const description = textOrNull(data.description)

  await db.$transaction(async (tx) => {
    await tx.agreement.update({ where: { id: before.id, ...teamScope(ctx) }, data: { title: data.title, description, priority: data.priority } })
    const source = { kind: "agreement" as const, id: before.id }
    // A linha de criação resume os detalhes; a de conclusão resume o resultado, que não muda aqui.
    await syncTimelineContent(tx, ctx, source, { title: data.title, summary: description }, "AGREEMENT")
    await syncTimelineContent(tx, ctx, source, { title: data.title }, "AGREEMENT_DONE")
    await writeAudit(
      {
        action: "agreement.update",
        entity: "Agreement",
        entityId: before.id,
        before: { title: before.title, description: before.description, priority: before.priority },
        after: { title: data.title, description, priority: data.priority },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

export async function cancelAgreementRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = cancelAgreementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const before = await db.agreement.findFirst({
    where: { id: parsed.data.id, ...teamScope(ctx) },
    select: { id: true, status: true },
  })
  if (!before) return { ok: false, error: labels.validation.generic }
  if (before.status === "DONE" || before.status === "CANCELLED") {
    return { ok: false, error: labels.agreements.alreadyClosed }
  }

  await db.$transaction(async (tx) => {
    const updated = await tx.agreement.updateMany({
      where: { ...teamScope(ctx), id: before.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      data: { status: "CANCELLED", outcome: parsed.data.reason },
    })
    if (updated.count !== 1) throw new Error("Combinado encerrado durante o cancelamento")
    await writeAudit(
      {
        action: "agreement.cancel",
        entity: "Agreement",
        entityId: before.id,
        before: { status: before.status },
        after: { status: "CANCELLED", reason: parsed.data.reason },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

export async function transferAgreementRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = transferAgreementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const { id, memberId, reason } = parsed.data
  const before = await db.agreement.findFirst({
    where: { id, ...teamScope(ctx) },
    select: { id: true, status: true, title: true, member: { select: { id: true, preferredName: true } } },
  })
  if (!before) return { ok: false, error: labels.validation.generic }
  if (before.status === "DONE" || before.status === "CANCELLED") {
    return { ok: false, error: labels.agreements.alreadyClosed }
  }
  const T = labels.agreements.transferErrors
  if (memberId === before.member.id) return { ok: false, error: T.sameMember, fieldErrors: { memberId: T.sameMember } }
  const to = await db.teamMember.findFirst({
    where: { id: memberId, ...teamScope(ctx), status: { not: "INACTIVE" } },
    select: { id: true, preferredName: true },
  })
  if (!to) return { ok: false, error: T.memberUnavailable, fieldErrors: { memberId: T.memberUnavailable } }

  await db.$transaction(async (tx) => {
    const moved = await tx.agreement.updateMany({
      where: { ...teamScope(ctx), id: before.id, memberId: before.member.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      data: { memberId: to.id },
    })
    if (moved.count !== 1) throw new Error("Combinado alterado durante a transferência")
    const transfer = await tx.agreementTransfer.create({
      data: { ...teamScope(ctx), agreementId: before.id, fromMemberId: before.member.id, toMemberId: to.id, reason, authorUserId: ctx.userId },
    })
    await moveAgreementEvents(tx, ctx, before.id, to.id)
    await recordTimelineEvents(
      tx,
      ctx,
      timelineEventFor.agreementTransfer({
        agreementId: before.id,
        title: before.title,
        from: before.member,
        to,
        reason,
        at: transfer.transferredAt,
        authorUserId: ctx.userId,
      }),
    )
    await writeAudit(
      {
        action: "agreement.transfer",
        entity: "Agreement",
        entityId: before.id,
        before: { memberId: before.member.id },
        after: { memberId: to.id, reason },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

