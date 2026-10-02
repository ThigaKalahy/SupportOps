import { parseDisplayDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import { dailySchema } from "../lib/validators/daily.ts"

import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { teamFor } from "./queries/dailies.ts"
import { recordTimelineEvents, timelineEventFor, type TimelineEventInput } from "./timeline.ts"
import { canWrite, memberScope, type Viewer } from "./visibility.ts"

/**
 * Registro de daily (núcleo da Server Action de src/actions/dailies.ts). Tudo
 * numa ÚNICA transação: Daily, DailyParticipants, AgreementCheckins,
 * atualizações de Agreement, Agreements novos, linhas da timeline e AuditLog.
 *
 * Desfechos (D11, D12, D17):
 * - Feito: status DONE, completedAt = data da daily, checkin DONE, linha AGREEMENT_DONE.
 * - Parcial/Não feito + reagendar: estende o dueDate do MESMO combinado e grava
 *   o novo prazo no checkin. Não muda status nem cria registro; originalDueDate
 *   intocado (o banco recusa alterá-lo).
 * - Parcial/Não feito + substituir: o antigo vai para CANCELLED e o novo nasce
 *   com replacesAgreementId apontando para ele.
 *
 * Timeline: uma linha DAILY por pessoa com nota, bloqueio ou combinado revisado.
 * Presença sem nota e sem combinado não gera linha.
 */

export type DailyResult = { ok: true; id: string } | Extract<ActionResult, { ok: false }>

type Outcome = "DONE" | "PARTIAL" | "NOT_DONE"

function date(value: string): Date {
  const parsed = parseDisplayDate(value)
  if (!parsed) throw new Error(`Data inválida após validação: ${value}`)
  return parsed
}

export async function createDailyRecord(user: Viewer, input: unknown): Promise<DailyResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = dailySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const data = parsed.data
  const day = date(data.date)

  const team = await teamFor(user)
  if (!team) return { ok: false, error: labels.validation.generic }

  // Tudo o que o formulário referencia precisa existir no time e no escopo de quem escreve.
  const memberIds = new Set([...data.participants.map((p) => p.memberId), ...data.newAgreements.map((a) => a.memberId)])
  const reviewIds = data.reviews.map((r) => r.agreementId)
  const reasonIds = [...new Set(data.reviews.map((r) => r.blockerReasonId).filter(Boolean))]
  const [members, agreements, reasons] = await Promise.all([
    db.teamMember.findMany({
      where: { id: { in: [...memberIds] }, teamId: team.id, ...memberScope(user) },
      select: { id: true },
    }),
    db.agreement.findMany({
      where: { id: { in: reviewIds }, member: { ...memberScope(user), teamId: team.id } },
      select: {
        id: true,
        memberId: true,
        title: true,
        description: true,
        origin: true,
        priority: true,
        status: true,
        dueDate: true,
        createdAt: true,
      },
    }),
    db.blockerReason.count({ where: { id: { in: reasonIds }, organizationId: user.organizationId } }),
  ])
  if (members.length !== memberIds.size || reasons !== reasonIds.length || new Set(reviewIds).size !== reviewIds.length) {
    return { ok: false, error: labels.validation.generic }
  }
  const byId = new Map(agreements.map((a) => [a.id, a]))
  if (reviewIds.some((id) => byId.get(id)?.status !== "OPEN" && byId.get(id)?.status !== "IN_PROGRESS")) {
    return { ok: false, error: labels.dailies.validation.agreementClosed }
  }

  let dailyId: string
  try {
    dailyId = await db.$transaction(
      async (tx) => {
        const daily = await tx.daily.create({
          data: {
            teamId: team.id,
            date: day,
            summary: textOrNull(data.summary),
            decisions: textOrNull(data.decisions),
            authorUserId: user.id,
          },
        })

        await tx.dailyParticipant.createMany({
          data: data.participants.map((p) => {
            const text = textOrNull(p.note)
            return {
              dailyId: daily.id,
              memberId: p.memberId,
              present: p.present,
              note: p.isBlocker ? null : text,
              blocker: p.isBlocker ? text : null,
            }
          }),
        })

        const timeline: TimelineEventInput[] = []
        const reviewedBy = new Map<string, Record<Outcome, number>>()
        let rescheduled = 0
        let replaced = 0

        for (const review of data.reviews) {
          const agreement = byId.get(review.agreementId)!
          const counts = reviewedBy.get(agreement.memberId) ?? { DONE: 0, PARTIAL: 0, NOT_DONE: 0 }
          counts[review.outcome]++
          reviewedBy.set(agreement.memberId, counts)

          // Condição de status no UPDATE: se outra tela encerrou o combinado no meio, a daily inteira volta.
          const open = { id: agreement.id, status: { in: ["OPEN" as const, "IN_PROGRESS" as const] } }
          const checkin = {
            agreementId: agreement.id,
            dailyId: daily.id,
            outcome: review.outcome,
            authorUserId: user.id,
          }

          if (review.outcome === "DONE") {
            const done = await tx.agreement.updateMany({ where: open, data: { status: "DONE", completedAt: day } })
            if (done.count !== 1) throw new ClosedAgreementError()
            await tx.agreementCheckin.create({ data: checkin })
            timeline.push(
              timelineEventFor.agreementDone({ ...agreement, completedAt: day, outcome: null, authorUserId: user.id }),
            )
            continue
          }

          const blocker = { blockerText: review.blockerText, blockerReasonId: review.blockerReasonId || null }
          if (review.action === "reschedule") {
            const newDueDate = date(review.newDueDate)
            const moved = await tx.agreement.updateMany({ where: open, data: { dueDate: newDueDate } })
            if (moved.count !== 1) throw new ClosedAgreementError()
            await tx.agreementCheckin.create({ data: { ...checkin, ...blocker, newDueDate } })
            rescheduled++
            continue
          }

          const cancelled = await tx.agreement.updateMany({ where: open, data: { status: "CANCELLED" } })
          if (cancelled.count !== 1) throw new ClosedAgreementError()
          const due = date(review.replacementDueDate)
          const replacement = await tx.agreement.create({
            data: {
              memberId: agreement.memberId,
              title: review.replacementTitle,
              origin: "DAILY",
              sourceDailyId: daily.id,
              priority: agreement.priority,
              originalDueDate: due,
              dueDate: due,
              replacesAgreementId: agreement.id,
              authorUserId: user.id,
            },
          })
          await tx.agreementCheckin.create({ data: { ...checkin, ...blocker } })
          timeline.push(timelineEventFor.agreementCreated(replacement))
          replaced++
        }

        for (const row of data.newAgreements) {
          const due = date(row.dueDate)
          const created = await tx.agreement.create({
            data: {
              memberId: row.memberId,
              title: row.title,
              origin: "DAILY",
              sourceDailyId: daily.id,
              originalDueDate: due,
              dueDate: due,
              authorUserId: user.id,
            },
          })
          timeline.push(timelineEventFor.agreementCreated(created))
        }

        // Uma linha DAILY por pessoa com nota, bloqueio ou combinado revisado.
        const people = new Set([...data.participants.map((p) => p.memberId), ...reviewedBy.keys()])
        for (const memberId of people) {
          const participant = data.participants.find((p) => p.memberId === memberId)
          const text = textOrNull(participant?.note)
          const line = timelineEventFor.dailyParticipation({
            dailyId: daily.id,
            memberId,
            date: day,
            note: participant?.isBlocker ? null : text,
            blocker: participant?.isBlocker ? text : null,
            authorUserId: user.id,
            reviewed: reviewedBy.get(memberId),
          })
          if (line) timeline.push(line)
        }

        await recordTimelineEvents(tx, timeline)
        await writeAudit(
          {
            action: "daily.create",
            entity: "Daily",
            entityId: daily.id,
            after: {
              date: data.date,
              present: data.participants.filter((p) => p.present).length,
              absent: data.participants.filter((p) => !p.present).length,
              reviewed: data.reviews.length,
              done: data.reviews.filter((r) => r.outcome === "DONE").length,
              rescheduled,
              replaced,
              created: data.newAgreements.length,
            },
          },
          { organizationId: user.organizationId, userId: user.id, tx },
        )
        return daily.id
      },
      // Uma daily cheia são dezenas de escritas; o padrão de 5s do Prisma é curto para o Neon.
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (error instanceof ClosedAgreementError) return { ok: false, error: error.message }
    throw error
  }

  return { ok: true, id: dailyId }
}

export class ClosedAgreementError extends Error {
  constructor() {
    super(labels.dailies.validation.agreementClosed)
    this.name = "ClosedAgreementError"
  }
}
