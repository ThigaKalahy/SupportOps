import type { AgreementOrigin, AgreementPriority, AgreementStatus, WatchHeat } from "@prisma/client"

import { parseDisplayDate } from "../lib/dates.ts"
import { fill, labels } from "../lib/labels.ts"
import { MODULES } from "../lib/modules.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import { dailySchema, editDailySchema, type DailyInput } from "../lib/validators/daily.ts"

import { auditOf, writeAudit } from "./audit.ts"
import { linkPendingWatchItems, recordWatchReview } from "./watch.ts"
import { db } from "./db.ts"
import { teamFor } from "./queries/dailies.ts"
import { findActiveWatchForLink, findWatchForWrite } from "./queries/watch.ts"
import {
  moveAgreementDoneEvents,
  moveAgreementEvents,
  recordTimelineEvents,
  removeTimelineEvents,
  replaceTimelineEvents,
  syncTimelineContent,
  timelineEventFor,
  type TimelineEventInput,
} from "./timeline.ts"
import { hasModule, requireManager, teamScope, type TeamContext } from "./scope.ts"

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

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

type ReviewInput = DailyInput["reviews"][number]
type RowInput = DailyInput["newAgreements"][number]
type ReviewAgreement = {
  id: string
  memberId: string
  title: string
  description: string | null
  origin: AgreementOrigin
  priority: AgreementPriority
  status: AgreementStatus
  dueDate: Date
  createdAt: Date
  centralId: string | null
  watchItemId: string | null
}
type CaseWatch = Map<string, { id: string; heat: WatchHeat; lastReviewedAt: Date }>
type Fail = Extract<ActionResult, { ok: false }>

/**
 * Confere tudo o que o formulário referencia (pessoas, combinados a revisar, motivos,
 * centrais) no time e lê, antes da transação, a observação de cada "próximo passo".
 */
async function prepare(
  ctx: TeamContext,
  reviews: ReviewInput[],
  memberIds: Set<string>,
  rows: { centralId: string }[],
): Promise<Fail | { byId: Map<string, ReviewAgreement>; caseWatch: CaseWatch }> {
  const reviewIds = reviews.map((r) => r.agreementId)
  const reasonIds = [...new Set(reviews.map((r) => r.blockerReasonId).filter(Boolean))]
  const [members, agreements, reasons] = await Promise.all([
    db.teamMember.findMany({ where: { ...teamScope(ctx), id: { in: [...memberIds] } }, select: { id: true } }),
    db.agreement.findMany({
      where: { ...teamScope(ctx), id: { in: reviewIds } },
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
        centralId: true,
        watchItemId: true,
      },
    }),
    db.blockerReason.count({ where: { ...teamScope(ctx), id: { in: reasonIds } } }),
  ])
  // Central de cada combinado (P19): opcional, mas se vier precisa ser ativa, do time e com o módulo ligado.
  const centralIds = [...new Set(rows.map((a) => a.centralId).filter(Boolean))]
  if (centralIds.length && !hasModule(ctx, MODULES.CENTRALS)) return { ok: false, error: labels.validation.generic }
  const validCentrals = centralIds.length
    ? await db.central.count({ where: { ...teamScope(ctx), id: { in: centralIds }, isActive: true, deletedAt: null } })
    : 0
  if (validCentrals !== centralIds.length) return { ok: false, error: labels.validation.generic }
  if (members.length !== memberIds.size || reasons !== reasonIds.length || new Set(reviewIds).size !== reviewIds.length) {
    return { ok: false, error: labels.validation.generic }
  }
  const byId = new Map(agreements.map((a) => [a.id, a]))
  if (reviewIds.some((id) => byId.get(id)?.status !== "OPEN" && byId.get(id)?.status !== "IN_PROGRESS")) {
    return { ok: false, error: labels.dailies.validation.agreementClosed }
  }
  // Próximo passo: a observação ATIVA do caso (a ligada ao combinado ou a que nasceu dele).
  const caseWatch: CaseWatch = new Map()
  for (const review of reviews) {
    const agreement = byId.get(review.agreementId)
    if (review.outcome !== "DONE" || !review.nextTitle || !agreement) continue
    const linked = agreement.watchItemId ? await findWatchForWrite(ctx, agreement.watchItemId) : null
    const origin = linked?.status === "ACTIVE" ? null : await findActiveWatchForLink(ctx, { agreementId: agreement.id })
    const watch = linked?.status === "ACTIVE" ? linked : origin ? await findWatchForWrite(ctx, origin.id) : null
    if (watch) caseWatch.set(agreement.id, { id: watch.id, heat: watch.heat, lastReviewedAt: watch.lastReviewedAt })
  }
  return { byId, caseWatch }
}

/**
 * Desfechos (D11, D12, D17), na transação da daily. Conta por pessoa em `reviewedBy`
 * e acrescenta as linhas da timeline em `timeline`.
 */
async function applyReviews(
  tx: Tx,
  ctx: TeamContext,
  dailyId: string,
  day: Date,
  reviews: ReviewInput[],
  prepared: { byId: Map<string, ReviewAgreement>; caseWatch: CaseWatch },
  timeline: TimelineEventInput[],
  reviewedBy: Map<string, Record<Outcome, number>>,
) {
  const counts = { rescheduled: 0, replaced: 0, nextSteps: 0 }
  for (const review of reviews) {
    const agreement = prepared.byId.get(review.agreementId)!
    const mine = reviewedBy.get(agreement.memberId) ?? { DONE: 0, PARTIAL: 0, NOT_DONE: 0 }
    mine[review.outcome]++
    reviewedBy.set(agreement.memberId, mine)

    // Condição de status no UPDATE: se outra tela encerrou o combinado no meio, a daily inteira volta.
    const open = { ...teamScope(ctx), id: agreement.id, status: { in: ["OPEN" as const, "IN_PROGRESS" as const] } }
    const checkin = { ...teamScope(ctx), agreementId: agreement.id, dailyId, outcome: review.outcome, authorUserId: ctx.userId }

    if (review.outcome === "DONE") {
      const done = await tx.agreement.updateMany({ where: open, data: { status: "DONE", completedAt: day } })
      if (done.count !== 1) throw new ClosedAgreementError()
      await tx.agreementCheckin.create({ data: checkin })
      timeline.push(timelineEventFor.agreementDone({ ...agreement, completedAt: day, outcome: null, authorUserId: ctx.userId }))
      // Próximo passo: o combinado foi cumprido, mas o caso seguiu por outro caminho. Nasce um
      // combinado novo da mesma pessoa, cliente e observação; o que mudou vira o porquê dele
      // e a revisão da observação (sem passar por "Parcial", que não seria verdade).
      if (review.nextTitle) {
        const watch = prepared.caseWatch.get(agreement.id) ?? null
        const nextDue = date(review.nextDueDate)
        const next = await tx.agreement.create({
          data: {
            ...teamScope(ctx),
            memberId: agreement.memberId,
            title: review.nextTitle,
            description: review.nextNote,
            origin: "DAILY",
            sourceDailyId: dailyId,
            priority: agreement.priority,
            centralId: nextCentral(ctx, review, agreement),
            watchItemId: watch?.id ?? agreement.watchItemId,
            originalDueDate: nextDue,
            dueDate: nextDue,
            authorUserId: ctx.userId,
          },
        })
        timeline.push(timelineEventFor.agreementCreated(next))
        if (watch) {
          await recordWatchReview(tx, ctx, watch, fill(labels.dailies.review.nextReview, { note: review.nextNote, title: review.nextTitle }))
        }
        counts.nextSteps++
      }
      continue
    }

    const blocker = { blockerText: review.blockerText, blockerReasonId: review.blockerReasonId || null }
    if (review.action === "reschedule") {
      const newDueDate = date(review.newDueDate)
      const moved = await tx.agreement.updateMany({ where: open, data: { dueDate: newDueDate } })
      if (moved.count !== 1) throw new ClosedAgreementError()
      await tx.agreementCheckin.create({ data: { ...checkin, ...blocker, newDueDate } })
      counts.rescheduled++
      continue
    }

    const cancelled = await tx.agreement.updateMany({ where: open, data: { status: "CANCELLED" } })
    if (cancelled.count !== 1) throw new ClosedAgreementError()
    const due = date(review.replacementDueDate)
    const replacement = await tx.agreement.create({
      data: {
        ...teamScope(ctx),
        memberId: agreement.memberId,
        title: review.replacementTitle,
        origin: "DAILY",
        sourceDailyId: dailyId,
        priority: agreement.priority,
        // O substituto continua tratando o mesmo cliente e a mesma observação.
        centralId: agreement.centralId,
        watchItemId: agreement.watchItemId,
        originalDueDate: due,
        dueDate: due,
        replacesAgreementId: agreement.id,
        authorUserId: ctx.userId,
      },
    })
    await tx.agreementCheckin.create({ data: { ...checkin, ...blocker } })
    timeline.push(timelineEventFor.agreementCreated(replacement))
    counts.replaced++
  }
  return counts
}

/** Centrais escolhidas nos próximos passos, para a mesma conferência das linhas da Seção 3. */
function nextCentrals(reviews: ReviewInput[]) {
  return reviews.filter((r) => r.outcome === "DONE" && r.nextTitle).map((r) => ({ centralId: r.nextCentralId }))
}

/** Próximo passo trata o mesmo cliente: a central escolhida na linha, ou a do combinado feito (C12). */
function nextCentral(ctx: TeamContext, review: ReviewInput, agreement: ReviewAgreement) {
  if (!hasModule(ctx, MODULES.CENTRALS)) return agreement.centralId
  return review.nextCentralId || agreement.centralId
}

/** Combinados de hoje (Seção 3): origem DAILY, prazo original = prazo (D17, D28). */
async function createRows(tx: Tx, ctx: TeamContext, dailyId: string, rows: RowInput[], timeline: TimelineEventInput[]) {
  const ids: string[] = []
  for (const row of rows) {
    const due = date(row.dueDate)
    const created = await tx.agreement.create({
      data: {
        ...teamScope(ctx),
        memberId: row.memberId,
        centralId: row.centralId || null,
        title: row.title,
        description: hasModule(ctx, MODULES.AGREEMENT_WHY) ? textOrNull(row.why) : null,
        origin: "DAILY",
        sourceDailyId: dailyId,
        originalDueDate: due,
        dueDate: due,
        authorUserId: ctx.userId,
      },
    })
    timeline.push(timelineEventFor.agreementCreated(created))
    // P21: observação marcada na linha antes de salvar passa a apontar para o combinado.
    await linkPendingWatchItems(tx, ctx, row.watchIds, { agreementId: created.id }, { centralId: created.centralId })
    ids.push(created.id)
  }
  return ids
}

export async function createDailyRecord(ctx: TeamContext, input: unknown): Promise<DailyResult> {
  requireManager(ctx)
  const parsed = dailySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const data = parsed.data
  const day = date(data.date)

  const team = await teamFor(ctx)
  if (!team) return { ok: false, error: labels.validation.generic }
  // C10: uma daily por data. Pega também a página aberta desde outro dia.
  const taken = await db.daily.findFirst({ where: { ...teamScope(ctx), date: day }, select: { id: true } })
  if (taken) return { ok: false, error: fill(labels.dailies.sameDay.taken, { date: data.date }) }

  const memberIds = new Set([...data.participants.map((p) => p.memberId), ...data.newAgreements.map((a) => a.memberId)])
  const prepared = await prepare(ctx, data.reviews, memberIds, [...data.newAgreements, ...nextCentrals(data.reviews)])
  if ("ok" in prepared) return prepared

  let dailyId: string
  try {
    dailyId = await db.$transaction(
      async (tx) => {
        const daily = await tx.daily.create({
          data: {
            ...teamScope(ctx),
            date: day,
            summary: textOrNull(data.summary),
            decisions: textOrNull(data.decisions),
            // P25: o travamento (DRAFT) é do P26; até lá toda daily nasce fechada.
            status: "CLOSED",
            authorUserId: ctx.userId,
          },
        })

        await tx.dailyParticipant.createMany({
          data: data.participants.map((p) => {
            const text = textOrNull(p.note)
            return {
              ...teamScope(ctx),
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
        const counts = await applyReviews(tx, ctx, daily.id, day, data.reviews, prepared, timeline, reviewedBy)
        await createRows(tx, ctx, daily.id, data.newAgreements, timeline)
        // P21: observações marcadas nas notas e nas linhas desta daily passam a apontar para ela.
        await linkPendingWatchItems(
          tx,
          ctx,
          [...data.participants.flatMap((p) => p.watchIds), ...data.newAgreements.flatMap((a) => a.watchIds)],
          { dailyId: daily.id },
        )

        // Uma linha DAILY por pessoa com nota, bloqueio ou combinado revisado.
        timeline.push(...participationLines(daily.id, day, ctx.userId, data.participants, reviewedBy))
        await recordTimelineEvents(tx, ctx, timeline)
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
              ...counts,
              created: data.newAgreements.length,
            },
          },
          auditOf(ctx, tx),
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

/** Uma linha DAILY por pessoa com nota, bloqueio ou combinado revisado (presença sozinha não vira linha). */
function participationLines(
  dailyId: string,
  day: Date,
  authorUserId: string,
  participants: { memberId: string; note: string; isBlocker: boolean }[],
  reviewedBy: Map<string, Record<Outcome, number>>,
): TimelineEventInput[] {
  const lines: TimelineEventInput[] = []
  const people = new Set([...participants.map((p) => p.memberId), ...reviewedBy.keys()])
  for (const memberId of people) {
    const participant = participants.find((p) => p.memberId === memberId)
    const text = textOrNull(participant?.note)
    const line = timelineEventFor.dailyParticipation({
      dailyId,
      memberId,
      date: day,
      note: participant?.isBlocker ? null : text,
      blocker: participant?.isBlocker ? text : null,
      authorUserId,
      reviewed: reviewedBy.get(memberId),
    })
    if (line) lines.push(line)
  }
  return lines
}

/**
 * Edição de daily salva (C11), no formato da criação, numa transação:
 * - data (C10: leva junto o que a daily gravou com ela), resumo, decisões, presença e notas;
 * - revisões NOVAS dos combinados que ficaram sem desfecho (as gravadas não mudam);
 * - combinados criados nela: editar (texto, porquê, central, responsável, prazo) ou remover,
 *   só enquanto nenhuma daily os revisou; e linhas novas.
 * Prazo de combinado criado nela é correção de lançamento: o original acompanha o atual
 * (exceção à D17 ligada só nesta transação, como na troca de data).
 */
export async function updateDailyRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = editDailySchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const data = parsed.data
  const daily = await db.daily.findFirst({
    where: { ...teamScope(ctx), id: data.id },
    select: {
      id: true,
      date: true,
      summary: true,
      decisions: true,
      authorUserId: true,
      participants: { select: { memberId: true, present: true, note: true, blocker: true } },
      checkins: { select: { outcome: true, agreementId: true, newDueDate: true, agreement: { select: { memberId: true } } } },
      sourcedAgreements: {
        where: { deletedAt: null, replacesAgreementId: null },
        select: {
          id: true,
          memberId: true,
          centralId: true,
          title: true,
          description: true,
          dueDate: true,
          originalDueDate: true,
          status: true,
          _count: { select: { checkins: true } },
        },
      },
    },
  })
  if (!daily) return { ok: false, error: labels.validation.generic }
  const known = new Set(daily.participants.map((p) => p.memberId))
  const sent = new Set(data.participants.map((p) => p.memberId))
  if (sent.size !== data.participants.length || sent.size !== known.size || [...sent].some((id) => !known.has(id))) {
    return { ok: false, error: labels.validation.generic }
  }

  // C10: nova data. Uma daily por data: a data de outra daily do time é recusada.
  const day = date(data.date)
  const moved = day.getTime() !== daily.date.getTime()
  if (moved) {
    const taken = await db.daily.findFirst({ where: { ...teamScope(ctx), date: day, id: { not: daily.id } }, select: { id: true } })
    if (taken) {
      const message = fill(labels.dailies.sameDay.taken, { date: data.date })
      return { ok: false, error: message, fieldErrors: { date: message } }
    }
  }

  // Combinados criados nela: só os desta daily, e só os que nenhuma daily revisou.
  const existing = new Map(daily.sourcedAgreements.map((a) => [a.id, a]))
  const editable = (id: string) => {
    const a = existing.get(id)
    return a && a._count.checkins === 0 && (a.status === "OPEN" || a.status === "IN_PROGRESS") ? a : null
  }
  const changedRows = data.newAgreements.filter((r) => r.id)
  if (changedRows.some((r) => !editable(r.id))) return { ok: false, error: labels.dailies.edit.lockedRow }
  const newRows = data.newAgreements.filter((r) => !r.id && !r.remove)
  // Revisões novas: só de combinado que ainda não foi revisado nesta daily.
  const reviewedHere = new Set(daily.checkins.map((c) => c.agreementId))
  if (data.reviews.some((r) => reviewedHere.has(r.agreementId))) return { ok: false, error: labels.dailies.edit.alreadyReviewed }

  const memberIds = new Set([...data.newAgreements.filter((r) => !r.remove).map((r) => r.memberId)])
  const prepared = await prepare(ctx, data.reviews, memberIds, [
    ...data.newAgreements.filter((r) => !r.remove),
    ...nextCentrals(data.reviews),
  ])
  if ("ok" in prepared) return prepared

  const reviewedBy = new Map<string, Record<Outcome, number>>()
  for (const c of daily.checkins) {
    const counts = reviewedBy.get(c.agreement.memberId) ?? { DONE: 0, PARTIAL: 0, NOT_DONE: 0 }
    counts[c.outcome]++
    reviewedBy.set(c.agreement.memberId, counts)
  }

  try {
    await db.$transaction(
      async (tx) => {
        await tx.daily.update({
          where: { id: daily.id, ...teamScope(ctx) },
          data: { date: day, summary: textOrNull(data.summary), decisions: textOrNull(data.decisions) },
        })
        const dateChange = moved ? await moveDailyDate(tx, ctx, daily, day) : null

        for (const p of data.participants) {
          const text = textOrNull(p.note)
          await tx.dailyParticipant.update({
            where: { dailyId_memberId: { dailyId: daily.id, memberId: p.memberId }, ...teamScope(ctx) },
            data: { present: p.present, note: p.isBlocker ? null : text, blocker: p.isBlocker ? text : null },
          })
        }

        const timeline: TimelineEventInput[] = []
        const counts = await applyReviews(tx, ctx, daily.id, day, data.reviews, prepared, timeline, reviewedBy)

        // Combinados criados nela: correções e remoções.
        const rowChanges = { updated: 0, removed: 0, created: newRows.length }
        if (changedRows.length) {
          await tx.$queryRaw`SELECT set_config('prontuario.daily_date_change', 'on', true)`
        }
        for (const row of changedRows) {
          const before = editable(row.id)!
          if (row.remove) {
            await tx.agreement.update({ where: { id: before.id, ...teamScope(ctx) }, data: { deletedAt: new Date() } })
            await removeTimelineEvents(tx, ctx, { kind: "agreement", id: before.id })
            await writeAudit({ action: "agreement.delete", entity: "Agreement", entityId: before.id, before: auditRow(before) }, auditOf(ctx, tx))
            rowChanges.removed++
            continue
          }
          // A data da daily mudou junto: o prazo que era "o dia da daily" vai para o dia novo.
          const typed = date(row.dueDate)
          const due = moved && typed.getTime() === daily.date.getTime() ? day : typed
          const description = hasModule(ctx, MODULES.AGREEMENT_WHY) ? textOrNull(row.why) : before.description
          const after = {
            memberId: row.memberId,
            centralId: row.centralId || null,
            title: row.title,
            description,
            dueDate: due,
            originalDueDate: due,
          }
          const current = await tx.agreement.findFirst({
            where: { id: before.id, ...teamScope(ctx) },
            select: { memberId: true, centralId: true, title: true, description: true, dueDate: true },
          })
          if (
            current &&
            current.memberId === after.memberId &&
            current.centralId === after.centralId &&
            current.title === after.title &&
            current.description === after.description &&
            current.dueDate.getTime() === due.getTime()
          ) {
            continue
          }
          await tx.agreement.update({ where: { id: before.id, ...teamScope(ctx) }, data: after })
          await syncTimelineContent(tx, ctx, { kind: "agreement", id: before.id }, { title: row.title, summary: description }, "AGREEMENT")
          if (current && current.memberId !== row.memberId) await moveAgreementEvents(tx, ctx, before.id, row.memberId)
          await writeAudit(
            { action: "agreement.update", entity: "Agreement", entityId: before.id, before: auditRow(before), after: { ...after, via: "daily.edit" } },
            auditOf(ctx, tx),
          )
          rowChanges.updated++
        }
        await createRows(tx, ctx, daily.id, newRows, timeline)
        await linkPendingWatchItems(
          tx,
          ctx,
          [...data.participants.flatMap((p) => p.watchIds), ...newRows.flatMap((a) => a.watchIds)],
          { dailyId: daily.id },
        )

        await recordTimelineEvents(tx, ctx, timeline)
        await replaceTimelineEvents(
          tx,
          ctx,
          { kind: "daily", id: daily.id },
          "DAILY",
          participationLines(daily.id, day, daily.authorUserId, data.participants, reviewedBy),
        )
        await writeAudit(
          {
            action: "daily.update",
            entity: "Daily",
            entityId: daily.id,
            before: { date: daily.date, summary: daily.summary, decisions: daily.decisions, participants: daily.participants },
            after: {
              date: day,
              ...(dateChange ? { dateChange } : {}),
              summary: textOrNull(data.summary),
              decisions: textOrNull(data.decisions),
              participants: data.participants.map((p) => ({
                memberId: p.memberId,
                present: p.present,
                note: p.isBlocker ? null : textOrNull(p.note),
                blocker: p.isBlocker ? textOrNull(p.note) : null,
              })),
              reviewed: data.reviews.length,
              ...counts,
              agreements: rowChanges,
            },
          },
          auditOf(ctx, tx),
        )
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (error instanceof ClosedAgreementError) return { ok: false, error: error.message }
    throw error
  }
  return { ok: true }
}

function auditRow(a: { memberId: string; centralId: string | null; title: string; description: string | null; dueDate: Date; originalDueDate: Date }) {
  return { memberId: a.memberId, centralId: a.centralId, title: a.title, description: a.description, dueDate: a.dueDate, originalDueDate: a.originalDueDate }
}

/**
 * C10: a daily muda de data e leva junto o que gravou COM a data dela — conclusão
 * dos combinados feitos nela, prazo dos combinados criados nela e dos reagendados
 * nela para o próprio dia. Prazo diferente da data da daily foi escolhido e fica.
 * O prazo original (D17) só muda aqui, com a exceção ligada nesta transação.
 */
async function moveDailyDate(
  tx: Tx,
  ctx: TeamContext,
  daily: { id: string; date: Date; checkins: { outcome: Outcome; agreementId: string; newDueDate: Date | null }[] },
  day: Date,
) {
  const old = daily.date
  await tx.$queryRaw`SELECT set_config('prontuario.daily_date_change', 'on', true)`
  const doneIds = daily.checkins.filter((c) => c.outcome === "DONE").map((c) => c.agreementId)
  const completed = await tx.agreement.findMany({
    where: { ...teamScope(ctx), id: { in: doneIds }, status: "DONE", completedAt: old },
    select: { id: true },
  })
  const completedIds = completed.map((a) => a.id)
  await tx.agreement.updateMany({ where: { ...teamScope(ctx), id: { in: completedIds } }, data: { completedAt: day } })
  await moveAgreementDoneEvents(tx, ctx, completedIds, day)

  const rescheduledIds = daily.checkins.filter((c) => c.newDueDate?.getTime() === old.getTime()).map((c) => c.agreementId)
  await tx.agreementCheckin.updateMany({ where: { ...teamScope(ctx), dailyId: daily.id, newDueDate: old }, data: { newDueDate: day } })
  const rescheduled = await tx.agreement.updateMany({
    where: { ...teamScope(ctx), id: { in: rescheduledIds }, dueDate: old },
    data: { dueDate: day },
  })
  const due = await tx.agreement.updateMany({ where: { ...teamScope(ctx), sourceDailyId: daily.id, dueDate: old }, data: { dueDate: day } })
  const original = await tx.agreement.updateMany({
    where: { ...teamScope(ctx), sourceDailyId: daily.id, originalDueDate: old },
    data: { originalDueDate: day },
  })
  return { completed: completedIds.length, rescheduled: rescheduled.count, dueDate: due.count, originalDueDate: original.count }
}

export class ClosedAgreementError extends Error {
  constructor() {
    super(labels.dailies.validation.agreementClosed)
    this.name = "ClosedAgreementError"
  }
}
