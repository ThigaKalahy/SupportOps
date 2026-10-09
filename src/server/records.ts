import { businessDateAtNoon, formatDate, parseDisplayDate, todayBusinessDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { pendingWatchIdsOf } from "../lib/validators/watch.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import {
  feedbackSchema,
  noteSchema,
  oneOnOneSchema,
  recordRefSchema,
  recordVisibilitySchema,
  type GeneratedAgreementInput,
} from "../lib/validators/records.ts"

import { auditOf, writeAudit } from "./audit.ts"
import { linkPendingWatchItems } from "./watch.ts"
import { db } from "./db.ts"
import { findEditableRecord, findToggleableSource } from "./queries/records.ts"
import {
  rebuildTimelineEvents,
  recordTimelineEvents,
  removeTimelineEvents,
  syncTimelineVisibility,
  timelineEventFor,
} from "./timeline.ts"
import { requireManager, teamScope, type TeamContext } from "./scope.ts"

/**
 * Escrita de 1:1, feedback e anotação (núcleo das Server Actions de
 * src/actions/records.ts). Recebe o usuário já autenticado — testável sem
 * sessão. Cada escrita: zod → transação (registro + TimelineEvent + AuditLog).
 * A linha da timeline nasce com a MESMA visibilidade do registro.
 *
 * Combinados gerados no 1:1 ou no feedback nascem na mesma transação, com a
 * pessoa do registro como responsável, origem ONE_ON_ONE/FEEDBACK e o vínculo
 * (sourceOneOnOneId/sourceFeedbackId); originalDueDate = dueDate (D17).
 */

function invalid(error: Parameters<typeof fieldErrorsOf>[0]): ActionResult {
  return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(error) }
}

/** Pessoa ativa (não desativada) dentro do escopo de quem escreve. */
async function writableMember(ctx: TeamContext, memberId: string) {
  return db.teamMember.findFirst({ where: { id: memberId, ...teamScope(ctx) }, select: { id: true } })
}

/** "DD/MM/AAAA" já validado → data de negócio. */
function businessDate(value: string): Date {
  const date = parseDisplayDate(value)
  if (!date) throw new Error(`Data inválida após validação: ${value}`)
  return date
}

function optionalBusinessDate(value: string): Date | null {
  return value.trim() === "" ? null : businessDate(value)
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/** Cria os combinados gerados por um 1:1 ou feedback, com a linha da timeline de cada um. */
async function createGeneratedAgreements(
  tx: Tx,
  ctx: TeamContext,
  memberId: string,
  source: { origin: "ONE_ON_ONE"; sourceOneOnOneId: string } | { origin: "FEEDBACK"; sourceFeedbackId: string },
  rows: GeneratedAgreementInput[],
): Promise<string[]> {
  const ids: string[] = []
  for (const row of rows) {
    const due = businessDate(row.dueDate)
    const created = await tx.agreement.create({
      data: { ...teamScope(ctx), memberId, title: row.title, originalDueDate: due, dueDate: due, authorUserId: ctx.userId, ...source },
    })
    await recordTimelineEvents(tx, ctx, [timelineEventFor.agreementCreated(created)])
    ids.push(created.id)
  }
  return ids
}

export async function createOneOnOneRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = oneOnOneSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const data = parsed.data
  if (!(await writableMember(ctx, data.memberId))) return { ok: false, error: labels.validation.generic }

  await db.$transaction(async (tx) => {
    const created = await tx.oneOnOne.create({
      data: {
        ...teamScope(ctx),
        memberId: data.memberId,
        date: businessDate(data.date),
        durationMinutes: data.durationMinutes === "" ? null : Number(data.durationMinutes),
        topics: data.topics,
        memberPerception: textOrNull(data.memberPerception),
        managerPerception: textOrNull(data.managerPerception),
        wins: textOrNull(data.wins),
        difficulties: textOrNull(data.difficulties),
        development: textOrNull(data.development),
        nextReviewAt: optionalBusinessDate(data.nextReviewAt),
        visibility: data.visibility,
        authorUserId: ctx.userId,
      },
    })
    await recordTimelineEvents(tx, ctx, [timelineEventFor.oneOnOne(created)])
    // P21: observações marcadas no formulário antes de salvar passam a apontar para este 1:1.
    await linkPendingWatchItems(tx, ctx, pendingWatchIdsOf(input), { oneOnOneId: created.id })
    const agreementIds = await createGeneratedAgreements(
      tx,
      ctx,
      created.memberId,
      { origin: "ONE_ON_ONE", sourceOneOnOneId: created.id },
      data.agreements,
    )
    await writeAudit(
      {
        action: "oneOnOne.create",
        entity: "OneOnOne",
        entityId: created.id,
        after: { memberId: created.memberId, date: data.date, visibility: created.visibility, agreementIds },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

export async function createFeedbackRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = feedbackSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const data = parsed.data
  if (!(await writableMember(ctx, data.memberId))) return { ok: false, error: labels.validation.generic }

  await db.$transaction(async (tx) => {
    const created = await tx.feedback.create({
      data: {
        ...teamScope(ctx),
        memberId: data.memberId,
        date: businessDate(data.date),
        category: data.category,
        context: textOrNull(data.context),
        behavior: data.behavior,
        impact: textOrNull(data.impact),
        guidance: textOrNull(data.guidance),
        followUpAt: optionalBusinessDate(data.followUpAt),
        visibility: data.visibility,
        authorUserId: ctx.userId,
      },
    })
    await recordTimelineEvents(tx, ctx, [timelineEventFor.feedback(created)])
    // P21: observações marcadas no formulário antes de salvar passam a apontar para este feedback.
    await linkPendingWatchItems(tx, ctx, pendingWatchIdsOf(input), { feedbackId: created.id })
    const agreementIds = await createGeneratedAgreements(
      tx,
      ctx,
      created.memberId,
      { origin: "FEEDBACK", sourceFeedbackId: created.id },
      data.agreements,
    )
    await writeAudit(
      {
        action: "feedback.create",
        entity: "Feedback",
        entityId: created.id,
        after: {
          memberId: created.memberId,
          date: data.date,
          category: created.category,
          visibility: created.visibility,
          agreementIds,
        },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

export async function createNoteRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = noteSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const data = parsed.data
  if (!(await writableMember(ctx, data.memberId))) return { ok: false, error: labels.validation.generic }

  // Anotação de hoje guarda o instante real; retroativa, o meio-dia daquele dia.
  const day = businessDate(data.date)
  const occurredAt = day.getTime() === todayBusinessDate().getTime() ? new Date() : businessDateAtNoon(day)

  await db.$transaction(async (tx) => {
    const created = await tx.note.create({
      data: {
        ...teamScope(ctx),
        memberId: data.memberId,
        occurredAt,
        title: data.title,
        body: data.body,
        visibility: data.visibility,
        authorUserId: ctx.userId,
      },
    })
    await recordTimelineEvents(tx, ctx, [timelineEventFor.note(created)])
    await writeAudit(
      {
        action: "note.create",
        entity: "Note",
        entityId: created.id,
        after: { memberId: created.memberId, occurredAt: occurredAt.toISOString(), visibility: created.visibility },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

const SOURCE_ENTITY = { oneOnOne: "OneOnOne", feedback: "Feedback", note: "Note" } as const

/**
 * Alterna PRIVATE/SHARED de um 1:1, feedback ou anotação a partir da linha da
 * timeline. Registro de origem e TODAS as linhas-espelho mudam na mesma
 * transação (linha SHARED apontando para registro PRIVATE é vazamento).
 */
export async function setRecordVisibilityRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = recordVisibilitySchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const { eventId, visibility } = parsed.data

  const found = await findToggleableSource(ctx, eventId)
  if (!found) return { ok: false, error: labels.validation.generic }
  if (found.visibility === visibility) return { ok: true }
  const { source } = found

  await db.$transaction(async (tx) => {
    const where = { id: source.id, memberId: found.memberId, ...teamScope(ctx) }
    if (source.kind === "oneOnOne") await tx.oneOnOne.update({ where, data: { visibility } })
    if (source.kind === "feedback") await tx.feedback.update({ where, data: { visibility } })
    if (source.kind === "note") await tx.note.update({ where, data: { visibility } })
    await syncTimelineVisibility(tx, ctx, source, visibility)
    await writeAudit(
      {
        action: "record.visibility.update",
        entity: SOURCE_ENTITY[source.kind],
        entityId: source.id,
        before: { visibility: found.visibility },
        after: { visibility },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/* ───────────────────────── Edição e exclusão ───────────────────────── */

/** Campos que mudaram (para a auditoria), sem copiar o texto do registro. */
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : (v ?? null))
  return Object.keys(after).filter((key) => norm(before[key]) !== norm(after[key]))
}

/**
 * Edição de 1:1: mesmos campos e regras da criação. A pessoa não muda e os
 * combinados gerados não são refeitos (já existem por conta própria). A linha
 * da timeline é refeita com a data, o texto e a visibilidade novos.
 */
export async function updateOneOnOneRecord(ctx: TeamContext, id: string, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = oneOnOneSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const data = parsed.data
  const found = await findEditableRecord(ctx, "oneOnOne", id)
  if (found?.kind !== "oneOnOne" || found.record.memberId !== data.memberId) return { ok: false, error: labels.validation.generic }
  const before = found.record

  const next = {
    date: businessDate(data.date),
    durationMinutes: data.durationMinutes === "" ? null : Number(data.durationMinutes),
    topics: data.topics,
    memberPerception: textOrNull(data.memberPerception),
    managerPerception: textOrNull(data.managerPerception),
    wins: textOrNull(data.wins),
    difficulties: textOrNull(data.difficulties),
    development: textOrNull(data.development),
    nextReviewAt: optionalBusinessDate(data.nextReviewAt),
    visibility: data.visibility,
  }
  await db.$transaction(async (tx) => {
    const updated = await tx.oneOnOne.update({ where: { id, ...teamScope(ctx) }, data: next })
    await rebuildTimelineEvents(tx, ctx, { kind: "oneOnOne", id }, [timelineEventFor.oneOnOne(updated)])
    await writeAudit(
      {
        action: "oneOnOne.update",
        entity: "OneOnOne",
        entityId: id,
        before: { visibility: before.visibility },
        after: { visibility: updated.visibility, changed: changedFields(before, next) },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/** Edição de feedback. Trocar a categoria de/para Reconhecimento troca o tipo da linha. */
export async function updateFeedbackRecord(ctx: TeamContext, id: string, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = feedbackSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const data = parsed.data
  const found = await findEditableRecord(ctx, "feedback", id)
  if (found?.kind !== "feedback" || found.record.memberId !== data.memberId) return { ok: false, error: labels.validation.generic }
  const before = found.record

  const next = {
    date: businessDate(data.date),
    category: data.category,
    context: textOrNull(data.context),
    behavior: data.behavior,
    impact: textOrNull(data.impact),
    guidance: textOrNull(data.guidance),
    followUpAt: optionalBusinessDate(data.followUpAt),
    visibility: data.visibility,
  }
  await db.$transaction(async (tx) => {
    const updated = await tx.feedback.update({ where: { id, ...teamScope(ctx) }, data: next })
    await rebuildTimelineEvents(tx, ctx, { kind: "feedback", id }, [timelineEventFor.feedback(updated)])
    await writeAudit(
      {
        action: "feedback.update",
        entity: "Feedback",
        entityId: id,
        before: { visibility: before.visibility, category: before.category },
        after: { visibility: updated.visibility, category: updated.category, changed: changedFields(before, next) },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/** Edição de anotação. Mesmo dia: mantém o instante original; outro dia: meio-dia (ou agora, se hoje). */
export async function updateNoteRecord(ctx: TeamContext, id: string, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = noteSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const data = parsed.data
  const found = await findEditableRecord(ctx, "note", id)
  if (found?.kind !== "note" || found.record.memberId !== data.memberId) return { ok: false, error: labels.validation.generic }
  const before = found.record

  const day = businessDate(data.date)
  const occurredAt =
    formatDate(before.occurredAt) === data.date
      ? before.occurredAt
      : day.getTime() === todayBusinessDate().getTime()
        ? new Date()
        : businessDateAtNoon(day)
  const next = { occurredAt, title: data.title, body: data.body, visibility: data.visibility }

  await db.$transaction(async (tx) => {
    const updated = await tx.note.update({ where: { id, ...teamScope(ctx) }, data: next })
    await rebuildTimelineEvents(tx, ctx, { kind: "note", id }, [timelineEventFor.note(updated)])
    await writeAudit(
      {
        action: "note.update",
        entity: "Note",
        entityId: id,
        before: { visibility: before.visibility },
        after: { visibility: updated.visibility, changed: changedFields(before, next) },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/**
 * Exclusão lógica (deletedAt, D10) de 1:1, feedback ou anotação. As linhas da
 * timeline saem na mesma transação; os combinados gerados continuam — são
 * compromissos com vida própria e já contam no cumprimento.
 */
export async function deleteRecordRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = recordRefSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const { kind, id } = parsed.data
  const found = await findEditableRecord(ctx, kind, id)
  if (!found) return { ok: false, error: labels.validation.generic }

  const deletedAt = new Date()
  await db.$transaction(async (tx) => {
    const where = { id, ...teamScope(ctx) }
    if (kind === "oneOnOne") await tx.oneOnOne.update({ where, data: { deletedAt } })
    if (kind === "feedback") await tx.feedback.update({ where, data: { deletedAt } })
    if (kind === "note") await tx.note.update({ where, data: { deletedAt } })
    await removeTimelineEvents(tx, ctx, { kind, id })
    await writeAudit(
      {
        action: `${kind}.delete`,
        entity: SOURCE_ENTITY[kind],
        entityId: id,
        before: { memberId: found.record.memberId, visibility: found.record.visibility },
        after: { deletedAt: deletedAt.toISOString() },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}
