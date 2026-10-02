import type { FeedbackCategory } from "@prisma/client"

import { FEEDBACK_CATEGORIES } from "./validators/records.ts"

/**
 * Filtros do índice de 1:1 e feedbacks (/records e a aba do perfil), na URL:
 *   ?type=oneOnOne|feedback&member=<id>&category=RECOGNITION&period=30d|3m|6m|12m|all
 * Categoria é de feedback: escolhê-la mostra só feedbacks. Período padrão: 3 meses.
 */

export const RECORD_TYPES = ["oneOnOne", "feedback"] as const
export type RecordType = (typeof RECORD_TYPES)[number]
export const RECORD_PERIODS = ["30d", "3m", "6m", "12m", "all"] as const
export type RecordPeriod = (typeof RECORD_PERIODS)[number]
export const DEFAULT_RECORD_PERIOD: RecordPeriod = "3m"

export const RECORD_PARAMS = { type: "type", member: "member", category: "category", period: "period" } as const

export interface RecordFilters {
  type: RecordType | null
  memberId: string | null
  category: FeedbackCategory | null
  period: RecordPeriod
}

type Params = Record<string, string | string[] | undefined>

function one(params: Params, key: string): string | null {
  const value = params[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function parseRecordFilters(params: Params): RecordFilters {
  const type = one(params, RECORD_PARAMS.type)
  const category = one(params, RECORD_PARAMS.category)
  const period = one(params, RECORD_PARAMS.period)
  return {
    type: RECORD_TYPES.includes(type as RecordType) ? (type as RecordType) : null,
    memberId: one(params, RECORD_PARAMS.member),
    category: FEEDBACK_CATEGORIES.includes(category as FeedbackCategory) ? (category as FeedbackCategory) : null,
    period: RECORD_PERIODS.includes(period as RecordPeriod) ? (period as RecordPeriod) : DEFAULT_RECORD_PERIOD,
  }
}

export function hasRecordFilters(filters: RecordFilters): boolean {
  return Boolean(filters.type || filters.memberId || filters.category || filters.period !== DEFAULT_RECORD_PERIOD)
}

/** Primeiro dia (data de negócio) do período, ou null para "tudo". */
export function recordPeriodStart(period: RecordPeriod, today: Date): Date | null {
  if (period === "all") return null
  const start = new Date(today)
  if (period === "30d") start.setUTCDate(start.getUTCDate() - 29)
  else start.setUTCMonth(start.getUTCMonth() - (period === "3m" ? 3 : period === "6m" ? 6 : 12))
  return start
}
