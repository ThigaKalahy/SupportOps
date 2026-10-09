import type { ActionOwnerType, DevelopmentActionStatus, DevelopmentPlanStatus, TraitKind } from "@prisma/client"

import { todayBusinessDate } from "../../lib/dates.ts"
import {
  planProgress,
  planStaleness,
  readiness,
  type PlanStaleness,
  type Readiness,
  type SeniorityLevelMap,
} from "../../lib/development.ts"
import { db } from "../db.ts"
import { teamScope, type TeamContext } from "../scope.ts"

import { getThresholds } from "./thresholds.ts"

/**
 * Leituras de desenvolvimento. PDI, competência, ponto forte/de
 * desenvolvimento e mentoria não têm visibilidade própria: seguem o escopo de
 * pessoas do usuário. Nada aqui ordena pessoas por desempenho — listas de
 * pessoas saem em ordem alfabética.
 */

const STATUS_ORDER: Record<DevelopmentPlanStatus, number> = { ACTIVE: 0, PAUSED: 1, DRAFT: 2, DONE: 3, CANCELLED: 4 }

export interface PlanView {
  id: string
  member: { id: string; preferredName: string }
  competency: { id: string; name: string } | null
  status: DevelopmentPlanStatus
  currentSituation: string
  objective: string
  expectedEvidence: string | null
  progressNote: string | null
  startedAt: Date
  dueDate: Date | null
  completedAt: Date | null
  lastReviewedAt: Date | null
  /** Só faz sentido para PDI ativo. */
  staleness: PlanStaleness
  progress: { done: number; total: number }
  actions: {
    id: string
    description: string
    ownerType: ActionOwnerType
    ownerName: string | null
    dueDate: Date | null
    status: DevelopmentActionStatus
    completedAt: Date | null
  }[]
}

const planInclude = {
  member: { select: { id: true, preferredName: true } },
  competency: { select: { id: true, name: true } },
  actions: {
    orderBy: [{ dueDate: "asc" as const }, { description: "asc" as const }],
    include: { ownerMember: { select: { preferredName: true } } },
  },
}

type PlanWithRelations = NonNullable<Awaited<ReturnType<typeof findPlans>>>[number]

function findPlans(ctx: TeamContext, memberId?: string) {
  return db.developmentPlan.findMany({
    where: { ...teamScope(ctx), ...(memberId ? { memberId } : { member: { deletedAt: null } }) },
    include: planInclude,
  })
}

function toPlanView(p: PlanWithRelations, today: Date, staleDays: number): PlanView {
  return {
    id: p.id,
    member: p.member,
    competency: p.competency,
    status: p.status,
    currentSituation: p.currentSituation,
    objective: p.objective,
    expectedEvidence: p.expectedEvidence,
    progressNote: p.progressNote,
    startedAt: p.startedAt,
    dueDate: p.dueDate,
    completedAt: p.completedAt,
    lastReviewedAt: p.lastReviewedAt,
    staleness: planStaleness(p, today, staleDays),
    progress: planProgress(p.actions),
    actions: p.actions.map((a) => ({
      id: a.id,
      description: a.description,
      ownerType: a.ownerType,
      ownerName: a.ownerMember?.preferredName ?? null,
      dueDate: a.dueDate,
      status: a.status,
      completedAt: a.completedAt,
    })),
  }
}

function sortPlans(plans: PlanView[]): PlanView[] {
  return plans.sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.startedAt.getTime() - a.startedAt.getTime(),
  )
}

/** Senioridades em ordem, com a matriz de níveis esperados de cada uma. */
async function seniorityLevels(ctx: TeamContext): Promise<SeniorityLevelMap[]> {
  const seniorities = await db.seniority.findMany({
    where: teamScope(ctx),
    orderBy: { order: "asc" },
    include: { expectations: { where: { competency: { isActive: true } } } },
  })
  return seniorities.map((s) => ({
    seniorityId: s.id,
    label: s.label,
    order: s.order,
    expected: new Map(s.expectations.map((e) => [e.competencyId, e.expectedLevel])),
  }))
}

export interface CompetencyView {
  id: string
  name: string
  category: string | null
  level: number | null
  assessedAt: Date | null
  evidence: string | null
  expectedCurrent: number | null
  expectedNext: number | null
}

/** Aba Desenvolvimento do perfil. */
export async function getMemberDevelopment(ctx: TeamContext, memberId: string, today = todayBusinessDate()) {
  const member = await db.teamMember.findFirst({
    where: { id: memberId, ...teamScope(ctx), deletedAt: undefined },
    select: { id: true, seniorityId: true },
  })
  if (!member) return null
  const [plans, competencies, levels, traits, seniorities, mentorships, thresholds] = await Promise.all([
    findPlans(ctx, memberId),
    db.competency.findMany({ where: { ...teamScope(ctx), isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    db.memberCompetency.findMany({ where: { ...teamScope(ctx), memberId } }),
    db.memberTrait.findMany({ where: { ...teamScope(ctx), memberId }, orderBy: [{ observedAt: "desc" }] }),
    seniorityLevels(ctx),
    db.mentorshipLink.findMany({
      where: {
        ...teamScope(ctx),
        endedAt: null,
        OR: [{ mentorMemberId: memberId }, { menteeMemberId: memberId }],
        mentor: { deletedAt: null },
        mentee: { deletedAt: null },
      },
      orderBy: { startedAt: "asc" },
      include: {
        mentor: { select: { id: true, preferredName: true } },
        mentee: { select: { id: true, preferredName: true } },
        competency: { select: { name: true } },
      },
    }),
    getThresholds(ctx),
  ])
  const index = seniorities.findIndex((s) => s.seniorityId === member.seniorityId)
  const current = seniorities[index]
  const next = seniorities[index + 1] ?? null
  const byCompetency = new Map(levels.map((l) => [l.competencyId, l]))

  const competencyViews: CompetencyView[] = competencies.map((c) => {
    const level = byCompetency.get(c.id)
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      level: level?.currentLevel ?? null,
      assessedAt: level?.assessedAt ?? null,
      evidence: level?.evidence ?? null,
      expectedCurrent: current?.expected.get(c.id) ?? null,
      expectedNext: next?.expected.get(c.id) ?? null,
    }
  })

  return {
    plans: sortPlans(plans.map((p) => toPlanView(p, today, thresholds.stalePlanDays))),
    competencies: competencyViews,
    seniority: { current: current?.label ?? null, next: next?.label ?? null },
    matrixEmpty: seniorities.every((s) => s.expected.size === 0),
    readiness: current ? readiness(current.seniorityId, seniorities, new Map(levels.map((l) => [l.competencyId, l.currentLevel]))) : null,
    traits: traits.map((t) => ({ id: t.id, kind: t.kind as TraitKind, text: t.text, observedAt: t.observedAt, isActive: t.isActive })),
    mentorships: mentorships.map((m) => ({
      id: m.id,
      role: m.mentorMemberId === memberId ? ("mentor" as const) : ("mentee" as const),
      other: m.mentorMemberId === memberId ? m.mentee : m.mentor,
      competency: m.competency?.name ?? null,
      startedAt: m.startedAt,
    })),
  }
}

export type MemberDevelopment = NonNullable<Awaited<ReturnType<typeof getMemberDevelopment>>>

export interface MentorGroup {
  mentor: { id: string; preferredName: string }
  mentees: { id: string; linkId: string; preferredName: string; competency: string | null; startedAt: Date }[]
}

export interface ReadinessRow {
  member: { id: string; preferredName: string; seniorityLabel: string }
  readiness: Readiness
}

/** /development: PDIs por status, parados, mapa de mentorias e prontidão. */
export async function getDevelopmentOverview(ctx: TeamContext, today = todayBusinessDate()) {
  const [plans, links, ready, thresholds] = await Promise.all([
    findPlans(ctx),
    db.mentorshipLink.findMany({
      where: {
        ...teamScope(ctx),
        endedAt: null,
        mentor: { deletedAt: null },
        mentee: { deletedAt: null },
      },
      orderBy: { startedAt: "asc" },
      include: {
        mentor: { select: { id: true, preferredName: true } },
        mentee: { select: { id: true, preferredName: true } },
        competency: { select: { name: true } },
      },
    }),
    getReadinessRows(ctx),
    getThresholds(ctx),
  ])

  const views = sortPlans(plans.map((p) => toPlanView(p, today, thresholds.stalePlanDays)))
  const counts = Object.fromEntries((Object.keys(STATUS_ORDER) as DevelopmentPlanStatus[]).map((s) => [s, 0])) as Record<
    DevelopmentPlanStatus,
    number
  >
  for (const p of views) counts[p.status]++

  // Mapa de mentorias: agrupado por mentor, mentores em ordem alfabética.
  const groups = new Map<string, MentorGroup>()
  for (const l of links) {
    const group = groups.get(l.mentor.id) ?? { mentor: l.mentor, mentees: [] }
    group.mentees.push({ id: l.mentee.id, linkId: l.id, preferredName: l.mentee.preferredName, competency: l.competency?.name ?? null, startedAt: l.startedAt })
    groups.set(l.mentor.id, group)
  }

  return {
    plans: views,
    counts,
    stale: views
      .filter((p) => p.status === "ACTIVE" && p.staleness.stale)
      .sort((a, b) => b.staleness.days - a.staleness.days),
    mentorGroups: [...groups.values()].sort((a, b) => a.mentor.preferredName.localeCompare(b.mentor.preferredName)),
    readiness: ready.rows,
    matrixEmpty: ready.matrixEmpty,
    staleDays: thresholds.stalePlanDays,
  }
}

/**
 * Prontidão de quem está no time (não desligado): só quem atende a tudo da
 * senioridade atual. Ordem alfabética, nunca por "quão perto". Usada por
 * /development e pelo alerta informativo do motor (P15).
 */
export async function getReadinessRows(ctx: TeamContext): Promise<{ rows: ReadinessRow[]; matrixEmpty: boolean }> {
  const [members, seniorities, levels] = await Promise.all([
    db.teamMember.findMany({
      where: { ...teamScope(ctx), status: { not: "INACTIVE" } },
      orderBy: { preferredName: "asc" },
      select: { id: true, preferredName: true, seniorityId: true, seniority: { select: { label: true } } },
    }),
    seniorityLevels(ctx),
    db.memberCompetency.findMany({ where: { ...teamScope(ctx), member: { deletedAt: null } } }),
  ])
  const levelsByMember = new Map<string, Map<string, number>>()
  for (const l of levels) {
    const map = levelsByMember.get(l.memberId) ?? new Map<string, number>()
    map.set(l.competencyId, l.currentLevel)
    levelsByMember.set(l.memberId, map)
  }
  const rows = members.flatMap((m) => {
    const r = readiness(m.seniorityId, seniorities, levelsByMember.get(m.id) ?? new Map())
    return r ? [{ member: { id: m.id, preferredName: m.preferredName, seniorityLabel: m.seniority.label }, readiness: r }] : []
  })
  return { rows, matrixEmpty: seniorities.every((s) => s.expected.size === 0) }
}

export type DevelopmentOverview = Awaited<ReturnType<typeof getDevelopmentOverview>>

/** Matriz de níveis esperados para /settings: competências ativas × senioridades. */
export async function getExpectationMatrix(ctx: TeamContext) {
  const [competencies, seniorities] = await Promise.all([
    db.competency.findMany({ where: { ...teamScope(ctx), isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    seniorityLevels(ctx),
  ])
  return {
    competencies: competencies.map((c) => ({ id: c.id, name: c.name, category: c.category })),
    seniorities: seniorities.map((s) => ({ id: s.seniorityId, label: s.label, expected: Object.fromEntries(s.expected) })),
  }
}
