import type { TimelineEventType } from "@prisma/client"

/**
 * Filtros da timeline de uma pessoa, guardados na URL (linkáveis e
 * resistentes a refresh): ?types=ONE_ON_ONE,FEEDBACK&period=3m&q=texto.
 * Sem parâmetro = todos os tipos, todo o período, sem busca.
 */

export const TIMELINE_TYPES = [
  "ONE_ON_ONE",
  "FEEDBACK",
  "RECOGNITION",
  "AGREEMENT",
  "AGREEMENT_DONE",
  "DAILY",
  "NOTE",
  "WATCH",
  "INCIDENT",
  "DEVELOPMENT",
  "SENIORITY_CHANGE",
  "ROLE_CHANGE",
] as const satisfies readonly TimelineEventType[]

export const TIMELINE_PERIODS = ["30d", "3m", "6m", "all"] as const
export type TimelinePeriod = (typeof TIMELINE_PERIODS)[number]

export interface TimelineFilters {
  /** Vazio = todos os tipos. */
  types: TimelineEventType[]
  period: TimelinePeriod
  q: string
}

export const TIMELINE_PARAMS = { types: "types", period: "period", q: "q" } as const

const MAX_QUERY = 120

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams

function read(params: RawParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

export function parseTimelineFilters(params: RawParams): TimelineFilters {
  const types = (read(params, TIMELINE_PARAMS.types) ?? "")
    .split(",")
    .filter((t): t is TimelineEventType => (TIMELINE_TYPES as readonly string[]).includes(t))
  const period = read(params, TIMELINE_PARAMS.period)
  return {
    types: [...new Set(types)],
    period: (TIMELINE_PERIODS as readonly string[]).includes(period ?? "") ? (period as TimelinePeriod) : "all",
    q: (read(params, TIMELINE_PARAMS.q) ?? "").trim().slice(0, MAX_QUERY),
  }
}

export function isFiltered(filters: TimelineFilters): boolean {
  return filters.types.length > 0 || filters.period !== "all" || filters.q !== ""
}

/** Chave estável dos filtros (para recomeçar a lista quando eles mudam). */
export function filtersKey(filters: TimelineFilters): string {
  return `${[...filters.types].sort().join(",")}|${filters.period}|${filters.q}`
}

/** Início do período como instante (null = tudo). */
export function periodStart(period: TimelinePeriod, now: Date = new Date()): Date | null {
  if (period === "all") return null
  const start = new Date(now)
  if (period === "30d") start.setUTCDate(start.getUTCDate() - 30)
  if (period === "3m") start.setUTCMonth(start.getUTCMonth() - 3)
  if (period === "6m") start.setUTCMonth(start.getUTCMonth() - 6)
  return start
}
