import { parseUrlDate, todayBusinessDate } from "./dates.ts"
import { VALIDATION_OUTCOMES, type ValidationOutcome } from "./priority-validation.ts"

/**
 * Filtros de /priority-validations, na URL:
 *   ?period=today|7d|30d|month|custom&from=DD-MM-AAAA&to=DD-MM-AAAA
 *   &member=<id>&outcome=RAISED&reason=<id>
 * Período padrão: hoje. Datas na URL no formato brasileiro, com hífen.
 */

export const VALIDATION_PERIODS = ["today", "7d", "30d", "month", "custom"] as const
export type ValidationPeriod = (typeof VALIDATION_PERIODS)[number]

export const VALIDATION_PARAMS = {
  period: "period",
  from: "from",
  to: "to",
  member: "member",
  outcome: "outcome",
  reason: "reason",
} as const

export interface ValidationFilters {
  period: ValidationPeriod
  /** Só no período personalizado: datas de negócio. */
  from: Date | null
  to: Date | null
  memberId: string | null
  outcome: ValidationOutcome | null
  reasonId: string | null
}

type Params = Record<string, string | string[] | undefined>

function one(params: Params, key: string): string | null {
  const value = params[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export { parseUrlDate, toUrlDate } from "./dates.ts"

export function parseValidationFilters(params: Params): ValidationFilters {
  const rawPeriod = one(params, VALIDATION_PARAMS.period)
  let period: ValidationPeriod = VALIDATION_PERIODS.includes(rawPeriod as ValidationPeriod)
    ? (rawPeriod as ValidationPeriod)
    : "today"
  let from = parseUrlDate(one(params, VALIDATION_PARAMS.from))
  let to = parseUrlDate(one(params, VALIDATION_PARAMS.to))
  if (period === "custom") {
    if (!from || !to) period = "today"
    else if (from > to) [from, to] = [to, from]
  }
  const rawOutcome = one(params, VALIDATION_PARAMS.outcome)
  return {
    period,
    from: period === "custom" ? from : null,
    to: period === "custom" ? to : null,
    memberId: one(params, VALIDATION_PARAMS.member),
    outcome: VALIDATION_OUTCOMES.includes(rawOutcome as ValidationOutcome) ? (rawOutcome as ValidationOutcome) : null,
    reasonId: one(params, VALIDATION_PARAMS.reason),
  }
}

/** Intervalo de datas de negócio (inclusivo) do período escolhido. */
export function periodRange(filters: Pick<ValidationFilters, "period" | "from" | "to">, today = todayBusinessDate()) {
  const daysBack = (n: number) => {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - n)
    return d
  }
  switch (filters.period) {
    case "7d":
      return { from: daysBack(6), to: today }
    case "30d":
      return { from: daysBack(29), to: today }
    case "month":
      return { from: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), to: today }
    case "custom":
      return { from: filters.from ?? today, to: filters.to ?? today }
    default:
      return { from: today, to: today }
  }
}

export function hasValidationFilters(filters: ValidationFilters): boolean {
  return Boolean(filters.memberId || filters.outcome || filters.reasonId)
}
