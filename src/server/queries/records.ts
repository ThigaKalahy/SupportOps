import type { AgreementStatus, FeedbackCategory, Prisma, Visibility } from "@prisma/client"

import { todayBusinessDate } from "../../lib/dates.ts"
import { feedbackFollowUp, oneOnOneFollowUp, type FollowUpState } from "../../lib/follow-up.ts"
import { recordPeriodStart, type RecordFilters } from "../../lib/records-filters.ts"
import { deadlineSeverity, type DeadlineSeverity } from "../../lib/severity.ts"

import { db } from "../db.ts"
import { memberScope, visibilityFilter, type Viewer } from "../visibility.ts"

/**
 * Leituras de registros sensíveis: OneOnOne, Feedback, Note e TimelineEvent.
 *
 * Toda leitura desses quatro models no produto vive em src/server/queries e
 * aplica `visibilityFilter(viewer)` — VIEWER nunca recebe PRIVATE. Timeline,
 * busca, command palette e contadores usam estas funções (ou novas funções
 * aqui, com o mesmo filtro). tests/visibility.test.ts reprova qualquer leitura
 * fora deste padrão.
 */

export const TIMELINE_PAGE_SIZE = 40

/** Timeline de uma pessoa, mais recente primeiro, paginada por cursor. */
export function getMemberTimeline(viewer: Viewer, memberId: string, options: { cursor?: string; take?: number } = {}) {
  return db.timelineEvent.findMany({
    where: { memberId, member: memberScope(viewer), ...visibilityFilter(viewer) },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: options.take ?? TIMELINE_PAGE_SIZE,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  })
}

/** Busca textual nos registros (título e resumo das linhas da timeline). */
export function searchRecords(viewer: Viewer, term: string, take = 20) {
  const text = term.trim()
  if (!text) return Promise.resolve([])
  return db.timelineEvent.findMany({
    where: {
      member: memberScope(viewer),
      ...visibilityFilter(viewer),
      OR: [{ title: { contains: text, mode: "insensitive" } }, { summary: { contains: text, mode: "insensitive" } }],
    },
    orderBy: { occurredAt: "desc" },
    take,
  })
}

/** Contagem de registros por pessoa (contadores e indicadores de volume). */
export async function countRecordsByMember(viewer: Viewer, where: Prisma.TimelineEventWhereInput = {}) {
  const rows = await db.timelineEvent.groupBy({
    by: ["memberId"],
    where: { ...where, member: memberScope(viewer), ...visibilityFilter(viewer) },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.memberId, r._count._all]))
}

export function listOneOnOnes(viewer: Viewer, memberId: string) {
  return db.oneOnOne.findMany({
    where: { memberId, member: memberScope(viewer), ...visibilityFilter(viewer) },
    orderBy: { date: "desc" },
  })
}

export function listFeedbacks(viewer: Viewer, memberId: string) {
  return db.feedback.findMany({
    where: { memberId, member: memberScope(viewer), ...visibilityFilter(viewer) },
    orderBy: { date: "desc" },
  })
}

export function listNotes(viewer: Viewer, memberId: string) {
  return db.note.findMany({
    where: { memberId, member: memberScope(viewer), ...visibilityFilter(viewer) },
    orderBy: { occurredAt: "desc" },
  })
}

/**
 * Origem de uma linha da timeline cuja visibilidade pode ser alternada
 * (1:1, feedback ou anotação), para a escrita em src/server/records.ts.
 * null quando a linha não existe, está fora do escopo ou não tem
 * visibilidade própria (combinado, daily, PDI, mudança de carreira).
 */
export async function findToggleableSource(viewer: Viewer, eventId: string) {
  const event = await db.timelineEvent.findFirst({
    where: { id: eventId, member: memberScope(viewer), ...visibilityFilter(viewer) },
    select: { memberId: true, visibility: true, oneOnOneId: true, feedbackId: true, noteId: true },
  })
  if (!event) return null
  const source = event.oneOnOneId
    ? ({ kind: "oneOnOne", id: event.oneOnOneId } as const)
    : event.feedbackId
      ? ({ kind: "feedback", id: event.feedbackId } as const)
      : event.noteId
        ? ({ kind: "note", id: event.noteId } as const)
        : null
  return source ? { source, memberId: event.memberId, visibility: event.visibility } : null
}

/* ─────────────────────── Índice de 1:1 e feedbacks (P13) ─────────────────────── */

export interface RecordAgreement {
  id: string
  title: string
  status: AgreementStatus
  dueDate: Date
}

interface RecordRowBase {
  id: string
  date: Date
  member: { id: string; preferredName: string; fullName: string }
  visibility: Visibility
  followUp: FollowUpState
  agreements: RecordAgreement[]
  author: string
}

export type RecordRow =
  | (RecordRowBase & {
      kind: "oneOnOne"
      durationMinutes: number | null
      topics: string | null
      memberPerception: string | null
      managerPerception: string | null
      wins: string | null
      difficulties: string | null
      development: string | null
    })
  | (RecordRowBase & {
      kind: "feedback"
      category: FeedbackCategory
      context: string | null
      behavior: string
      impact: string | null
      guidance: string | null
    })

const agreementSelect = {
  where: { deletedAt: null },
  orderBy: { createdAt: "asc" as const },
  select: { id: true, title: true, status: true, dueDate: true },
}

/**
 * 1:1 e feedbacks numa lista só, do mais recente ao mais antigo, com o estado
 * do follow-up (src/lib/follow-up.ts) e os combinados gerados. VIEWER só vê
 * os SHARED — e só registros SHARED encerram pendência para ele.
 */
export async function listRecords(viewer: Viewer, filters: RecordFilters, today = todayBusinessDate()): Promise<RecordRow[]> {
  const start = recordPeriodStart(filters.period, today)
  const where = {
    member: memberScope(viewer),
    ...visibilityFilter(viewer),
    ...(filters.memberId ? { memberId: filters.memberId } : {}),
    ...(start ? { date: { gte: start } } : {}),
  }
  const wantOneOnOnes = filters.type !== "feedback" && !filters.category
  const wantFeedbacks = filters.type !== "oneOnOne"
  const member = { select: { id: true, preferredName: true, fullName: true } }
  const author = { select: { name: true } }

  const [oneOnOnes, feedbacks] = await Promise.all([
    wantOneOnOnes
      ? db.oneOnOne.findMany({
          where: { ...where, ...visibilityFilter(viewer) },
          include: { member, author, sourcedAgreements: agreementSelect },
        })
      : Promise.resolve([]),
    wantFeedbacks
      ? db.feedback.findMany({
          where: { ...where, ...visibilityFilter(viewer), ...(filters.category ? { category: filters.category } : {}) },
          include: { member, author, sourcedAgreements: agreementSelect },
        })
      : Promise.resolve([]),
  ])

  // Conversas que encerram follow-ups (mesma regra de visibilidade).
  const all = [...oneOnOnes, ...feedbacks]
  const memberIds = [...new Set(all.map((r) => r.memberId))]
  const earliest = all.reduce<Date | null>((min, r) => (!min || r.date < min ? r.date : min), null)
  const convWhere = {
    memberId: { in: memberIds },
    member: memberScope(viewer),
    ...visibilityFilter(viewer),
    ...(earliest ? { date: { gte: earliest } } : {}),
  }
  const [laterOneOnOnes, laterFeedbacks] =
    memberIds.length === 0
      ? [[], []]
      : await Promise.all([
          db.oneOnOne.findMany({
            where: { ...convWhere, ...visibilityFilter(viewer) },
            select: { id: true, memberId: true, date: true },
          }),
          db.feedback.findMany({
            where: { ...convWhere, ...visibilityFilter(viewer) },
            select: { id: true, memberId: true, date: true },
          }),
        ])
  const conversations = [
    ...laterOneOnOnes.map((c) => ({ ...c, kind: "oneOnOne" as const })),
    ...laterFeedbacks.map((c) => ({ ...c, kind: "feedback" as const })),
  ]
  const of = (memberId: string) => conversations.filter((c) => c.memberId === memberId)

  const rows: RecordRow[] = [
    ...oneOnOnes.map(
      (o): RecordRow => ({
        kind: "oneOnOne",
        id: o.id,
        date: o.date,
        member: o.member,
        visibility: o.visibility,
        author: o.author.name,
        agreements: o.sourcedAgreements,
        followUp: oneOnOneFollowUp(o, of(o.memberId), today),
        durationMinutes: o.durationMinutes,
        topics: o.topics,
        memberPerception: o.memberPerception,
        managerPerception: o.managerPerception,
        wins: o.wins,
        difficulties: o.difficulties,
        development: o.development,
      }),
    ),
    ...feedbacks.map(
      (f): RecordRow => ({
        kind: "feedback",
        id: f.id,
        date: f.date,
        member: f.member,
        visibility: f.visibility,
        author: f.author.name,
        agreements: f.sourcedAgreements,
        followUp: feedbackFollowUp(f, of(f.memberId), today),
        category: f.category,
        context: f.context,
        behavior: f.behavior,
        impact: f.impact,
        guidance: f.guidance,
      }),
    ),
  ]
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime() || a.member.preferredName.localeCompare(b.member.preferredName))
}

/* ─────────────────────── Painel de contexto do 1:1 (P13) ─────────────────────── */

export interface OneOnOneContext {
  /** O 1:1 anterior (o último que quem consulta pode ler) e o que ficou dele. */
  previous: {
    id: string
    date: Date
    topics: string | null
    difficulties: string | null
    development: string | null
    followUp: FollowUpState
    agreements: (RecordAgreement & { reschedules: number })[]
  } | null
  openAgreements: { id: string; title: string; dueDate: Date; reschedules: number; deadline: DeadlineSeverity }[]
  lastFeedback: {
    id: string
    date: Date
    category: FeedbackCategory
    behavior: string
    guidance: string | null
    followUp: FollowUpState
  } | null
  plans: {
    id: string
    objective: string
    lastReviewedAt: Date | null
    openActions: { id: string; description: string; dueDate: Date | null }[]
  }[]
}

const reschedules = { _count: { select: { checkins: { where: { newDueDate: { not: null } } } } } }

/**
 * Tudo o que o gestor precisa ver ao abrir um 1:1, somente leitura: o que
 * ficou do 1:1 anterior (revisão marcada, desenvolvimento, dificuldades e os
 * combinados gerados nele), os combinados em aberto, o último feedback e os
 * PDIs ativos com as ações em aberto.
 */
export async function getOneOnOneContext(viewer: Viewer, memberId: string, today = todayBusinessDate()): Promise<OneOnOneContext> {
  const scope = { memberId, member: memberScope(viewer) }
  const [previous, lastFeedback, open, plans] = await Promise.all([
    db.oneOnOne.findFirst({
      where: { ...scope, ...visibilityFilter(viewer) },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        sourcedAgreements: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, title: true, status: true, dueDate: true, ...reschedules },
        },
      },
    }),
    db.feedback.findFirst({
      where: { ...scope, ...visibilityFilter(viewer) },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    db.agreement.findMany({
      where: { ...scope, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, dueDate: true, ...reschedules },
    }),
    db.developmentPlan.findMany({
      where: { ...scope, status: "ACTIVE" },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        objective: true,
        lastReviewedAt: true,
        actions: {
          where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
          orderBy: [{ dueDate: "asc" }],
          take: 3,
          select: { id: true, description: true, dueDate: true },
        },
      },
    }),
  ])

  // Conversas a partir do follow-up do último feedback encerram a pendência dele.
  const after = lastFeedback?.followUpAt
    ? await db.oneOnOne.findMany({
        where: { ...scope, ...visibilityFilter(viewer), date: { gte: lastFeedback.followUpAt } },
        select: { id: true, date: true },
      })
    : []

  return {
    previous: previous
      ? {
          id: previous.id,
          date: previous.date,
          topics: previous.topics,
          difficulties: previous.difficulties,
          development: previous.development,
          // É o último 1:1 visível: não há 1:1 posterior que encerre a revisão.
          followUp: oneOnOneFollowUp(previous, [], today),
          agreements: previous.sourcedAgreements.map(({ _count, ...a }) => ({ ...a, reschedules: _count.checkins })),
        }
      : null,
    openAgreements: open.map((a) => ({
      id: a.id,
      title: a.title,
      dueDate: a.dueDate,
      reschedules: a._count.checkins,
      deadline: deadlineSeverity(a.dueDate, { today }),
    })),
    lastFeedback: lastFeedback
      ? {
          id: lastFeedback.id,
          date: lastFeedback.date,
          category: lastFeedback.category,
          behavior: lastFeedback.behavior,
          guidance: lastFeedback.guidance,
          followUp: feedbackFollowUp(
            lastFeedback,
            after.map((c) => ({ ...c, kind: "oneOnOne" as const })),
            today,
          ),
        }
      : null,
    plans: plans.map((p) => ({ id: p.id, objective: p.objective, lastReviewedAt: p.lastReviewedAt, openActions: p.actions })),
  }
}
