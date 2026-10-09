import { z } from "zod"

import { labels } from "../labels.ts"

import { optionalText, upcomingDisplayDate } from "./fields.ts"

/**
 * Criação rápida de combinado. Obrigatórios: título, responsável e prazo;
 * o resto fica atrás de "mais detalhes". O prazo vira dueDate E
 * originalDueDate, que nunca mais muda (D17).
 */

const v = labels.validation

export const AGREEMENT_ORIGINS = ["DAILY", "ONE_ON_ONE", "FEEDBACK", "MEETING", "INCIDENT", "MANAGER", "OTHER"] as const
export const AGREEMENT_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const

export const createAgreementSchema = z.object({
  memberId: z.string().min(1, v.required),
  title: z.string().trim().min(3, v.tooShort).max(160, v.tooLong),
  dueDate: upcomingDisplayDate,
  description: optionalText(2000),
  priority: z.enum(AGREEMENT_PRIORITIES),
  origin: z.enum(AGREEMENT_ORIGINS),
  /** Central de atendimento (P19): opcional; "" = sem central. */
  centralId: z.string().max(40).default(""),
})

export type CreateAgreementInput = z.infer<typeof createAgreementSchema>

/** Conclusão: resultado em uma linha, opcional mas incentivado. */
export const completeAgreementSchema = z.object({
  id: z.string().min(1),
  outcome: optionalText(300),
})

export type CompleteAgreementInput = z.infer<typeof completeAgreementSchema>

/**
 * Edição fora da daily: só o texto e a prioridade. Prazo e responsável não se
 * editam — prazo muda na daily, com checkin (D12); trocar o responsável
 * reescreveria o histórico de cumprimento de outra pessoa.
 */
export const editAgreementSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(3, v.tooShort).max(160, v.tooLong),
  description: optionalText(2000),
  priority: z.enum(AGREEMENT_PRIORITIES),
})

export type EditAgreementInput = z.infer<typeof editAgreementSchema>

/** Cancelamento fora da daily: o motivo é obrigatório e fica no resultado do combinado. */
export const cancelAgreementSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, v.tooShort).max(300, v.tooLong),
})

export type CancelAgreementInput = z.infer<typeof cancelAgreementSchema>
