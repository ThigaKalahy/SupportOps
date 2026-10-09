import { z } from "zod"

import { labels } from "../labels.ts"
import { WATCH_HEATS, WATCH_ORIGINS } from "../watch.ts"

import { optionalText } from "./fields.ts"

/**
 * Em observação (P21). Só título e grau são obrigatórios; todos os vínculos
 * são opcionais (D24). Resolver exige texto (D27); revisar não (exigir texto
 * faria parar de revisar).
 */

const v = labels.validation
const W = labels.watch

const link = z.string().max(40).default("")

export const createWatchSchema = z.object({
  title: z.string().trim().min(1, W.validation.title).max(160, v.tooLong),
  heat: z.enum(WATCH_HEATS),
  context: optionalText(1000).default(""),
  origin: z.enum(WATCH_ORIGINS),
  memberId: link,
  centralId: link,
  agreementId: link,
  dailyId: link,
  priorityValidationId: link,
  devReturnId: link,
  oneOnOneId: link,
  feedbackId: link,
})

export type CreateWatchInput = z.input<typeof createWatchSchema>

export const watchRefSchema = z.object({ id: z.string().min(1) })

export const reviewWatchSchema = z.object({ id: z.string().min(1), note: optionalText(500).default("") })

export const heatWatchSchema = z.object({ id: z.string().min(1), direction: z.enum(["up", "down"]) })

export const resolveWatchSchema = z.object({
  id: z.string().min(1),
  note: z.string().trim().min(3, W.resolveForm.required).max(1000, v.tooLong),
})

export const visibilityWatchSchema = z.object({ id: z.string().min(1), visibility: z.enum(["PRIVATE", "SHARED"]) })

/** Observações criadas num formulário ainda não salvo (daily, 1:1, feedback, combinado): ligadas ao salvar. */
export const pendingWatchIds = z.array(z.string().min(1).max(40)).max(50).default([])

/** Os ids pendentes que vieram junto do input de um formulário (fora do schema dele); inválido vira lista vazia. */
export function pendingWatchIdsOf(input: unknown): string[] {
  if (typeof input !== "object" || input === null || !("watchIds" in input)) return []
  const parsed = pendingWatchIds.safeParse((input as { watchIds: unknown }).watchIds)
  return parsed.success ? parsed.data : []
}
