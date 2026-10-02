import { z } from "zod"

import { labels } from "../labels.ts"
import { compilePattern } from "../priority-validation.ts"

/**
 * Catálogos editáveis em /settings: níveis de prioridade, motivos de
 * reclassificação, motivos de impeditivo e padrões de URL de chamado.
 * O MESMO schema valida o dialog e a Server Action.
 */

const v = labels.validation
const S = labels.settings

export const CATALOG_KINDS = ["priorityLevel", "reclassificationReason", "blockerReason", "ticketPattern"] as const
export type CatalogKind = (typeof CATALOG_KINDS)[number]

export const BLOCKER_CATEGORIES = ["EXTERNAL", "INTERNAL", "CAPACITY"] as const

const label = z.string().trim().min(2, S.validation.labelRequired).max(80, v.tooLong)
const id = z.string().optional()

/** Quantos grupos de captura a expressão tem (0 se inválida). */
export function captureGroupCount(regex: string): number {
  const re = compilePattern(`${regex}|`)
  return re ? (re.exec("")?.length ?? 1) - 1 : 0
}

export const catalogSchemas = {
  priorityLevel: z.object({ id, label }),
  reclassificationReason: z.object({ id, label, requiresDetail: z.boolean() }),
  blockerReason: z.object({ id, label, category: z.enum(BLOCKER_CATEGORIES) }),
  ticketPattern: z
    .object({
      id,
      label,
      regex: z
        .string()
        .trim()
        .min(1, v.required)
        .max(300, v.tooLong)
        .refine((value) => compilePattern(value) !== null, S.ticketPatterns.invalidRegex),
      captureGroup: z.number().int().min(0).max(9),
    })
    .superRefine((data, ctx) => {
      if (compilePattern(data.regex) && data.captureGroup > captureGroupCount(data.regex)) {
        ctx.addIssue({ code: "custom", path: ["captureGroup"], message: S.ticketPatterns.groupOutOfRange })
      }
    }),
} satisfies Record<CatalogKind, z.ZodType>

export type CatalogInput<K extends CatalogKind> = z.infer<(typeof catalogSchemas)[K]>

export const catalogRefSchema = z.object({ kind: z.enum(CATALOG_KINDS), id: z.string().min(1) })
export const moveCatalogSchema = catalogRefSchema.extend({ direction: z.enum(["up", "down"]) })
export const activeCatalogSchema = catalogRefSchema.extend({ active: z.boolean() })
