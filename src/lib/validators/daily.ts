import { z } from "zod"

import { parseDisplayDate } from "../dates.ts"
import { labels } from "../labels.ts"

import { pendingWatchIds } from "./watch.ts"

import { optionalText, pastDisplayDate } from "./fields.ts"

/**
 * Registro de daily (/dailies/new). O MESMO schema valida o formulário e a
 * Server Action. Datas em "DD/MM/AAAA".
 *
 * - reviews: só os combinados que receberam desfecho. Parcial/Não feito exigem
 *   impeditivo e uma de duas ações: reagendar ou substituir (novo combinado
 *   com título). Nos dois, o prazo novo vale a partir do dia da daily, inclusive
 *   o próprio dia — é o padrão que a tela propõe (D28).
 * - participants: todos os membros ativos, presentes ou não.
 * - newAgreements: linhas vazias são descartadas no cliente antes de enviar.
 */

const v = labels.validation
const d = labels.dailies.validation

export const CHECKIN_OUTCOMES = ["DONE", "PARTIAL", "NOT_DONE"] as const
export const REVIEW_ACTIONS = ["reschedule", "replace"] as const

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
  /** Feito + próximo passo: o caso seguiu por outro caminho. Vazio = sem próximo passo. */
  nextTitle: z.string().trim().max(160, v.tooLong).default(""),
  /** O que mudou: vira o porquê do próximo combinado e a revisão da observação, se houver. */
  nextNote: z.string().trim().max(300, v.tooLong).default(""),
  nextDueDate: z.string().trim().default(""),
})

export const dailyParticipantSchema = z.object({
  memberId: z.string().min(1),
  /** P21: observações criadas na nota antes de salvar; ganham o vínculo com a daily. */
  watchIds: pendingWatchIds,
  present: z.boolean(),
  note: z.string().trim().max(1000, v.tooLong),
  isBlocker: z.boolean(),
})

export const dailyNewAgreementSchema = z.object({
  memberId: z.string(),
  /** Central (P19): opcional, "" = sem. */
  centralId: z.string().max(40).default(""),
  /** P21: observações criadas na linha antes de salvar; ganham o vínculo com o combinado criado. */
  watchIds: pendingWatchIds,
  title: z.string().trim().max(160, v.tooLong),
  /** Por quê (opcional): o problema por trás do combinado; grava em `description`. */
  why: z.string().trim().max(300, v.tooLong).default(""),
  dueDate: z.string().trim(),
})

/** Regras de revisão e de combinados de hoje, comuns à criação e à edição (C11). */
function refineDaily(
  data: {
    date: string
    reviews: z.infer<typeof dailyReviewSchema>[]
    newAgreements: (z.infer<typeof dailyNewAgreementSchema> & { remove?: boolean })[]
  },
  ctx: z.RefinementCtx,
) {

    data.reviews.forEach((review, i) => {
      if (review.outcome === "DONE") {
        if (!review.nextTitle && !review.nextNote) return
        if (review.nextTitle.length < 3) {
          ctx.addIssue({ code: "custom", path: ["reviews", i, "nextTitle"], message: d.nextTitleRequired })
        }
        if (review.nextNote.length < 3) {
          ctx.addIssue({ code: "custom", path: ["reviews", i, "nextNote"], message: d.nextNoteRequired })
        }
        if (parseDisplayDate(review.nextDueDate) === null) {
          ctx.addIssue({ code: "custom", path: ["reviews", i, "nextDueDate"], message: v.date })
        } else if (!onOrAfter(data.date, review.nextDueDate)) {
          ctx.addIssue({ code: "custom", path: ["reviews", i, "nextDueDate"], message: d.notBeforeDaily })
        }
        return
      }
      if (review.blockerText.length < 3) {
        ctx.addIssue({ code: "custom", path: ["reviews", i, "blockerText"], message: d.blockerRequired })
      }
      if (review.action === "reschedule") {
        if (parseDisplayDate(review.newDueDate) === null) {
          ctx.addIssue({ code: "custom", path: ["reviews", i, "newDueDate"], message: v.date })
        } else if (!onOrAfter(data.date, review.newDueDate)) {
          ctx.addIssue({ code: "custom", path: ["reviews", i, "newDueDate"], message: d.notBeforeDaily })
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
      if (row.remove) return
      if (!row.memberId) ctx.addIssue({ code: "custom", path: ["newAgreements", i, "memberId"], message: d.rowIncomplete })
      if (row.title.length < 3) ctx.addIssue({ code: "custom", path: ["newAgreements", i, "title"], message: v.tooShort })
      if (parseDisplayDate(row.dueDate) === null) {
        ctx.addIssue({ code: "custom", path: ["newAgreements", i, "dueDate"], message: v.date })
      } else if (!onOrAfter(data.date, row.dueDate)) {
        ctx.addIssue({ code: "custom", path: ["newAgreements", i, "dueDate"], message: d.notBeforeDaily })
      }
    })
}

export const dailySchema = z
  .object({
    date: pastDisplayDate,
    summary: optionalText(4000),
    decisions: optionalText(4000),
    reviews: z.array(dailyReviewSchema),
    participants: z.array(dailyParticipantSchema),
    newAgreements: z.array(dailyNewAgreementSchema),
  })
  .superRefine(refineDaily)

export type DailyInput = z.infer<typeof dailySchema>
export type DailyReviewInput = z.infer<typeof dailyReviewSchema>
export type DailyParticipantInput = z.infer<typeof dailyParticipantSchema>
export type DailyNewAgreementInput = z.infer<typeof dailyNewAgreementSchema>

/**
 * Edição de uma daily salva (C11), no formato da criação: data, resumo,
 * decisões, presença e notas; os combinados que ficaram sem desfecho podem ser
 * revisados (as revisões já gravadas não mudam); os combinados criados nela se
 * editam ou removem (os já revisados ficam travados) e se acrescentam linhas.
 */
export const dailyEditRowSchema = dailyNewAgreementSchema.extend({
  /** Combinado já criado nesta daily; vazio = linha nova. */
  id: z.string().max(40).default(""),
  /** Remover o combinado criado por engano (exclusão lógica). */
  remove: z.boolean().default(false),
})

export const editDailySchema = z
  .object({
    id: z.string().min(1),
    date: pastDisplayDate,
    summary: optionalText(4000),
    decisions: optionalText(4000),
    participants: z.array(dailyParticipantSchema),
    reviews: z.array(dailyReviewSchema).default([]),
    newAgreements: z.array(dailyEditRowSchema).default([]),
  })
  .superRefine(refineDaily)

export type EditDailyInput = z.infer<typeof editDailySchema>
