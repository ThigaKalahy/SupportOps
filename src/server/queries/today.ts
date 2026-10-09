import type { TimelineEventType } from "@prisma/client"

import { isDue, isOnTime, makeRate, monthStart, type Rate } from "../../lib/adherence.ts"

import { db } from "../db.ts"
import { teamScope, type TeamContext } from "../scope.ts"
import { visibilityFilter } from "../visibility.ts"

/**
 * Coluna lateral da home: composição do time, ritmo de gestão do mês,
 * próximos acompanhamentos (7 dias) e últimas movimentações. Leituras de 1:1,
 * feedback e timeline com visibilityFilter — para o VIEWER, só o que é
 * compartilhado conta e aparece.
 */

export const UPCOMING_DAYS = 7
export const RECENT_EVENTS = 8

export type UpcomingKind = "agreement" | "review" | "followUp" | "plan" | "action"

export interface UpcomingItem {
  id: string
  kind: UpcomingKind
  date: Date
  member: { id: string; preferredName: string }
  title: string
  href: string
}

export interface RecentItem {
  id: string
  type: TimelineEventType
  occurredAt: Date
  title: string
  member: { id: string; preferredName: string }
}

export interface TodayPanel {
  composition: { seniorityKey: string; label: string; count: number }[]
  total: number
  onLeave: number
  rhythm: {
    lastDaily: Date | null
    oneOnOnes: number
    feedbacks: number
    /** Cumprimento no prazo do time no mês corrente (até hoje), com o denominador (D19). */
    adherence: Rate
  }
  upcoming: UpcomingItem[]
  recent: RecentItem[]
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

export async function getTodayPanel(ctx: TeamContext, today: Date): Promise<TodayPanel> {
  const scope = teamScope(ctx)
  const people = { status: { not: "INACTIVE" as const } }
  const month = monthStart(today)
  const until = addDays(today, UPCOMING_DAYS)
  const member = { select: { id: true, preferredName: true } } as const

  const [
    members,
    seniorities,
    lastDaily,
    oneOnOnes,
    feedbacks,
    monthAgreements,
    agreements,
    reviews,
    followUps,
    plans,
    actions,
    recent,
  ] = await Promise.all([
    db.teamMember.findMany({ where: { ...scope, ...people }, select: { status: true, seniorityId: true } }),
    db.seniority.findMany({ where: scope, orderBy: { order: "desc" } }),
    db.daily.findFirst({ where: scope, orderBy: { date: "desc" }, select: { date: true } }),
    db.oneOnOne.count({ where: { ...scope, member: people, ...visibilityFilter(ctx), date: { gte: month, lte: today } } }),
    db.feedback.count({ where: { ...scope, member: people, ...visibilityFilter(ctx), date: { gte: month, lte: today } } }),
    db.agreement.findMany({
      where: { ...scope, member: people, originalDueDate: { gte: month, lte: today } },
      select: { status: true, originalDueDate: true, completedAt: true },
    }),
    db.agreement.findMany({
      // Combinado com prazo hoje fica fora da home (D28): a daily é quem o revisa.
      where: { ...scope, member: people, status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { gt: today, lte: until } },
      select: { id: true, title: true, dueDate: true, member },
    }),
    // O 1:1 mais recente de cada pessoa: só a revisão marcada nele está pendente (P13).
    db.oneOnOne.findMany({
      where: { ...scope, member: people, ...visibilityFilter(ctx) },
      distinct: ["memberId"],
      orderBy: [{ memberId: "asc" }, { date: "desc" }],
      select: { id: true, memberId: true, date: true, nextReviewAt: true, topics: true, member },
    }),
    db.feedback.findMany({
      where: { ...scope, member: people, ...visibilityFilter(ctx), followUpAt: { gte: today, lte: until } },
      select: { id: true, followUpAt: true, behavior: true, member },
    }),
    db.developmentPlan.findMany({
      where: { ...scope, member: people, status: "ACTIVE", dueDate: { gte: today, lte: until } },
      select: { id: true, objective: true, dueDate: true, member },
    }),
    db.developmentAction.findMany({
      where: {
        ...scope,
        plan: { member: people, status: "ACTIVE", deletedAt: null },
        status: { in: ["OPEN", "IN_PROGRESS"] },
        dueDate: { gte: today, lte: until },
      },
      select: { id: true, description: true, dueDate: true, plan: { select: { member } } },
    }),
    db.timelineEvent.findMany({
      where: { ...scope, member: { deletedAt: null }, ...visibilityFilter(ctx) },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: RECENT_EVENTS,
      select: { id: true, type: true, occurredAt: true, title: true, member },
    }),
  ])

  const bySeniority = new Map<string, number>()
  for (const m of members) bySeniority.set(m.seniorityId, (bySeniority.get(m.seniorityId) ?? 0) + 1)
  const due = monthAgreements.filter((a) => isDue(a, today))

  const latestReviews = reviews.filter(
    (r) => r.nextReviewAt && r.nextReviewAt.getTime() >= today.getTime() && r.nextReviewAt.getTime() <= until.getTime(),
  )

  const upcoming: UpcomingItem[] = [
    ...agreements.map((a) => ({ id: `a:${a.id}`, kind: "agreement" as const, date: a.dueDate, member: a.member, title: a.title, href: `/agreements/${a.id}` })),
    ...latestReviews.map((r) => ({
      id: `r:${r.id}`,
      kind: "review" as const,
      date: r.nextReviewAt!,
      member: r.member,
      title: r.topics?.split("\n")[0]?.trim() ?? "",
      href: `/team/${r.member.id}/records`,
    })),
    ...followUps.map((f) => ({
      id: `f:${f.id}`,
      kind: "followUp" as const,
      date: f.followUpAt!,
      member: f.member,
      title: f.behavior.split("\n")[0]?.trim() ?? "",
      href: `/team/${f.member.id}/records`,
    })),
    ...plans.map((p) => ({ id: `p:${p.id}`, kind: "plan" as const, date: p.dueDate!, member: p.member, title: p.objective, href: `/team/${p.member.id}/development` })),
    ...actions.map((a) => ({
      id: `x:${a.id}`,
      kind: "action" as const,
      date: a.dueDate!,
      member: a.plan.member,
      title: a.description,
      href: `/team/${a.plan.member.id}/development`,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.member.preferredName.localeCompare(b.member.preferredName))

  return {
    composition: seniorities
      .map((s) => ({ seniorityKey: s.key, label: s.label, count: bySeniority.get(s.id) ?? 0 }))
      .filter((s) => s.count > 0),
    total: members.length,
    onLeave: members.filter((m) => m.status === "ON_LEAVE").length,
    rhythm: {
      lastDaily: lastDaily?.date ?? null,
      oneOnOnes,
      feedbacks,
      adherence: makeRate(due.filter(isOnTime).length, due.length),
    },
    upcoming,
    recent: recent.map((e) => ({ id: e.id, type: e.type, occurredAt: e.occurredAt, title: e.title, member: e.member })),
  }
}
