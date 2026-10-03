import type { AgreementStatus, TimelineEventType, Visibility } from "@prisma/client"

import { businessDaysBetween, daysSince, formatDate, todayBusinessDate } from "../../lib/dates.ts"
import { enumLabel, fill, labels } from "../../lib/labels.ts"
import { deadlineSeverity, type Severity } from "../../lib/severity.ts"
import { periodStart, type TimelineFilters } from "../../lib/timeline-filters.ts"
import { db } from "../db.ts"
import { memberScope, visibilityFilter, type Viewer } from "../visibility.ts"

import { getThresholds } from "./thresholds.ts"

/**
 * Timeline de uma pessoa (/team/[memberId]/timeline): páginas de 40 por
 * cursor, filtradas por tipo, período e texto, sempre com `visibilityFilter`.
 *
 * Cada item já sai com o que a calha precisa — o marcador (severidade e se
 * "sangra" na calha) — e com os combinados vinculados e o status atual deles.
 * Pendência que sangra: combinado ainda aberto vencendo ou vencido; revisão
 * marcada no último 1:1 e não cumprida; PDI ativo sem acompanhamento há mais
 * de 45 dias. O resto não perturba a calha.
 */

export const TIMELINE_PAGE = 40

export interface TimelineMarker {
  severity: Severity
  strong: boolean
  /** Exige ação ou está vencido: o traço sangra para dentro da calha. */
  bleed: boolean
  /** Frase da pendência (ex.: "Revisão marcada para 19/08/2026"), quando há. */
  note: string | null
}

export interface LinkedAgreement {
  id: string
  title: string
  status: AgreementStatus
  dueDate: Date
  reschedules: number
  pill: { severity: Severity; strong: boolean; label: string }
}

export interface TimelineItem {
  id: string
  type: TimelineEventType
  occurredAt: Date
  title: string
  summary: string | null
  tags: string[]
  visibility: Visibility
  author: string
  /** 1:1, feedback e anotação têm visibilidade própria; o resto é sempre compartilhado. */
  toggleable: boolean
  /** Registro de origem editável (1:1, feedback, anotação); null nos demais tipos. */
  source: { kind: "oneOnOne" | "feedback" | "note"; id: string } | null
  marker: TimelineMarker
  /** "self": o evento é do próprio combinado; "sourced": combinados que o registro gerou. */
  agreements: { kind: "self" | "sourced"; items: LinkedAgreement[] } | null
}

export interface TimelinePage {
  items: TimelineItem[]
  nextCursor: string | null
}

const CALM: TimelineMarker = { severity: "neutral", strong: false, bleed: false, note: null }

function agreementPill(status: AgreementStatus, dueDate: Date, today: Date): LinkedAgreement["pill"] {
  if (status === "DONE") return { severity: "calm", strong: false, label: enumLabel("agreementStatus", "DONE") }
  if (status === "CANCELLED") return { severity: "neutral", strong: false, label: enumLabel("agreementStatus", "CANCELLED") }
  const deadline = deadlineSeverity(dueDate, { today })
  return { severity: deadline.severity, strong: deadline.strong, label: deadline.label }
}

function linked(
  a: { id: string; title: string; status: AgreementStatus; dueDate: Date; _count: { checkins: number } },
  today: Date,
): LinkedAgreement {
  return {
    id: a.id,
    title: a.title,
    status: a.status,
    dueDate: a.dueDate,
    reschedules: a._count.checkins,
    pill: agreementPill(a.status, a.dueDate, today),
  }
}

const agreementSelect = {
  id: true,
  title: true,
  status: true,
  dueDate: true,
  _count: { select: { checkins: { where: { newDueDate: { not: null } } } } },
} as const

export async function getTimelinePage(
  viewer: Viewer,
  memberId: string,
  filters: TimelineFilters,
  cursor?: string | null,
): Promise<TimelinePage> {
  const since = periodStart(filters.period)
  const thresholds = await getThresholds(viewer)
  const rows = await db.timelineEvent.findMany({
    where: {
      memberId,
      member: memberScope(viewer),
      ...visibilityFilter(viewer),
      ...(filters.types.length ? { type: { in: filters.types } } : {}),
      ...(since ? { occurredAt: { gte: since } } : {}),
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: "insensitive" as const } },
              { summary: { contains: filters.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: TIMELINE_PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: { select: { name: true } },
      agreement: { select: agreementSelect },
      developmentPlan: { select: { status: true, lastReviewedAt: true, startedAt: true } },
    },
  })

  const page = rows.slice(0, TIMELINE_PAGE)
  const nextCursor = rows.length > TIMELINE_PAGE ? (page[page.length - 1]?.id ?? null) : null
  const today = todayBusinessDate()

  const oneOnOneIds = page.flatMap((e) => (e.oneOnOneId ? [e.oneOnOneId] : []))
  const feedbackIds = page.flatMap((e) => (e.feedbackId ? [e.feedbackId] : []))
  const dailyIds = page.flatMap((e) => (e.dailyId ? [e.dailyId] : []))

  const [sourced, lastOneOnOne] = await Promise.all([
    oneOnOneIds.length + feedbackIds.length + dailyIds.length
      ? db.agreement.findMany({
          where: {
            memberId,
            OR: [
              { sourceOneOnOneId: { in: oneOnOneIds } },
              { sourceFeedbackId: { in: feedbackIds } },
              { sourceDailyId: { in: dailyIds } },
            ],
          },
          orderBy: { createdAt: "asc" },
          select: { ...agreementSelect, sourceOneOnOneId: true, sourceFeedbackId: true, sourceDailyId: true },
        })
      : Promise.resolve([]),
    // A revisão marcada só é pendência no 1:1 mais recente que a pessoa pode ver.
    db.oneOnOne.findFirst({
      where: { memberId, member: memberScope(viewer), ...visibilityFilter(viewer) },
      orderBy: { date: "desc" },
      select: { id: true, nextReviewAt: true },
    }),
  ])

  const items = page.map((event): TimelineItem => {
    let marker = CALM
    let agreements: TimelineItem["agreements"] = null

    if (event.agreement) {
      const a = event.agreement
      agreements = { kind: "self", items: [linked(a, today)] }
      if ((a.status === "OPEN" || a.status === "IN_PROGRESS") && event.type === "AGREEMENT") {
        const deadline = deadlineSeverity(a.dueDate, { today })
        if (deadline.severity !== "neutral") {
          marker = { severity: deadline.severity, strong: deadline.strong, bleed: true, note: null }
        }
      }
    } else {
      const own = sourced.filter(
        (a) =>
          (event.oneOnOneId && a.sourceOneOnOneId === event.oneOnOneId) ||
          (event.feedbackId && a.sourceFeedbackId === event.feedbackId) ||
          (event.dailyId && a.sourceDailyId === event.dailyId),
      )
      if (own.length) agreements = { kind: "sourced", items: own.map((a) => linked(a, today)) }
    }

    if (event.oneOnOneId && lastOneOnOne?.id === event.oneOnOneId && lastOneOnOne.nextReviewAt) {
      const review = deadlineSeverity(lastOneOnOne.nextReviewAt, { today })
      if (review.severity !== "neutral") {
        marker = {
          severity: review.severity,
          strong: review.strong,
          bleed: true,
          note: fill(labels.timeline.reviewDue, { date: formatDate(lastOneOnOne.nextReviewAt, "business") }),
        }
      }
    }

    const plan = event.developmentPlan
    if (plan?.status === "ACTIVE") {
      const days = plan.lastReviewedAt ? daysSince(plan.lastReviewedAt) : businessDaysBetween(plan.startedAt, today)
      if (days > thresholds.stalePlanDays) {
        marker = { severity: "attention", strong: true, bleed: true, note: fill(labels.timeline.stalePlan, { days }) }
      }
    }

    return {
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      title: event.title,
      summary: event.summary,
      tags: event.tags,
      visibility: event.visibility,
      author: event.author.name,
      toggleable: Boolean(event.oneOnOneId || event.feedbackId || event.noteId),
      source: event.oneOnOneId
        ? { kind: "oneOnOne", id: event.oneOnOneId }
        : event.feedbackId
          ? { kind: "feedback", id: event.feedbackId }
          : event.noteId
            ? { kind: "note", id: event.noteId }
            : null,
      marker,
      agreements,
    }
  })

  return { items, nextCursor }
}
