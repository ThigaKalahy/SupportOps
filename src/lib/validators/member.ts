import { z } from "zod"

import { labels } from "../labels.ts"

import { pastDisplayDate } from "./fields.ts"

export { fieldErrorsOf, type ActionResult } from "./fields.ts"

/**
 * Cadastro de pessoa. O MESMO schema valida o formulário (react-hook-form) e
 * a Server Action. A data de entrada chega como "DD/MM/AAAA".
 */

const v = labels.validation

export const memberFieldsSchema = z.object({
  fullName: z.string().trim().min(3, v.tooShort).max(120, v.tooLong),
  preferredName: z.string().trim().min(1, v.required).max(40, v.tooLong),
  position: z.string().trim().min(2, v.tooShort).max(80, v.tooLong),
  seniorityId: z.string().min(1, v.required),
  joinedAt: pastDisplayDate,
  /** Desativar é ação própria (deactivateMember); o formulário não escolhe INACTIVE. */
  status: z.enum(["ACTIVE", "ON_LEAVE", "OFFBOARDING"], { message: v.required }),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email(v.email).max(254)]),
  responsibilityIds: z.array(z.string()),
  competencies: z.array(z.object({ competencyId: z.string(), level: z.number().int().min(1).max(5) })),
})

export const createMemberSchema = memberFieldsSchema

export const updateMemberSchema = memberFieldsSchema.extend({
  id: z.string().min(1),
  /** Obrigatório quando senioridade, cargo ou status mudam — validado na action, que conhece o antes. */
  reason: z.string().trim().max(500, v.tooLong),
})

export const deactivateMemberSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, v.reasonRequired).max(500, v.tooLong),
})

/** Reativar quem foi desativado: também é evento de carreira, com motivo. */
export const reactivateMemberSchema = deactivateMemberSchema

/** Resumo gerencial do perfil, editado inline. Vazio apaga o resumo. */
export const managerSummarySchema = z.object({
  id: z.string().min(1),
  managerSummary: z.string().trim().max(2000, v.tooLong),
})

export type MemberFormValues = z.infer<typeof memberFieldsSchema>
export type CreateMemberInput = z.infer<typeof createMemberSchema>
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
export type DeactivateMemberInput = z.infer<typeof deactivateMemberSchema>
