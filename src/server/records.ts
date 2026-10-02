import { businessDateAtNoon, parseDisplayDate, todayBusinessDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import {
  feedbackSchema,
  noteSchema,
  oneOnOneSchema,
  recordVisibilitySchema,
  type GeneratedAgreementInput,
} from "../lib/validators/records.ts"

import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { findToggleableSource } from "./queries/records.ts"
import { recordTimelineEvents, syncTimelineVisibility, timelineEventFor } from "./timeline.ts"
import { canWrite, memberScope, type Viewer } from "./visibility.ts"

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

function forbidden(): ActionResult {
  return { ok: false, error: labels.access.forbidden }
}

function invalid(error: Parameters<typeof fieldErrorsOf>[0]): ActionResult {
  return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(error) }
}

/** Pessoa ativa (não desativada) dentro do escopo de quem escreve. */
async function writableMember(user: Viewer, memberId: string) {
  return db.teamMember.findFirst({ where: { id: memberId, ...memberScope(user) }, select: { id: true } })
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
  user: Viewer,
  memberId: string,
  source: { origin: "ONE_ON_ONE"; sourceOneOnOneId: string } | { origin: "FEEDBACK"; sourceFeedbackId: string },
  rows: GeneratedAgreementInput[],
): Promise<string[]> {
  const ids: string[] = []
  for (const row of rows) {
    const due = businessDate(row.dueDate)
    const created = await tx.agreement.create({
      data: { memberId, title: row.title, originalDueDate: due, dueDate: due, authorUserId: user.id, ...source },
    })
    await recordTimelineEvents(tx, [timelineEventFor.agreementCreated(created)])
    ids.push(created.id)
  }
  return ids
}

export async function createOneOnOneRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = oneOnOneSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const data = parsed.data
  if (!(await writableMember(user, data.memberId))) return { ok: false, error: labels.validation.generic }

  await db.$transaction(async (tx) => {
    const created = await tx.oneOnOne.create({
      data: {
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
        authorUserId: user.id,
      },
    })
    await recordTimelineEvents(tx, [timelineEventFor.oneOnOne(created)])
    const agreementIds = await createGeneratedAgreements(
      tx,
      user,
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
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

export async function createFeedbackRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = feedbackSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const data = parsed.data
  if (!(await writableMember(user, data.memberId))) return { ok: false, error: labels.validation.generic }

  await db.$transaction(async (tx) => {
    const created = await tx.feedback.create({
      data: {
        memberId: data.memberId,
        date: businessDate(data.date),
        category: data.category,
        context: textOrNull(data.context),
        behavior: data.behavior,
        impact: textOrNull(data.impact),
        guidance: textOrNull(data.guidance),
        followUpAt: optionalBusinessDate(data.followUpAt),
        visibility: data.visibility,
        authorUserId: user.id,
      },
    })
    await recordTimelineEvents(tx, [timelineEventFor.feedback(created)])
    const agreementIds = await createGeneratedAgreements(
      tx,
      user,
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
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

export async function createNoteRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = noteSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const data = parsed.data
  if (!(await writableMember(user, data.memberId))) return { ok: false, error: labels.validation.generic }

  // Anotação de hoje guarda o instante real; retroativa, o meio-dia daquele dia.
  const day = businessDate(data.date)
  const occurredAt = day.getTime() === todayBusinessDate().getTime() ? new Date() : businessDateAtNoon(day)

  await db.$transaction(async (tx) => {
    const created = await tx.note.create({
      data: {
        memberId: data.memberId,
        occurredAt,
        title: data.title,
        body: data.body,
        visibility: data.visibility,
        authorUserId: user.id,
      },
    })
    await recordTimelineEvents(tx, [timelineEventFor.note(created)])
    await writeAudit(
      {
        action: "note.create",
        entity: "Note",
        entityId: created.id,
        after: { memberId: created.memberId, occurredAt: occurredAt.toISOString(), visibility: created.visibility },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
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
export async function setRecordVisibilityRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = recordVisibilitySchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const { eventId, visibility } = parsed.data

  const found = await findToggleableSource(user, eventId)
  if (!found) return { ok: false, error: labels.validation.generic }
  if (found.visibility === visibility) return { ok: true }
  const { source } = found

  await db.$transaction(async (tx) => {
    const where = { id: source.id, memberId: found.memberId }
    if (source.kind === "oneOnOne") await tx.oneOnOne.update({ where, data: { visibility } })
    if (source.kind === "feedback") await tx.feedback.update({ where, data: { visibility } })
    if (source.kind === "note") await tx.note.update({ where, data: { visibility } })
    await syncTimelineVisibility(tx, source, visibility)
    await writeAudit(
      {
        action: "record.visibility.update",
        entity: SOURCE_ENTITY[source.kind],
        entityId: source.id,
        before: { visibility: found.visibility },
        after: { visibility },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}
