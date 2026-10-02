import { parseUrlDate, todayBusinessDate } from "./dates.ts"

/**
 * Filtros de /agreements/adherence, na URL:
 *   ?period=30d|90d|6m|12m|custom&from=DD-MM-AAAA&to=DD-MM-AAAA&sort=rate
 * Período padrão: 90 dias. Ordem padrão: alfabética.
 */

export const ADHERENCE_PERIODS = ["30d", "90d", "6m", "12m", "custom"] as const
export type AdherencePeriod = (typeof ADHERENCE_PERIODS)[number]
export const ADHERENCE_SORTS = ["name", "rate"] as const
export type AdherenceSort = (typeof ADHERENCE_SORTS)[number]

export interface AdherenceFilters {
  period: AdherencePeriod
  from: Date | null
  to: Date | null
  sort: AdherenceSort
}

type Params = Record<string, string | string[] | undefined>

const one = (params: Params, key: string) => (typeof params[key] === "string" ? (params[key] as string) : null)

export function parseAdherenceFilters(params: Params): AdherenceFilters {
  const raw = one(params, "period")
  let period: AdherencePeriod = ADHERENCE_PERIODS.includes(raw as AdherencePeriod) ? (raw as AdherencePeriod) : "90d"
  let from = parseUrlDate(one(params, "from"))
  let to = parseUrlDate(one(params, "to"))
  if (period === "custom") {
    if (!from || !to) period = "90d"
    else if (from > to) [from, to] = [to, from]
  }
  return {
    period,
    from: period === "custom" ? from : null,
    to: period === "custom" ? to : null,
    sort: one(params, "sort") === "rate" ? "rate" : "name",
  }
}

/** Intervalo inclusivo de datas de negócio do período. */
export function adherenceRange(filters: Pick<AdherenceFilters, "period" | "from" | "to">, today = todayBusinessDate()) {
  const back = (days: number) => {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - (days - 1))
    return d
  }
  const monthsBack = (months: number) => {
    const d = new Date(today)
    d.setUTCMonth(d.getUTCMonth() - months)
    d.setUTCDate(d.getUTCDate() + 1)
    return d
  }
  switch (filters.period) {
    case "30d":
      return { from: back(30), to: today }
    case "6m":
      return { from: monthsBack(6), to: today }
    case "12m":
      return { from: monthsBack(12), to: today }
    case "custom":
      return { from: filters.from ?? back(90), to: filters.to ?? today }
    default:
      return { from: back(90), to: today }
  }
}
