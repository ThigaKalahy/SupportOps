import { z } from "zod"

import { parseDisplayDate } from "../dates.ts"
import { labels } from "../labels.ts"

/**
 * Escrita do colaborador (P26). O MESMO schema valida o portal (cliente) e a action.
 * Datas em "DD/MM/AAAA". O colaborador só relata os próprios combinados e propõe
 * novos: nunca muda prazo, status, título ou responsável de combinado existente.
 */

const v = labels.validation
const M = labels.memberPortal.validation

export const SELF_REPORT_OUTCOMES = ["DONE", "PARTIAL", "NOT_DONE"] as const
/** Propostas pendentes por pessoa: uma lista curta, não uma lista de desejos. */
export const MAX_PENDING_PROPOSALS = 10

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

export const proposalSchema = z.object({
  title: z.string().trim().min(3, v.tooShort).max(160, v.tooLong),
  suggestedDueDate: optionalDate,
  note: z.string().trim().max(300, v.tooLong).default(""),
})

export type ProposalInput = z.input<typeof proposalSchema>

export const idSchema = z.string().min(1).max(40)
