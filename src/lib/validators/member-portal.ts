import { z } from "zod"

import { parseDisplayDate, todayBusinessDate } from "../dates.ts"
import { labels } from "../labels.ts"

/**
 * Escrita do colaborador (P26). O MESMO schema valida o portal (cliente) e a action.
 * Datas em "DD/MM/AAAA". O colaborador relata os próprios combinados e cria novos (C14):
 * nunca muda prazo, status, título ou responsável de combinado existente.
 */

const v = labels.validation
const M = labels.memberPortal.validation

export const SELF_REPORT_OUTCOMES = ["DONE", "PARTIAL", "NOT_DONE"] as const

const optionalDate = z
  .string()
  .trim()
  .default("")
  .refine((value) => value === "" || parseDisplayDate(value) !== null, v.date)

export const selfReportSchema = z
  .object({
    agreementId: z.string().min(1).max(40),
    outcome: z.enum(SELF_REPORT_OUTCOMES),
    blockerText: z.string().trim().max(300, v.tooLong).default(""),
    blockerReasonId: z.string().max(40).default(""),
    suggestedDueDate: optionalDate,
  })
  .superRefine((data, ctx) => {
    if (data.outcome !== "DONE" && data.blockerText.length < 3) {
      ctx.addIssue({ code: "custom", path: ["blockerText"], message: M.blockerRequired })
    }
  })

export type SelfReportInput = z.input<typeof selfReportSchema>

/**
 * C14: combinado criado pelo próprio colaborador. Prazo vazio = hoje (D28); nunca no
 * passado. Sem prioridade e sem responsável: é sempre dele, e a prioridade é do gestor.
 */
export const ownAgreementSchema = z.object({
  title: z.string().trim().min(3, v.tooShort).max(160, v.tooLong),
  dueDate: optionalDate.refine((value) => {
    if (!value) return true
    const date = parseDisplayDate(value)
    return date !== null && date >= todayBusinessDate()
  }, M.dueInPast),
})

export type OwnAgreementInput = z.input<typeof ownAgreementSchema>

export const idSchema = z.string().min(1).max(40)
