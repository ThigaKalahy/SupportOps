import { z } from "zod"

import { parseDisplayDate } from "../dates.ts"
import { labels } from "../labels.ts"

import { optionalDisplayDate, optionalText, pastDisplayDate } from "./fields.ts"

/**
 * PDI, acompanhamento, ações, pontos fortes/de desenvolvimento e a matriz de
 * níveis esperados. O MESMO schema valida o formulário e a Server Action.
 * Datas em "DD/MM/AAAA".
 */

const v = labels.validation

export const PLAN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "DONE", "CANCELLED"] as const
export const ACTION_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const
export const ACTION_OWNERS = ["MEMBER", "MANAGER", "MENTOR"] as const
export const TRAIT_KINDS = ["STRENGTH", "DEVELOPMENT"] as const
export const MAX_PLAN_ACTIONS = 10

export const planActionSchema = z
  .object({
    description: z.string().trim().min(3, v.tooShort).max(300, v.tooLong),
    ownerType: z.enum(ACTION_OWNERS),
    /** Só para MENTOR: a pessoa do time que é mentora na ação. */
    ownerMemberId: z.string(),
    dueDate: optionalDisplayDate,
  })
  .superRefine((data, ctx) => {
    if (data.ownerType === "MENTOR" && !data.ownerMemberId) {
      ctx.addIssue({ code: "custom", path: ["ownerMemberId"], message: labels.development.validation.mentorRequired })
    }
  })

export const createPlanSchema = z
  .object({
    memberId: z.string().min(1),
    competencyId: z.string(),
    currentSituation: z.string().trim().min(3, v.tooShort).max(2000, v.tooLong),
    objective: z.string().trim().min(3, v.tooShort).max(300, v.tooLong),
    expectedEvidence: optionalText(2000),
    startedAt: pastDisplayDate,
    dueDate: optionalDisplayDate,
    status: z.enum(["DRAFT", "ACTIVE"]),
    actions: z.array(planActionSchema).max(MAX_PLAN_ACTIONS).default([]),
  })
  .refine(
    (data) => {
      if (!data.dueDate) return true
      const start = parseDisplayDate(data.startedAt)
      const due = parseDisplayDate(data.dueDate)
      return !start || !due || due > start
    },
    { message: v.beforeRecordDate, path: ["dueDate"] },
  )

/** Edição do PDI: os campos de texto, a competência e o prazo. Início, status e ações têm caminho próprio. */
export const updatePlanSchema = z.object({
  planId: z.string().min(1),
  competencyId: z.string(),
  currentSituation: z.string().trim().min(3, v.tooShort).max(2000, v.tooLong),
  objective: z.string().trim().min(3, v.tooShort).max(300, v.tooLong),
  expectedEvidence: optionalText(2000),
  dueDate: optionalDisplayDate,
})

/** Ação acrescentada a um PDI que já existe. */
export const addPlanActionSchema = z.object({ planId: z.string().min(1), action: planActionSchema })

/** Mentoria: vínculo temporário entre duas pessoas do time, por competência (opcional). */
export const mentorshipSchema = z
  .object({
    mentorMemberId: z.string().min(1, v.required),
    menteeMemberId: z.string().min(1, v.required),
    competencyId: z.string(),
    startedAt: pastDisplayDate,
    note: optionalText(300),
  })
  .refine((data) => data.mentorMemberId !== data.menteeMemberId, {
    message: labels.development.validation.sameMentor,
    path: ["menteeMemberId"],
  })

export const endMentorshipSchema = z.object({ linkId: z.string().min(1) })

export const reviewPlanSchema = z.object({
  planId: z.string().min(1),
  /** O que mudou desde o último acompanhamento; vira a nota de progresso. */
  note: z.string().trim().min(3, v.tooShort).max(2000, v.tooLong),
})

export const planStatusSchema = z.object({ planId: z.string().min(1), status: z.enum(PLAN_STATUSES) })
export const actionStatusSchema = z.object({ actionId: z.string().min(1), status: z.enum(ACTION_STATUSES) })

export const traitSchema = z.object({
  memberId: z.string().min(1),
  kind: z.enum(TRAIT_KINDS),
  text: z.string().trim().min(3, v.tooShort).max(300, v.tooLong),
  observedAt: pastDisplayDate,
})

export const archiveTraitSchema = z.object({ traitId: z.string().min(1) })

/** Célula da matriz: nível 1–5, ou null para limpar. */
export const expectationSchema = z.object({
  competencyId: z.string().min(1),
  seniorityId: z.string().min(1),
  expectedLevel: z.number().int().min(1).max(5).nullable(),
})

export type CreatePlanInput = z.infer<typeof createPlanSchema>
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>
export type MentorshipInput = z.infer<typeof mentorshipSchema>
export type PlanActionInput = z.infer<typeof planActionSchema>
export type ReviewPlanInput = z.infer<typeof reviewPlanSchema>
export type TraitInput = z.infer<typeof traitSchema>
