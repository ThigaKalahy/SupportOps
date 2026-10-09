import { parseDisplayDate, todayBusinessDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import {
  actionStatusSchema,
  addPlanActionSchema,
  archiveTraitSchema,
  createPlanSchema,
  endMentorshipSchema,
  mentorshipSchema,
  updatePlanSchema,
  expectationSchema,
  planStatusSchema,
  reviewPlanSchema,
  traitSchema,
} from "../lib/validators/development.ts"

import { auditOf, writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { recordTimelineEvents, syncPlanCreatedEvent, timelineEventFor } from "./timeline.ts"
import { requireManager, teamScope, type TeamContext } from "./scope.ts"

/**
 * Escrita de desenvolvimento (núcleo de src/actions/development.ts). Toda
 * escrita é auditada. Entram na timeline (SHARED — PDI não tem visibilidade
 * própria): criação do PDI, cada acompanhamento e a conclusão. Ações, status
 * intermediários, pontos fortes/de desenvolvimento e a matriz não.
 *
 * Registrar acompanhamento grava lastReviewedAt (o relógio do "PDI parado") e
 * a nota de progresso.
 */

const generic = (): ActionResult => ({ ok: false, error: labels.validation.generic })

function date(value: string): Date {
  const parsed = parseDisplayDate(value)
  if (!parsed) throw new Error(`Data inválida após validação: ${value}`)
  return parsed
}

const optionalDate = (value: string) => (value.trim() ? date(value) : null)

async function planInScope(ctx: TeamContext, planId: string) {
  return db.developmentPlan.findFirst({ where: { id: planId, ...teamScope(ctx) } })
}

export async function createPlanRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = createPlanSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const member = await db.teamMember.findFirst({ where: { id: data.memberId, ...teamScope(ctx) }, select: { id: true } })
  if (!member) return generic()
  if (data.competencyId) {
    const competency = await db.competency.findFirst({ where: { ...teamScope(ctx), id: data.competencyId } })
    if (!competency) return generic()
  }
  const mentorIds = data.actions.filter((a) => a.ownerType === "MENTOR").map((a) => a.ownerMemberId)
  if (mentorIds.length) {
    const found = await db.teamMember.count({ where: { id: { in: mentorIds }, ...teamScope(ctx) } })
    if (found !== new Set(mentorIds).size) return generic()
  }

  await db.$transaction(async (tx) => {
    const plan = await tx.developmentPlan.create({
      data: {
        ...teamScope(ctx),
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
            ...teamScope(ctx),
            description: a.description,
            ownerType: a.ownerType,
            ownerMemberId: a.ownerType === "MENTOR" ? a.ownerMemberId : null,
            dueDate: optionalDate(a.dueDate),
          })),
        },
      },
    })
    await recordTimelineEvents(tx, ctx, [timelineEventFor.developmentPlan({ ...plan, authorUserId: ctx.userId })])
    await writeAudit(
      {
        action: "developmentPlan.create",
        entity: "DevelopmentPlan",
        entityId: plan.id,
        after: { memberId: plan.memberId, objective: plan.objective, status: plan.status, actions: data.actions.length },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/** Acompanhamento: lastReviewedAt = agora, nota de progresso, linha na timeline. */
export async function reviewPlanRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = reviewPlanSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const plan = await planInScope(ctx, parsed.data.planId)
  if (!plan) return generic()
  const reviewedAt = new Date()

  await db.$transaction(async (tx) => {
    await tx.developmentPlan.update({
      where: { id: plan.id, ...teamScope(ctx) },
      data: { lastReviewedAt: reviewedAt, progressNote: parsed.data.note },
    })
    await recordTimelineEvents(tx, ctx, [
      timelineEventFor.developmentReview({
        id: plan.id,
        memberId: plan.memberId,
        objective: plan.objective,
        note: parsed.data.note,
        reviewedAt,
        authorUserId: ctx.userId,
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
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/** Status do PDI. Concluir grava completedAt (hoje) e a linha de conclusão na timeline. */
export async function setPlanStatusRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = planStatusSchema.safeParse(input)
  if (!parsed.success) return generic()
  const plan = await planInScope(ctx, parsed.data.planId)
  if (!plan) return generic()
  const status = parsed.data.status
  if (status === plan.status) return { ok: true }
  const completedAt = status === "DONE" ? todayBusinessDate() : null

  await db.$transaction(async (tx) => {
    await tx.developmentPlan.update({ where: { id: plan.id, ...teamScope(ctx) }, data: { status, completedAt } })
    if (completedAt) {
      await recordTimelineEvents(tx, ctx, [
        timelineEventFor.developmentDone({
          id: plan.id,
          memberId: plan.memberId,
          objective: plan.objective,
          completedAt,
          authorUserId: ctx.userId,
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
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

export async function setActionStatusRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = actionStatusSchema.safeParse(input)
  if (!parsed.success) return generic()
  const action = await db.developmentAction.findFirst({
    where: { ...teamScope(ctx), id: parsed.data.actionId },
  })
  if (!action) return generic()
  const status = parsed.data.status
  await db.$transaction(async (tx) => {
    await tx.developmentAction.update({
      where: { id: action.id, ...teamScope(ctx) },
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
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

export async function createTraitRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = traitSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const member = await db.teamMember.findFirst({ where: { id: data.memberId, ...teamScope(ctx) }, select: { id: true } })
  if (!member) return generic()
  await db.$transaction(async (tx) => {
    const trait = await tx.memberTrait.create({
      data: { ...teamScope(ctx), memberId: member.id, kind: data.kind, text: data.text, observedAt: date(data.observedAt) },
    })
    await writeAudit(
      { action: "memberTrait.create", entity: "MemberTrait", entityId: trait.id, after: { kind: trait.kind, text: trait.text } },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/** Arquivar não apaga: o ponto vai para o histórico (isActive = false). */
export async function archiveTraitRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = archiveTraitSchema.safeParse(input)
  if (!parsed.success) return generic()
  const trait = await db.memberTrait.findFirst({ where: { id: parsed.data.traitId, ...teamScope(ctx) } })
  if (!trait) return generic()
  await db.$transaction(async (tx) => {
    await tx.memberTrait.update({ where: { id: trait.id, ...teamScope(ctx) }, data: { isActive: false } })
    await writeAudit(
      { action: "memberTrait.archive", entity: "MemberTrait", entityId: trait.id, before: { isActive: true }, after: { isActive: false } },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/** Uma célula da matriz de níveis esperados: grava, troca ou limpa (null). */
export async function setExpectationRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = expectationSchema.safeParse(input)
  if (!parsed.success) return generic()
  const { competencyId, seniorityId, expectedLevel } = parsed.data
  const [competency, seniority] = await Promise.all([
    db.competency.findFirst({ where: { ...teamScope(ctx), id: competencyId } }),
    db.seniority.findFirst({ where: { ...teamScope(ctx), id: seniorityId } }),
  ])
  if (!competency || !seniority) return generic()
  const key = { competencyId_seniorityId: { competencyId, seniorityId }, ...teamScope(ctx) }
  const before = await db.competencyExpectation.findUnique({ where: key })

  await db.$transaction(async (tx) => {
    if (expectedLevel === null) {
      if (before) await tx.competencyExpectation.delete({ where: key })
    } else {
      await tx.competencyExpectation.upsert({
        where: key,
        create: { ...teamScope(ctx), competencyId, seniorityId, expectedLevel },
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
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/**
 * Edição do PDI (texto, competência, prazo). A linha de criação na timeline
 * acompanha o objetivo e a situação; os acompanhamentos já registrados ficam
 * como foram escritos.
 */
export async function updatePlanRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = updatePlanSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const plan = await planInScope(ctx, data.planId)
  if (!plan) return generic()
  if (data.competencyId) {
    const competency = await db.competency.findFirst({ where: { ...teamScope(ctx), id: data.competencyId } })
    if (!competency) return generic()
  }
  const dueDate = optionalDate(data.dueDate)
  if (dueDate && dueDate <= plan.startedAt) {
    return { ok: false, error: labels.validation.generic, fieldErrors: { dueDate: labels.validation.beforeRecordDate } }
  }
  const next = {
    competencyId: data.competencyId || null,
    currentSituation: data.currentSituation,
    objective: data.objective,
    expectedEvidence: textOrNull(data.expectedEvidence),
    dueDate,
  }

  await db.$transaction(async (tx) => {
    await tx.developmentPlan.update({ where: { id: plan.id, ...teamScope(ctx) }, data: next })
    await syncPlanCreatedEvent(tx, ctx, plan.id, { title: next.objective, summary: next.currentSituation })
    await writeAudit(
      {
        action: "developmentPlan.update",
        entity: "DevelopmentPlan",
        entityId: plan.id,
        before: { objective: plan.objective, competencyId: plan.competencyId, dueDate: plan.dueDate?.toISOString() ?? null },
        after: { objective: next.objective, competencyId: next.competencyId, dueDate: next.dueDate?.toISOString() ?? null },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/** Acrescenta uma ação a um PDI que não foi encerrado. */
export async function addPlanActionRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = addPlanActionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const { planId, action } = parsed.data
  const plan = await planInScope(ctx, planId)
  if (!plan || plan.status === "DONE" || plan.status === "CANCELLED") return generic()
  if (action.ownerType === "MENTOR") {
    const mentor = await db.teamMember.findFirst({ where: { id: action.ownerMemberId, ...teamScope(ctx) }, select: { id: true } })
    if (!mentor || mentor.id === plan.memberId) return generic()
  }

  await db.$transaction(async (tx) => {
    const created = await tx.developmentAction.create({
      data: {
        ...teamScope(ctx),
        planId: plan.id,
        description: action.description,
        ownerType: action.ownerType,
        ownerMemberId: action.ownerType === "MENTOR" ? action.ownerMemberId : null,
        dueDate: optionalDate(action.dueDate),
      },
    })
    await writeAudit(
      {
        action: "developmentAction.create",
        entity: "DevelopmentAction",
        entityId: created.id,
        after: { planId: plan.id, description: created.description, ownerType: created.ownerType },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/**
 * Mentoria nova. Duas pessoas ativas do time, diferentes (o banco também
 * confere); sem duplicar um vínculo aberto do mesmo par na mesma competência.
 * Não entra na timeline (decisão do P4: o mapa de mentorias é a superfície).
 */
export async function createMentorshipRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = mentorshipSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const people = await db.teamMember.count({ where: { id: { in: [data.mentorMemberId, data.menteeMemberId] }, ...teamScope(ctx) } })
  if (people !== 2) return generic()
  if (data.competencyId) {
    const competency = await db.competency.findFirst({ where: { ...teamScope(ctx), id: data.competencyId } })
    if (!competency) return generic()
  }
  const duplicate = await db.mentorshipLink.findFirst({
    where: {
      ...teamScope(ctx),
      mentorMemberId: data.mentorMemberId,
      menteeMemberId: data.menteeMemberId,
      competencyId: data.competencyId || null,
      endedAt: null,
    },
  })
  if (duplicate) return { ok: false, error: labels.development.validation.duplicateMentorship }

  await db.$transaction(async (tx) => {
    const link = await tx.mentorshipLink.create({
      data: {
        ...teamScope(ctx),
        mentorMemberId: data.mentorMemberId,
        menteeMemberId: data.menteeMemberId,
        competencyId: data.competencyId || null,
        startedAt: date(data.startedAt),
        note: textOrNull(data.note),
      },
    })
    await writeAudit(
      {
        action: "mentorship.create",
        entity: "MentorshipLink",
        entityId: link.id,
        after: { mentorMemberId: link.mentorMemberId, menteeMemberId: link.menteeMemberId, competencyId: link.competencyId },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/** Encerrar não apaga: grava endedAt (hoje) e o vínculo sai do mapa. */
export async function endMentorshipRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = endMentorshipSchema.safeParse(input)
  if (!parsed.success) return generic()
  const link = await db.mentorshipLink.findFirst({
    where: { ...teamScope(ctx), id: parsed.data.linkId, endedAt: null },
  })
  if (!link) return generic()
  const endedAt = todayBusinessDate()
  await db.$transaction(async (tx) => {
    await tx.mentorshipLink.update({ where: { id: link.id, ...teamScope(ctx) }, data: { endedAt } })
    await writeAudit(
      { action: "mentorship.end", entity: "MentorshipLink", entityId: link.id, before: { endedAt: null }, after: { endedAt: endedAt.toISOString() } },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}
