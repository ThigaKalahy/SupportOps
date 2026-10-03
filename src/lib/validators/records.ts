import { z } from "zod"

import { parseDisplayDate } from "../dates.ts"
import { labels } from "../labels.ts"

import { optionalDisplayDate, optionalText, pastDisplayDate, upcomingDisplayDate, visibilityField } from "./fields.ts"

/**
 * 1:1, feedback e anotação. O MESMO schema valida o formulário e a Server
 * Action. Datas em "DD/MM/AAAA". 1:1, feedback e anotação nascem PRIVATE;
 * só o feedback de reconhecimento SUGERE compartilhar (o formulário troca o
 * padrão, a pessoa decide).
 */

const v = labels.validation

/** A data de retorno (próxima revisão, follow-up) precisa vir depois da data do registro. */
function after(record: string, followUp: string): boolean {
  if (followUp === "") return true
  const start = parseDisplayDate(record)
  const end = parseDisplayDate(followUp)
  return start === null || end === null || end > start
}

/**
 * Combinado gerado dentro do 1:1 ou do feedback: o responsável é a própria
 * pessoa do registro; só o que foi combinado e o prazo. Linhas vazias são
 * descartadas no cliente antes de enviar.
 */
export const generatedAgreementSchema = z.object({
  title: z.string().trim().min(3, v.tooShort).max(160, v.tooLong),
  dueDate: upcomingDisplayDate,
})

export const MAX_GENERATED_AGREEMENTS = 10

const generatedAgreements = z.array(generatedAgreementSchema).max(MAX_GENERATED_AGREEMENTS).default([])

export const oneOnOneSchema = z
  .object({
    memberId: z.string().min(1),
    date: pastDisplayDate,
    topics: z.string().trim().min(3, v.tooShort).max(2000, v.tooLong),
    durationMinutes: z
      .string()
      .trim()
      .refine((value) => value === "" || (/^\d{1,3}$/.test(value) && Number(value) > 0), v.minutes),
    memberPerception: optionalText(4000),
    managerPerception: optionalText(4000),
    wins: optionalText(4000),
    difficulties: optionalText(4000),
    development: optionalText(4000),
    nextReviewAt: optionalDisplayDate,
    visibility: visibilityField,
    agreements: generatedAgreements,
  })
  .refine((data) => after(data.date, data.nextReviewAt), { message: v.beforeRecordDate, path: ["nextReviewAt"] })

export const FEEDBACK_CATEGORIES = ["RECOGNITION", "DEVELOPMENT", "BEHAVIOR", "TECHNICAL", "PERFORMANCE", "FORMAL"] as const

export const feedbackSchema = z
  .object({
    memberId: z.string().min(1),
    date: pastDisplayDate,
    category: z.enum(FEEDBACK_CATEGORIES, { message: v.required }),
    context: optionalText(2000),
    behavior: z.string().trim().min(3, v.tooShort).max(2000, v.tooLong),
    impact: optionalText(2000),
    guidance: optionalText(2000),
    followUpAt: optionalDisplayDate,
    visibility: visibilityField,
    agreements: generatedAgreements,
  })
  .refine((data) => after(data.date, data.followUpAt), { message: v.beforeRecordDate, path: ["followUpAt"] })

export const noteSchema = z.object({
  memberId: z.string().min(1),
  date: pastDisplayDate,
  title: z.string().trim().min(3, v.tooShort).max(160, v.tooLong),
  body: z.string().trim().min(1, v.required).max(8000, v.tooLong),
  visibility: visibilityField,
})

export type OneOnOneInput = z.infer<typeof oneOnOneSchema>
export type FeedbackInput = z.infer<typeof feedbackSchema>
export type NoteInput = z.infer<typeof noteSchema>
export type GeneratedAgreementInput = z.infer<typeof generatedAgreementSchema>

export const recordVisibilitySchema = z.object({
  eventId: z.string().min(1),
  visibility: visibilityField,
})

/** 1:1, feedback ou anotação a editar ou excluir. */
export const recordRefSchema = z.object({
  kind: z.enum(["oneOnOne", "feedback", "note"]),
  id: z.string().min(1),
})

export type RecordRef = z.infer<typeof recordRefSchema>
