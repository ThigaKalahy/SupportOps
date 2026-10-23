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
  /** Cliente (central, P19): opcional; "" = sem. Só com o módulo ligado no time. */
  centralId: z.string().max(40).default(""),
})

export type OwnAgreementInput = z.input<typeof ownAgreementSchema>

/** C16: próximo passo depois de um Feito — herda do combinado de origem; a central é trocável. */
export const nextStepSchema = ownAgreementSchema.extend({ agreementId: z.string().min(1).max(40) })

/** C16: central pelo nome digitado (a existente pelo nome normalizado, ou uma nova). */
export const ownCentralSchema = z.object({ name: z.string().max(240) })

export const idSchema = z.string().min(1).max(40)

/**
 * C19 — a daily conduzida pelo scrum master no portal (D46). Só o que o papel alcança:
 * desfecho (Feito — com próximo passo, C20 —, Parcial, Não feito com impeditivo, motivo e
 * novo prazo), quem faltou e os combinados de hoje. Sem nota, observação, substituição,
 * resumo ou decisões — isso fica com o gestor. As regras de data e impeditivo são as da daily.
 */
export const conductDailySchema = z.object({
  draftId: z.string().min(1).max(40),
  reviews: z
    .array(
      z.object({
        agreementId: z.string().min(1).max(40),
        outcome: z.enum(SELF_REPORT_OUTCOMES),
        blockerText: z.string().trim().max(300, v.tooLong).default(""),
        blockerReasonId: z.string().max(40).default(""),
        newDueDate: z.string().trim().max(10).default(""),
        // C20: próximo passo depois de um Feito (as regras são as da daily: título, o que mudou e prazo).
        nextTitle: z.string().trim().max(160, v.tooLong).default(""),
        nextNote: z.string().trim().max(300, v.tooLong).default(""),
        nextDueDate: z.string().trim().max(10).default(""),
        nextCentralId: z.string().max(40).default(""),
      }),
    )
    .max(300),
  absent: z.array(z.string().min(1).max(40)).max(200).default([]),
  newAgreements: z
    .array(
      z.object({
        memberId: z.string().max(40),
        centralId: z.string().max(40).default(""),
        title: z.string().trim().max(160, v.tooLong),
        why: z.string().trim().max(300, v.tooLong).default(""),
        dueDate: z.string().trim().max(10),
      }),
    )
    .max(50)
    .default([]),
})

export type ConductDailyInput = z.infer<typeof conductDailySchema>
