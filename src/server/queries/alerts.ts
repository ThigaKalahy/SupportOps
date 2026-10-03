import type { MemberStatus } from "@prisma/client"

import { trendWindows } from "../../lib/adherence.ts"
import type { AlertThresholds } from "../../lib/alert-thresholds.ts"
import { feedbackFollowUp } from "../../lib/follow-up.ts"

import { db } from "../db.ts"
import { memberScope, visibilityFilter, type Viewer } from "../visibility.ts"

import { getReadinessRows, type ReadinessRow } from "./development.ts"

/**
 * Fatos do motor de alertas (src/server/alerts.ts), lidos de uma vez para o
 * time inteiro — nada de N+1 por pessoa. Toda leitura de 1:1, feedback e
 * timeline passa por visibilityFilter: para o VIEWER, só o que é
 * compartilhado conta (um 1:1 privado não "resolve" um alerta que ele vê).
 */

export interface AlertMember {
  id: string
  preferredName: string
  fullName: string
  status: MemberStatus
  joinedAt: Date
  seniorityKey: string
  seniorityLabel: string
  lastOneOnOne: Date | null
  /** Último registro de qualquer tipo na timeline (visível para quem consulta). */
  lastRecordAt: Date | null
}

export interface AlertAgreement {
  id: string
  memberId: string
  title: string
  dueDate: Date
  reschedules: number
}

export interface AlertPlan {
  id: string
  memberId: string
  objective: string
  startedAt: Date
  lastReviewedAt: Date | null
}

export interface AlertFollowUp {
  id: string
  memberId: string
  behavior: string
  followUpAt: Date
}

export interface AlertWindows {
  current: { due: number; onTime: number }
  previous: { due: number; onTime: number }
}

export interface AlertFacts {
  members: AlertMember[]
  /** Abertos que vencem até hoje + dueSoonDays, ou com reagendamentos de crônico. */
  agreements: AlertAgreement[]
  plans: AlertPlan[]
  /** Follow-ups de feedback vencidos e ainda pendentes (sem 1:1 ou feedback na data ou depois). */
  followUps: AlertFollowUp[]
  adherence: Map<string, AlertWindows>
  /** Data da daily mais recente do time (null se nunca houve). */
  lastDaily: Date | null
  /** Prontidão (P14) — o alerta informativo usa só quem já atende a TODA a próxima senioridade. */
  readiness: ReadinessRow[]
}

const OPEN = ["OPEN", "IN_PROGRESS"] as const

/** Follow-ups mais antigos que isso não viram alerta: já viraram outra conversa (ou nenhuma). */
const FOLLOW_UP_HORIZON_DAYS = 120

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

export async function getAlertFacts(viewer: Viewer, today: Date, t: AlertThresholds, teamId?: string): Promise<AlertFacts> {
  const scope = { ...memberScope(viewer), ...(teamId ? { teamId } : {}) }
  const people = { ...scope, status: { not: "INACTIVE" as const } }
  const windows = trendWindows(today)

  const [members, lastOneOnOnes, lastRecords, agreements, plans, feedbacks, conversations, adherenceRows, lastDaily, readiness] =
    await Promise.all([
      db.teamMember.findMany({
        where: people,
        orderBy: { preferredName: "asc" },
        select: {
          id: true,
          preferredName: true,
          fullName: true,
          status: true,
          joinedAt: true,
          seniority: { select: { key: true, label: true } },
        },
      }),
      db.oneOnOne.groupBy({ by: ["memberId"], where: { member: people, ...visibilityFilter(viewer) }, _max: { date: true } }),
      db.timelineEvent.groupBy({ by: ["memberId"], where: { member: people, ...visibilityFilter(viewer) }, _max: { occurredAt: true } }),
      db.agreement.findMany({
        where: { member: people, status: { in: [...OPEN] } },
        select: {
          id: true,
          memberId: true,
          title: true,
          dueDate: true,
          _count: { select: { checkins: { where: { newDueDate: { not: null } } } } },
        },
        orderBy: { dueDate: "asc" },
      }),
      db.developmentPlan.findMany({
        where: { member: people, status: "ACTIVE" },
        select: { id: true, memberId: true, objective: true, startedAt: true, lastReviewedAt: true },
      }),
      db.feedback.findMany({
        where: {
          member: people,
          ...visibilityFilter(viewer),
          followUpAt: { lt: today, gte: addDays(today, -FOLLOW_UP_HORIZON_DAYS) },
        },
        select: { id: true, memberId: true, behavior: true, followUpAt: true },
      }),
      // Conversas que podem encerrar um follow-up (1:1 e feedback no horizonte), só as visíveis.
      Promise.all([
        db.oneOnOne.findMany({
          where: { member: people, ...visibilityFilter(viewer), date: { gte: addDays(today, -FOLLOW_UP_HORIZON_DAYS) } },
          select: { id: true, memberId: true, date: true },
        }),
        db.feedback.findMany({
          where: { member: people, ...visibilityFilter(viewer), date: { gte: addDays(today, -FOLLOW_UP_HORIZON_DAYS) } },
          select: { id: true, memberId: true, date: true },
        }),
      ]),
      db.agreement.findMany({
        where: { member: people, originalDueDate: { gte: windows.previous.from, lte: windows.current.to } },
        select: { memberId: true, status: true, originalDueDate: true, completedAt: true },
      }),
      db.daily.findFirst({
        where: { team: { organizationId: viewer.organizationId, ...(teamId ? { id: teamId } : {}) } },
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      getReadinessRows(viewer),
    ])

  const oneOnOneBy = new Map(lastOneOnOnes.map((r) => [r.memberId, r._max.date]))
  const recordBy = new Map(lastRecords.map((r) => [r.memberId, r._max.occurredAt]))
  const dueSoonLimit = addDays(today, t.dueSoonDays)

  const [ones, fbs] = conversations
  const talks = new Map<string, { id: string; kind: "oneOnOne" | "feedback"; date: Date }[]>()
  for (const o of ones) talks.set(o.memberId, [...(talks.get(o.memberId) ?? []), { id: o.id, kind: "oneOnOne", date: o.date }])
  for (const f of fbs) talks.set(f.memberId, [...(talks.get(f.memberId) ?? []), { id: f.id, kind: "feedback", date: f.date }])

  // Mesmas regras de src/lib/adherence.ts (isDue/isOnTime) para as duas janelas da tendência.
  const adherence = new Map<string, AlertWindows>()
  for (const a of adherenceRows) {
    const open = a.status === "OPEN" || a.status === "IN_PROGRESS"
    if (open && a.originalDueDate.getTime() >= today.getTime()) continue
    const w = adherence.get(a.memberId) ?? { current: { due: 0, onTime: 0 }, previous: { due: 0, onTime: 0 } }
    const bucket = a.originalDueDate.getTime() >= windows.current.from.getTime() ? w.current : w.previous
    bucket.due++
    if (a.status === "DONE" && a.completedAt && a.completedAt.getTime() <= a.originalDueDate.getTime()) bucket.onTime++
    adherence.set(a.memberId, w)
  }

  return {
    members: members.map((m) => ({
      id: m.id,
      preferredName: m.preferredName,
      fullName: m.fullName,
      status: m.status,
      joinedAt: m.joinedAt,
      seniorityKey: m.seniority.key,
      seniorityLabel: m.seniority.label,
      lastOneOnOne: oneOnOneBy.get(m.id) ?? null,
      lastRecordAt: recordBy.get(m.id) ?? null,
    })),
    agreements: agreements
      .map((a) => ({ id: a.id, memberId: a.memberId, title: a.title, dueDate: a.dueDate, reschedules: a._count.checkins }))
      .filter((a) => a.dueDate.getTime() <= dueSoonLimit.getTime() || a.reschedules >= t.chronicReschedules),
    plans,
    followUps: feedbacks.flatMap((f) => {
      if (!f.followUpAt) return []
      const state = feedbackFollowUp({ id: f.id, followUpAt: f.followUpAt }, talks.get(f.memberId) ?? [], today)
      return state.status === "pending" ? [{ id: f.id, memberId: f.memberId, behavior: f.behavior, followUpAt: f.followUpAt }] : []
    }),
    adherence,
    lastDaily: lastDaily?.date ?? null,
    readiness: readiness.rows,
  }
}
