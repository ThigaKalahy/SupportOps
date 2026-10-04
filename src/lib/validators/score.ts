import { z } from "zod"

import { labels } from "../labels.ts"

/** Definições de score e componentes (/settings/score). Só cadastro — sem cálculo (D5). */

const v = labels.validation
const S = labels.settings.score

const id = z.string().min(1)

export const createScoreDefinitionSchema = z.object({
  name: z.string().trim().min(2, S.validation.nameRequired).max(80, v.tooLong),
  notes: z.string().trim().max(1000, v.tooLong),
})

export const scoreDefinitionRefSchema = z.object({ scoreDefinitionId: id })

export const scoreNotesSchema = z.object({ scoreDefinitionId: id, notes: z.string().trim().max(1000, v.tooLong) })

export const scoreActiveSchema = z.object({ scoreDefinitionId: id, active: z.boolean() })

export const scoreComponentSchema = z
  .object({
    scoreDefinitionId: id,
    metricDefinitionId: z.string().min(1, S.validation.metricRequired),
    weight: z.number({ message: S.validation.weight }).min(0.1, S.validation.weight).max(100, S.validation.weight),
    normalizationMin: z.number({ message: S.validation.number }),
    normalizationMax: z.number({ message: S.validation.number }),
  })
  .refine((c) => c.normalizationMax > c.normalizationMin, { message: S.validation.range, path: ["normalizationMax"] })

export const removeScoreComponentSchema = z.object({ scoreDefinitionId: id, metricDefinitionId: id })

export type ScoreComponentInput = z.infer<typeof scoreComponentSchema>
