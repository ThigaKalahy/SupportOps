import { parseDisplayDate, todayBusinessDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import {
  cancelAgreementSchema,
  completeAgreementSchema,
  createAgreementSchema,
  editAgreementSchema,
} from "../lib/validators/agreement.ts"

import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { recordTimelineEvents, syncTimelineContent, timelineEventFor } from "./timeline.ts"
import { canWrite, memberScope, type Viewer } from "./visibility.ts"

/**
 * Escrita de combinados (núcleo das Server Actions de src/actions/agreements.ts).
 * Criar grava o combinado com originalDueDate = dueDate (D17), a linha da
 * timeline e o AuditLog na mesma transação. Concluir grava status DONE,
 * completedAt (data de hoje) e a linha AGREEMENT_DONE. Editar muda título,
 * detalhes e prioridade (e o texto das linhas da timeline); cancelar grava
 * CANCELLED com o motivo no resultado. Reagendamento e substituição acontecem
 * na daily (P10), com AgreementCheckin — prazo nunca muda fora dela.
 */

export async function createAgreementRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = createAgreementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const data = parsed.data
  const member = await db.teamMember.findFirst({ where: { id: data.memberId, ...memberScope(user) }, select: { id: true } })
  if (!member) return { ok: false, error: labels.validation.generic }
  const due = parseDisplayDate(data.dueDate)
  if (!due) return { ok: false, error: labels.validation.date, fieldErrors: { dueDate: labels.validation.date } }

  await db.$transaction(async (tx) => {
    const created = await tx.agreement.create({
      data: {
        memberId: member.id,
        title: data.title,
        description: textOrNull(data.description),
        origin: data.origin,
        priority: data.priority,
        originalDueDate: due,
        dueDate: due,
        authorUserId: user.id,
      },
    })
    await recordTimelineEvents(tx, [timelineEventFor.agreementCreated(created)])
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
        },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

export async function completeAgreementRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = completeAgreementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const before = await db.agreement.findFirst({ where: { id: parsed.data.id, member: memberScope(user) } })
  if (!before) return { ok: false, error: labels.validation.generic }
  if (before.status === "DONE" || before.status === "CANCELLED") {
    return { ok: false, error: labels.agreements.alreadyClosed }
  }
  const completedAt = todayBusinessDate()
  const outcome = textOrNull(parsed.data.outcome)

  await db.$transaction(async (tx) => {
    // updateMany com o status na condição: duas conclusões simultâneas não gravam duas linhas.
    const updated = await tx.agreement.updateMany({
      where: { id: before.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      data: { status: "DONE", completedAt, outcome },
    })
    if (updated.count !== 1) throw new Error("Combinado encerrado durante a conclusão")
    await recordTimelineEvents(tx, [
      timelineEventFor.agreementDone({ ...before, completedAt, outcome, authorUserId: user.id }),
    ])
    await writeAudit(
      {
        action: "agreement.complete",
        entity: "Agreement",
        entityId: before.id,
        before: { status: before.status },
        after: { status: "DONE", completedAt: completedAt.toISOString().slice(0, 10), outcome },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

export async function updateAgreementRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = editAgreementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const data = parsed.data
  const before = await db.agreement.findFirst({
    where: { id: data.id, member: memberScope(user) },
    select: { id: true, title: true, description: true, priority: true },
  })
  if (!before) return { ok: false, error: labels.validation.generic }
  const description = textOrNull(data.description)

  await db.$transaction(async (tx) => {
    await tx.agreement.update({ where: { id: before.id }, data: { title: data.title, description, priority: data.priority } })
    const source = { kind: "agreement" as const, id: before.id }
    // A linha de criação resume os detalhes; a de conclusão resume o resultado, que não muda aqui.
    await syncTimelineContent(tx, source, { title: data.title, summary: description }, "AGREEMENT")
    await syncTimelineContent(tx, source, { title: data.title }, "AGREEMENT_DONE")
    await writeAudit(
      {
        action: "agreement.update",
        entity: "Agreement",
        entityId: before.id,
        before: { title: before.title, description: before.description, priority: before.priority },
        after: { title: data.title, description, priority: data.priority },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

export async function cancelAgreementRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = cancelAgreementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const before = await db.agreement.findFirst({
    where: { id: parsed.data.id, member: memberScope(user) },
    select: { id: true, status: true },
  })
  if (!before) return { ok: false, error: labels.validation.generic }
  if (before.status === "DONE" || before.status === "CANCELLED") {
    return { ok: false, error: labels.agreements.alreadyClosed }
  }

  await db.$transaction(async (tx) => {
    const updated = await tx.agreement.updateMany({
      where: { id: before.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
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
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}
