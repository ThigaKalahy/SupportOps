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

import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { recordTimelineEvents, syncPlanCreatedEvent, timelineEventFor } from "./timeline.ts"
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

/**
 * Edição do PDI (texto, competência, prazo). A linha de criação na timeline
 * acompanha o objetivo e a situação; os acompanhamentos já registrados ficam
 * como foram escritos.
 */
export async function updatePlanRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = updatePlanSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const plan = await planInScope(user, data.planId)
  if (!plan) return generic()
  if (data.competencyId) {
    const competency = await db.competency.findFirst({ where: { id: data.competencyId, organizationId: user.organizationId } })
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
    await tx.developmentPlan.update({ where: { id: plan.id }, data: next })
    await syncPlanCreatedEvent(tx, plan.id, { title: next.objective, summary: next.currentSituation })
    await writeAudit(
      {
        action: "developmentPlan.update",
        entity: "DevelopmentPlan",
        entityId: plan.id,
        before: { objective: plan.objective, competencyId: plan.competencyId, dueDate: plan.dueDate?.toISOString() ?? null },
        after: { objective: next.objective, competencyId: next.competencyId, dueDate: next.dueDate?.toISOString() ?? null },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

/** Acrescenta uma ação a um PDI que não foi encerrado. */
export async function addPlanActionRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = addPlanActionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const { planId, action } = parsed.data
  const plan = await planInScope(user, planId)
  if (!plan || plan.status === "DONE" || plan.status === "CANCELLED") return generic()
  if (action.ownerType === "MENTOR") {
    const mentor = await db.teamMember.findFirst({ where: { id: action.ownerMemberId, ...memberScope(user) }, select: { id: true } })
    if (!mentor || mentor.id === plan.memberId) return generic()
  }

  await db.$transaction(async (tx) => {
    const created = await tx.developmentAction.create({
      data: {
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
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

/**
 * Mentoria nova. Duas pessoas ativas do time, diferentes (o banco também
 * confere); sem duplicar um vínculo aberto do mesmo par na mesma competência.
 * Não entra na timeline (decisão do P4: o mapa de mentorias é a superfície).
 */
export async function createMentorshipRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = mentorshipSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const people = await db.teamMember.count({ where: { id: { in: [data.mentorMemberId, data.menteeMemberId] }, ...memberScope(user) } })
  if (people !== 2) return generic()
  if (data.competencyId) {
    const competency = await db.competency.findFirst({ where: { id: data.competencyId, organizationId: user.organizationId } })
    if (!competency) return generic()
  }
  const duplicate = await db.mentorshipLink.findFirst({
    where: {
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
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}

/** Encerrar não apaga: grava endedAt (hoje) e o vínculo sai do mapa. */
export async function endMentorshipRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = endMentorshipSchema.safeParse(input)
  if (!parsed.success) return generic()
  const link = await db.mentorshipLink.findFirst({
    where: { id: parsed.data.linkId, endedAt: null, mentor: memberScope(user), mentee: memberScope(user) },
  })
  if (!link) return generic()
  const endedAt = todayBusinessDate()
  await db.$transaction(async (tx) => {
    await tx.mentorshipLink.update({ where: { id: link.id }, data: { endedAt } })
    await writeAudit(
      { action: "mentorship.end", entity: "MentorshipLink", entityId: link.id, before: { endedAt: null }, after: { endedAt: endedAt.toISOString() } },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}
