import { parseDisplayDate, todayBusinessDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import {
  actionStatusSchema,
  archiveTraitSchema,
  createPlanSchema,
  expectationSchema,
  planStatusSchema,
  reviewPlanSchema,
  traitSchema,
} from "../lib/validators/development.ts"

import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { recordTimelineEvents, timelineEventFor } from "./timeline.ts"
import { canWrite, memberScope, type Viewer } from "./visibility.ts"

/**
 * Escrita de desenvolvimento (núcleo de src/actions/development.ts). Toda
 * escrita é auditada. Entram na timeline (SHARED — PDI não tem visibilidade
 * própria): criação do PDI, cada acompanhamento e a conclusão. Ações, status
 * intermediários, pontos fortes/de desenvolvimento e a matriz não.
 *
 * Registrar acompanhamento grava lastReviewedAt (o relógio do "PDI parado") e
 * a nota de progresso.
 */

const forbidden = (): ActionResult => ({ ok: false, error: labels.access.forbidden })
const generic = (): ActionResult => ({ ok: false, error: labels.validation.generic })

function date(value: string): Date {
  const parsed = parseDisplayDate(value)
  if (!parsed) throw new Error(`Data inválida após validação: ${value}`)
  return parsed
}

const optionalDate = (value: string) => (value.trim() ? date(value) : null)

async function planInScope(user: Viewer, planId: string) {
  return db.developmentPlan.findFirst({ where: { id: planId, member: memberScope(user) } })
}

export async function createPlanRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = createPlanSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const member = await db.teamMember.findFirst({ where: { id: data.memberId, ...memberScope(user) }, select: { id: true } })
  if (!member) return generic()
  if (data.competencyId) {
    const competency = await db.competency.findFirst({ where: { id: data.competencyId, organizationId: user.organizationId } })
    if (!competency) return generic()
  }
  const mentorIds = data.actions.filter((a) => a.ownerType === "MENTOR").map((a) => a.ownerMemberId)
  if (mentorIds.length) {
    const found = await db.teamMember.count({ where: { id: { in: mentorIds }, ...memberScope(user) } })
    if (found !== new Set(mentorIds).size) return generic()
  }

  await db.$transaction(async (tx) => {
    const plan = await tx.developmentPlan.create({
      data: {
        memberId: member.id,
        competencyId: data.competencyId || null,
        currentSituation: data.currentSituation,
        objective: data.objective,
        expectedEvidence: textOrNull(data.expectedEvidence),
        status: data.status,
        startedAt: date(data.startedAt),
        dueDate: optionalDate(data.dueDate),
        actions: {
          create: data.actions.map((a) => ({
            description: a.description,
            ownerType: a.ownerType,
            ownerMemberId: a.ownerType === "MENTOR" ? a.ownerMemberId : null,
            dueDate: optionalDate(a.dueDate),
          })),
        },
      },
    })
    await recordTimelineEvents(tx, [timelineEventFor.developmentPlan({ ...plan, authorUserId: user.id })])
    await writeAudit(
      {
        action: "developmentPlan.create",
        entity: "DevelopmentPlan",
        entityId: plan.id,
        after: { memberId: plan.memberId, objective: plan.objective, status: plan.status, actions: data.actions.length },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

/** Acompanhamento: lastReviewedAt = agora, nota de progresso, linha na timeline. */
export async function reviewPlanRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = reviewPlanSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const plan = await planInScope(user, parsed.data.planId)
  if (!plan) return generic()
  const reviewedAt = new Date()

  await db.$transaction(async (tx) => {
    await tx.developmentPlan.update({
      where: { id: plan.id },
      data: { lastReviewedAt: reviewedAt, progressNote: parsed.data.note },
    })
    await recordTimelineEvents(tx, [
      timelineEventFor.developmentReview({
        id: plan.id,
        memberId: plan.memberId,
        objective: plan.objective,
        note: parsed.data.note,
        reviewedAt,
        authorUserId: user.id,
      }),
    ])
    await writeAudit(
      {
        action: "developmentPlan.review",
        entity: "DevelopmentPlan",
        entityId: plan.id,
        before: { lastReviewedAt: plan.lastReviewedAt?.toISOString() ?? null, progressNote: plan.progressNote },
        after: { lastReviewedAt: reviewedAt.toISOString(), progressNote: parsed.data.note },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

/** Status do PDI. Concluir grava completedAt (hoje) e a linha de conclusão na timeline. */
export async function setPlanStatusRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = planStatusSchema.safeParse(input)
  if (!parsed.success) return generic()
  const plan = await planInScope(user, parsed.data.planId)
  if (!plan) return generic()
  const status = parsed.data.status
  if (status === plan.status) return { ok: true }
  const completedAt = status === "DONE" ? todayBusinessDate() : null

  await db.$transaction(async (tx) => {
    await tx.developmentPlan.update({ where: { id: plan.id }, data: { status, completedAt } })
    if (completedAt) {
      await recordTimelineEvents(tx, [
        timelineEventFor.developmentDone({
          id: plan.id,
          memberId: plan.memberId,
          objective: plan.objective,
          completedAt,
          authorUserId: user.id,
        }),
      ])
    }
    await writeAudit(
      {
        action: "developmentPlan.status",
        entity: "DevelopmentPlan",
        entityId: plan.id,
        before: { status: plan.status },
        after: { status },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

export async function setActionStatusRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = actionStatusSchema.safeParse(input)
  if (!parsed.success) return generic()
  const action = await db.developmentAction.findFirst({
    where: { id: parsed.data.actionId, plan: { member: memberScope(user) } },
  })
  if (!action) return generic()
  const status = parsed.data.status
  await db.$transaction(async (tx) => {
    await tx.developmentAction.update({
      where: { id: action.id },
      data: { status, completedAt: status === "DONE" ? todayBusinessDate() : null },
    })
    await writeAudit(
      {
        action: "developmentAction.status",
        entity: "DevelopmentAction",
        entityId: action.id,
        before: { status: action.status },
        after: { status },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

export async function createTraitRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = traitSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const member = await db.teamMember.findFirst({ where: { id: data.memberId, ...memberScope(user) }, select: { id: true } })
  if (!member) return generic()
  await db.$transaction(async (tx) => {
    const trait = await tx.memberTrait.create({
      data: { memberId: member.id, kind: data.kind, text: data.text, observedAt: date(data.observedAt) },
    })
    await writeAudit(
      { action: "memberTrait.create", entity: "MemberTrait", entityId: trait.id, after: { kind: trait.kind, text: trait.text } },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

/** Arquivar não apaga: o ponto vai para o histórico (isActive = false). */
export async function archiveTraitRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = archiveTraitSchema.safeParse(input)
  if (!parsed.success) return generic()
  const trait = await db.memberTrait.findFirst({ where: { id: parsed.data.traitId, member: memberScope(user) } })
  if (!trait) return generic()
  await db.$transaction(async (tx) => {
    await tx.memberTrait.update({ where: { id: trait.id }, data: { isActive: false } })
    await writeAudit(
      { action: "memberTrait.archive", entity: "MemberTrait", entityId: trait.id, before: { isActive: true }, after: { isActive: false } },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

/** Uma célula da matriz de níveis esperados: grava, troca ou limpa (null). */
export async function setExpectationRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = expectationSchema.safeParse(input)
  if (!parsed.success) return generic()
  const { competencyId, seniorityId, expectedLevel } = parsed.data
  const [competency, seniority] = await Promise.all([
    db.competency.findFirst({ where: { id: competencyId, organizationId: user.organizationId } }),
    db.seniority.findFirst({ where: { id: seniorityId, organizationId: user.organizationId } }),
  ])
  if (!competency || !seniority) return generic()
  const key = { competencyId_seniorityId: { competencyId, seniorityId } }
  const before = await db.competencyExpectation.findUnique({ where: key })

  await db.$transaction(async (tx) => {
    if (expectedLevel === null) {
      if (before) await tx.competencyExpectation.delete({ where: key })
    } else {
      await tx.competencyExpectation.upsert({
        where: key,
        create: { competencyId, seniorityId, expectedLevel },
        update: { expectedLevel },
      })
    }
    await writeAudit(
      {
        action: "settings.competencyExpectation.update",
        entity: "CompetencyExpectation",
        entityId: `${competencyId}:${seniorityId}`,
        before: { expectedLevel: before?.expectedLevel ?? null },
        after: { expectedLevel },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}
