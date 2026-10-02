import { z } from "zod"

import { parseDisplayDate } from "../dates.ts"
import { labels } from "../labels.ts"

import { optionalText, pastDisplayDate } from "./fields.ts"

/**
 * Registro de daily (/dailies/new). O MESMO schema valida o formulário e a
 * Server Action. Datas em "DD/MM/AAAA".
 *
 * - reviews: só os combinados que receberam desfecho. Parcial/Não feito exigem
 *   impeditivo e uma de duas ações: reagendar (novo prazo DEPOIS da daily) ou
 *   substituir (novo combinado com título e prazo a partir do dia da daily).
 * - participants: todos os membros ativos, presentes ou não.
 * - newAgreements: linhas vazias são descartadas no cliente antes de enviar.
 */

const v = labels.validation
const d = labels.dailies.validation

export const CHECKIN_OUTCOMES = ["DONE", "PARTIAL", "NOT_DONE"] as const
export const REVIEW_ACTIONS = ["reschedule", "replace"] as const

function after(day: string, value: string): boolean {
  const start = parseDisplayDate(day)
  const end = parseDisplayDate(value)
  return start !== null && end !== null && end > start
}

function onOrAfter(day: string, value: string): boolean {
  const start = parseDisplayDate(day)
  const end = parseDisplayDate(value)
  return start !== null && end !== null && end >= start
}

export const dailyReviewSchema = z.object({
  agreementId: z.string().min(1),
  outcome: z.enum(CHECKIN_OUTCOMES),
  blockerText: z.string().trim().max(300, v.tooLong),
  blockerReasonId: z.string(),
  action: z.enum(REVIEW_ACTIONS),
  newDueDate: z.string().trim(),
  replacementTitle: z.string().trim().max(160, v.tooLong),
  replacementDueDate: z.string().trim(),
})

export const dailyParticipantSchema = z.object({
  memberId: z.string().min(1),
  present: z.boolean(),
  note: z.string().trim().max(1000, v.tooLong),
  isBlocker: z.boolean(),
})

export const dailyNewAgreementSchema = z.object({
  memberId: z.string(),
  title: z.string().trim().max(160, v.tooLong),
  dueDate: z.string().trim(),
})

export const dailySchema = z
  .object({
    date: pastDisplayDate,
    summary: optionalText(4000),
    decisions: optionalText(4000),
    reviews: z.array(dailyReviewSchema),
    participants: z.array(dailyParticipantSchema),
    newAgreements: z.array(dailyNewAgreementSchema),
  })
  .superRefine((data, ctx) => {
    data.reviews.forEach((review, i) => {
      if (review.outcome === "DONE") return
      if (review.blockerText.length < 3) {
        ctx.addIssue({ code: "custom", path: ["reviews", i, "blockerText"], message: d.blockerRequired })
      }
      if (review.action === "reschedule") {
        if (parseDisplayDate(review.newDueDate) === null) {
          ctx.addIssue({ code: "custom", path: ["reviews", i, "newDueDate"], message: v.date })
        } else if (!after(data.date, review.newDueDate)) {
          ctx.addIssue({ code: "custom", path: ["reviews", i, "newDueDate"], message: d.futureDue })
        }
      } else {
        if (review.replacementTitle.length < 3) {
          ctx.addIssue({ code: "custom", path: ["reviews", i, "replacementTitle"], message: d.replacementRequired })
        }
        if (parseDisplayDate(review.replacementDueDate) === null) {
          ctx.addIssue({ code: "custom", path: ["reviews", i, "replacementDueDate"], message: v.date })
        } else if (!onOrAfter(data.date, review.replacementDueDate)) {
          ctx.addIssue({ code: "custom", path: ["reviews", i, "replacementDueDate"], message: d.notBeforeDaily })
        }
      }
    })
    data.newAgreements.forEach((row, i) => {
      if (!row.memberId) ctx.addIssue({ code: "custom", path: ["newAgreements", i, "memberId"], message: d.rowIncomplete })
      if (row.title.length < 3) ctx.addIssue({ code: "custom", path: ["newAgreements", i, "title"], message: v.tooShort })
      if (parseDisplayDate(row.dueDate) === null) {
        ctx.addIssue({ code: "custom", path: ["newAgreements", i, "dueDate"], message: v.date })
      } else if (!onOrAfter(data.date, row.dueDate)) {
        ctx.addIssue({ code: "custom", path: ["newAgreements", i, "dueDate"], message: d.notBeforeDaily })
      }
    })
  })

export type DailyInput = z.infer<typeof dailySchema>
export type DailyReviewInput = z.infer<typeof dailyReviewSchema>
export type DailyParticipantInput = z.infer<typeof dailyParticipantSchema>
export type DailyNewAgreementInput = z.infer<typeof dailyNewAgreementSchema>

/**
 * Edição de uma daily salva: só o que é texto da própria daily — resumo,
 * decisões, presença e notas. Revisões e combinados criados não se editam:
 * eles já mudaram os combinados (prazo, status, substituição).
 */
export const editDailySchema = z.object({
  id: z.string().min(1),
  summary: optionalText(4000),
  decisions: optionalText(4000),
  participants: z.array(dailyParticipantSchema),
})

export type EditDailyInput = z.infer<typeof editDailySchema>
