import { z } from "zod"

import { parseDisplayDate, todayBusinessDate } from "../dates.ts"
import { labels } from "../labels.ts"

/**
 * Campos e utilitários compartilhados pelos schemas de formulário. Datas
 * chegam como "DD/MM/AAAA" (campo com máscara) e são convertidas na action.
 */

const v = labels.validation

/** Data DD/MM/AAAA obrigatória, hoje ou no passado. */
export const pastDisplayDate = z
  .string()
  .trim()
  .min(1, v.required)
  .refine((value) => parseDisplayDate(value) !== null, v.date)
  .refine((value) => {
    const date = parseDisplayDate(value)
    return date === null || date <= todayBusinessDate()
  }, v.futureDate)

/** Data DD/MM/AAAA obrigatória, hoje ou no futuro (prazo). */
export const upcomingDisplayDate = z
  .string()
  .trim()
  .min(1, v.required)
  .refine((value) => parseDisplayDate(value) !== null, v.date)
  .refine((value) => {
    const date = parseDisplayDate(value)
    return date === null || date >= todayBusinessDate()
  }, v.pastDueDate)

/** Data DD/MM/AAAA opcional (vazia = sem data). */
export const optionalDisplayDate = z
  .string()
  .trim()
  .refine((value) => value === "" || parseDisplayDate(value) !== null, v.date)

/** Texto livre opcional; vazio vira null na action. */
export const optionalText = (max: number) => z.string().trim().max(max, v.tooLong)

export const visibilityField = z.enum(["PRIVATE", "SHARED"])

/** Resultado padrão das Server Actions de formulário. */
export type ActionResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }

export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".")
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/** Texto aparado ou null. */
export function textOrNull(value: string | undefined): string | null {
  const text = value?.trim() ?? ""
  return text === "" ? null : text
}
