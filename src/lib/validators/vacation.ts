import { z } from "zod"

import { parseDisplayDate } from "../dates.ts"
import { labels } from "../labels.ts"

import { optionalText } from "./fields.ts"

const v = labels.validation
const F = labels.vacations

const date = z
  .string()
  .trim()
  .min(1, v.required)
  .refine((value) => parseDisplayDate(value) !== null, v.date)

/** Registrar férias (C4): início e fim em DD/MM/AAAA, fim no mesmo dia ou depois. Pode ser no futuro. */
export const createVacationSchema = z
  .object({
    memberId: z.string().min(1),
    startDate: date,
    endDate: date,
    note: optionalText(300).default(""),
  })
  .superRefine((data, ctx) => {
    const start = parseDisplayDate(data.startDate)
    const end = parseDisplayDate(data.endDate)
    if (start && end && end < start) ctx.addIssue({ code: "custom", path: ["endDate"], message: F.validation.endBeforeStart })
  })

export type CreateVacationInput = z.input<typeof createVacationSchema>

export const cancelVacationSchema = z.object({ id: z.string().min(1) })
