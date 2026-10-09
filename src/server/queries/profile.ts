import { todayBusinessDate } from "../../lib/dates.ts"
import type { MemberAttention } from "../alerts.ts"
import { db, dbIncludingDeleted } from "../db.ts"
import { teamScope, type TeamContext } from "../scope.ts"
import { visibilityFilter } from "../visibility.ts"

import { listTeamMembers } from "./members.ts"

/**
 * Leituras do perfil de uma pessoa (/team/[memberId]).
 *
 * - `getMemberProfile`: cabeçalho, sempre visível em todas as abas.
 * - `getMemberOverview`: blocos da visão geral.
 *
 * 1:1, feedback e timeline passam por `visibilityFilter`: o VIEWER não vê
 * registro PRIVATE nem indiretamente (datas de último 1:1, próximo
 * acompanhamento e ritmo contam só o que ele pode ler).
 */

export interface NextFollowUp {
  date: Date
  kind: "oneOnOne" | "feedback"
}

export interface MemberProfile {
  id: string
  fullName: string
  preferredName: string
  position: string
  status: "ACTIVE" | "ON_LEAVE" | "OFFBOARDING" | "INACTIVE"
  joinedAt: Date
  deletedAt: Date | null
  managerSummary: string | null
  seniorityKey: string
  seniorityLabel: string
  managerName: string
  responsibilities: { id: string; name: string; isPrimary: boolean }[]
  lastOneOnOne: Date | null
  nextFollowUp: NextFollowUp | null
  attention: MemberAttention | null
}

export async function getMemberProfile(ctx: TeamContext, memberId: string): Promise<MemberProfile | null> {
  // Perfil de pessoa desativada continua acessível (histórico), por isso sem o filtro de soft delete.
  const member = await dbIncludingDeleted.teamMember.findFirst({
    where: { id: memberId, ...teamScope(ctx) },
    include: {
      seniority: { select: { key: true, label: true } },
      team: { select: { manager: { select: { name: true } } } },
      responsibilities: {
        where: { endedAt: null },
        include: { responsibility: { select: { id: true, name: true } } },
        orderBy: [{ isPrimary: "desc" }, { assignedAt: "asc" }],
      },
    },
  })
  if (!member) return null

  const today = todayBusinessDate()
  const [summaryRows, lastOneOnOne, nextFeedback] = await Promise.all([
    listTeamMembers(ctx, { id: member.id }),
    db.oneOnOne.findFirst({
      where: { memberId: member.id, ...teamScope(ctx), ...visibilityFilter(ctx) },
      orderBy: { date: "desc" },
      select: { date: true, nextReviewAt: true },
    }),
    db.feedback.findFirst({
      where: { memberId: member.id, followUpAt: { gte: today }, ...teamScope(ctx), ...visibilityFilter(ctx) },
      orderBy: { followUpAt: "asc" },
      select: { followUpAt: true },
    }),
  ])

  // Próximo acompanhamento: a revisão marcada no último 1:1 (mesmo vencida — é
  // pendência) ou o próximo follow-up de feedback, o que vier primeiro.
  const candidates: NextFollowUp[] = []
  if (lastOneOnOne?.nextReviewAt) candidates.push({ date: lastOneOnOne.nextReviewAt, kind: "oneOnOne" })
  if (nextFeedback?.followUpAt) candidates.push({ date: nextFeedback.followUpAt, kind: "feedback" })
  candidates.sort((a, b) => a.date.getTime() - b.date.getTime())

  return {
    id: member.id,
    fullName: member.fullName,
    preferredName: member.preferredName,
    position: member.position,
    status: member.status,
    joinedAt: member.joinedAt,
    deletedAt: member.deletedAt,
    managerSummary: member.managerSummary,
    seniorityKey: member.seniority.key,
    seniorityLabel: member.seniority.label,
    managerName: member.team.manager.name,
    responsibilities: member.responsibilities.map((r) => ({
      id: r.responsibility.id,
      name: r.responsibility.name,
      isPrimary: r.isPrimary,
    })),
    lastOneOnOne: lastOneOnOne?.date ?? null,
    nextFollowUp: candidates[0] ?? null,
    attention: summaryRows[0]?.attention ?? null,
  }
}

export const RECENT_EVENTS = 5

export async function getMemberOverview(ctx: TeamContext, memberId: string) {
  const scope = { memberId, ...teamScope(ctx) }
  const [recentEvents, lastFeedback, traits, agreements, plans, mentorships] = await Promise.all([
    db.timelineEvent.findMany({
      where: { ...scope, ...visibilityFilter(ctx) },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: RECENT_EVENTS,
      select: { id: true, type: true, title: true, occurredAt: true, visibility: true },
    }),
    db.feedback.findFirst({
      where: { ...scope, ...visibilityFilter(ctx) },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    db.memberTrait.findMany({
      where: { ...scope, isActive: true },
      orderBy: { observedAt: "desc" },
      select: { id: true, kind: true, text: true, observedAt: true },
    }),
    db.agreement.findMany({
      where: { ...scope, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
        priority: true,
        _count: { select: { checkins: { where: { newDueDate: { not: null } } } } },
      },
    }),
    db.developmentPlan.findMany({
      where: { ...scope, status: "ACTIVE" },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        objective: true,
        startedAt: true,
        lastReviewedAt: true,
        competency: { select: { name: true } },
        actions: { select: { status: true } },
      },
    }),
    db.mentorshipLink.findMany({
      where: {
        ...teamScope(ctx),
        endedAt: null,
        OR: [{ mentorMemberId: memberId }, { menteeMemberId: memberId }],
        mentor: { deletedAt: null },
        mentee: { deletedAt: null },
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        startedAt: true,
        mentorMemberId: true,
        mentor: { select: { id: true, preferredName: true } },
        mentee: { select: { id: true, preferredName: true } },
        competency: { select: { name: true } },
      },
    }),
  ])

  return {
    recentEvents,
    lastFeedback: lastFeedback?.date ?? null,
    lastRecord: recentEvents[0]?.occurredAt ?? null,
    strengths: traits.filter((t) => t.kind === "STRENGTH"),
    developmentPoints: traits.filter((t) => t.kind === "DEVELOPMENT"),
    agreements: agreements.map((a) => ({
      id: a.id,
      title: a.title,
      dueDate: a.dueDate,
      status: a.status,
      priority: a.priority,
      reschedules: a._count.checkins,
    })),
    plans: plans.map((p) => {
      const counted = p.actions.filter((a) => a.status !== "CANCELLED")
      return {
        id: p.id,
        objective: p.objective,
        competency: p.competency?.name ?? null,
        startedAt: p.startedAt,
        lastReviewedAt: p.lastReviewedAt,
        actionsDone: counted.filter((a) => a.status === "DONE").length,
        actionsTotal: counted.length,
      }
    }),
    mentors: mentorships
      .filter((m) => m.mentorMemberId !== memberId)
      .map((m) => ({ id: m.id, person: m.mentor, competency: m.competency?.name ?? null, startedAt: m.startedAt })),
    mentees: mentorships
      .filter((m) => m.mentorMemberId === memberId)
      .map((m) => ({ id: m.id, person: m.mentee, competency: m.competency?.name ?? null, startedAt: m.startedAt })),
  }
}

export type MemberOverview = Awaited<ReturnType<typeof getMemberOverview>>
