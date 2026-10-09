import { DEV_RETURN_CATEGORIES, type DevReturnCategory } from "./dev-returns.ts"
import { parseUrlDate } from "./dates.ts"
import { VALIDATION_PERIODS, type ValidationPeriod } from "./validation-filters.ts"

/**
 * Filtros de /dev-returns, na URL (mesmo padrão de /priority-validations):
 *   ?period=today|7d|30d|month|custom&from=DD-MM-AAAA&to=DD-MM-AAAA
 *   &member=<id>&reason=<id>&category=ANALYST|PROCESS&central=<id>|none&open=1
 * Período padrão: 30 dias (devolução chega dias depois; "hoje" quase sempre viria vazio).
 */

export const DEV_RETURN_PARAMS = {
  period: "period",
  from: "from",
  to: "to",
  member: "member",
  reason: "reason",
  category: "category",
  central: "central",
  open: "open",
} as const

export const DEV_RETURN_DEFAULT_PERIOD: ValidationPeriod = "30d"

export interface DevReturnFilters {
  period: ValidationPeriod
  from: Date | null
  to: Date | null
  memberId: string | null
  reasonId: string | null
  category: DevReturnCategory | null
  /** Central (P19): id, "none" (sem central informada) ou null. */
  central: string | null
  /** Só as ainda não reenviadas. */
  openOnly: boolean
}

type Params = Record<string, string | string[] | undefined>

function one(params: Params, key: string): string | null {
  const value = params[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function parseDevReturnFilters(params: Params): DevReturnFilters {
  const rawPeriod = one(params, DEV_RETURN_PARAMS.period)
  let period: ValidationPeriod = VALIDATION_PERIODS.includes(rawPeriod as ValidationPeriod)
    ? (rawPeriod as ValidationPeriod)
    : DEV_RETURN_DEFAULT_PERIOD
  let from = parseUrlDate(one(params, DEV_RETURN_PARAMS.from))
  let to = parseUrlDate(one(params, DEV_RETURN_PARAMS.to))
  if (period === "custom") {
    if (!from || !to) period = DEV_RETURN_DEFAULT_PERIOD
    else if (from > to) [from, to] = [to, from]
  }
  const category = one(params, DEV_RETURN_PARAMS.category)
  return {
    period,
    from: period === "custom" ? from : null,
    to: period === "custom" ? to : null,
    memberId: one(params, DEV_RETURN_PARAMS.member),
    reasonId: one(params, DEV_RETURN_PARAMS.reason),
    category: DEV_RETURN_CATEGORIES.includes(category as DevReturnCategory) ? (category as DevReturnCategory) : null,
    central: one(params, DEV_RETURN_PARAMS.central),
    openOnly: one(params, DEV_RETURN_PARAMS.open) === "1",
  }
}

/** Filtros além do período e da pessoa (estes recortam também o resumo). */
export function hasDevReturnFilters(filters: DevReturnFilters): boolean {
  return Boolean(filters.memberId || filters.reasonId || filters.category || filters.central || filters.openOnly)
}
