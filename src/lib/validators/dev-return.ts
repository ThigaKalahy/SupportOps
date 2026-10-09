import { z } from "zod"

import { parseDisplayDate } from "../dates.ts"
import { labels } from "../labels.ts"

import { optionalText, pastDisplayDate } from "./fields.ts"

/**
 * Devolução do desenvolvimento (P20). O MESMO schema valida o formulário de
 * /dev-returns e a Server Action. O motivo é obrigatório (D21: devolução sem
 * motivo não tem valor); motivo que exige detalhe ("Outro") exige o texto —
 * o banco confere as duas coisas de novo (NOT NULL e trigger).
 */

const v = labels.validation
const D = labels.devReturns.validation

export interface DevReturnCatalog {
  reasons: { id: string; requiresDetail: boolean }[]
}

export const devReturnFields = {
  id: z.string().optional(),
  ticketUrl: z.string().trim().min(1, v.required).max(2000, v.tooLong),
  ticketRef: z.string().trim().min(1, D.ticketRefRequired).max(64, v.tooLong),
  memberId: z.string().min(1, v.required),
  /** Central (P19): opcional, "" = sem. */
  centralId: z.string().max(40).default(""),
  returnedAt: pastDisplayDate,
  reasonId: z.string().min(1, D.reasonRequired),
  reasonOther: optionalText(300),
  devContact: optionalText(120),
  note: optionalText(300),
}

export function devReturnSchema(catalog: DevReturnCatalog) {
  return z.object(devReturnFields).superRefine((data, ctx) => {
    if (!data.reasonId) return
    const reason = catalog.reasons.find((r) => r.id === data.reasonId)
    if (!reason) {
      ctx.addIssue({ code: "custom", path: ["reasonId"], message: D.reasonRequired })
      return
    }
    if (reason.requiresDetail && data.reasonOther.length < 3) {
      ctx.addIssue({ code: "custom", path: ["reasonOther"], message: D.reasonOtherRequired })
    }
  })
}

export type DevReturnInput = z.infer<z.ZodObject<typeof devReturnFields>>

/** Marcar como reenviado: data (hoje por padrão, nunca no futuro) e uma linha opcional de resolução. */
export const resolveDevReturnSchema = z.object({
  id: z.string().min(1),
  resolvedAt: pastDisplayDate,
  resolutionNote: optionalText(300),
})

export type ResolveDevReturnInput = z.infer<typeof resolveDevReturnSchema>

/** Data de negócio de um campo DD/MM/AAAA já validado. */
export function businessDateOf(value: string): Date {
  return parseDisplayDate(value)!
}
