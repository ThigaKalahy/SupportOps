/**
 * Cumprimento de combinados — regras puras, compartilhadas pelas consultas
 * (src/server/queries/adherence.ts), pelo SQL de /team (alerta de queda) e
 * pelas telas. Nada aqui é persistido (D19): toda taxa é calculada na hora
 * sobre originalDueDate (D17), completedAt e os AgreementCheckin.
 *
 * Definições:
 * - Combinado "devido" no período: originalDueDate dentro do período e já
 *   chegado (o período nunca passa de hoje). Aberto com prazo original hoje
 *   ainda pode ser cumprido no prazo: fica de fora (pending) até amanhã.
 * - No prazo: DONE com completedAt <= originalDueDate. Com atraso: DONE depois.
 *   Em aberto vencido: OPEN/IN_PROGRESS com originalDueDate < hoje.
 *   Cancelado (inclusive substituído na daily) conta no total e não é cumprido.
 * - Ajustado (D18): sai do denominador o combinado NÃO cumprido no prazo cujo
 *   último impeditivo registrado é de categoria EXTERNAL. Cumprido no prazo
 *   nunca sai (senão a taxa ajustada passaria de 100%).
 * - Toda taxa carrega o denominador (D19); abaixo de 5 combinados, a taxa vem
 *   marcada como de baixa confiança e a tela é obrigada a sinalizar.
 */

export const ADHERENCE = {
  /** Abaixo disso a taxa é de baixa confiança e não entra em média de time. */
  minSample: 5,
  /** Janela da tendência e do alerta de queda. */
  trendDays: 30,
  /** Queda, em pontos percentuais, que dispara "cumprimento em queda". */
  dropPoints: 20,
  /** Reagendamentos a partir dos quais o combinado é crônico. */
  chronicReschedules: 3,
} as const

export interface Rate {
  /** Fração 0–1; null sem denominador. */
  value: number | null
  numerator: number
  denominator: number
  /** denominador < ADHERENCE.minSample. A tela sinaliza. */
  lowConfidence: boolean
}

export function makeRate(numerator: number, denominator: number): Rate {
  return {
    value: denominator === 0 ? null : numerator / denominator,
    numerator,
    denominator,
    lowConfidence: denominator < ADHERENCE.minSample,
  }
}

/** Percentual inteiro de uma taxa, ou null. */
export function percent(rate: Pick<Rate, "value">): number | null {
  return rate.value === null ? null : Math.round(rate.value * 100)
}

export type AgreementStatusLike = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED"

/** O mínimo de um combinado para medir cumprimento. */
export interface AdherenceAgreement {
  id: string
  status: AgreementStatusLike
  originalDueDate: Date
  completedAt: Date | null
  /** Checkins com novo prazo. */
  reschedules: number
  /** Categoria do último impeditivo com motivo registrado, se houver. */
  lastBlockerCategory: "EXTERNAL" | "INTERNAL" | "CAPACITY" | null
}

export interface Adherence {
  from: Date
  /** Fim efetivo: nunca depois de hoje. */
  to: Date
  totalDue: number
  doneOnTime: number
  doneLate: number
  stillOpen: number
  cancelled: number
  /** Abertos com prazo original hoje: ainda não contam. */
  pending: number
  adherenceRate: Rate
  adjustedTotal: number
  /** Sempre exibida JUNTO com adherenceRate, nunca no lugar. */
  adjustedRate: Rate
  avgReschedules: number | null
  maxReschedules: number
  chronicCount: number
  chronicIds: string[]
}

const isOpen = (s: AgreementStatusLike) => s === "OPEN" || s === "IN_PROGRESS"

/** O combinado entra no total? (prazo original no período, já chegado, e não pendente hoje). */
export function isDue(a: Pick<AdherenceAgreement, "status" | "originalDueDate">, today: Date): boolean {
  return !(isOpen(a.status) && a.originalDueDate.getTime() >= today.getTime())
}

export function isOnTime(a: Pick<AdherenceAgreement, "status" | "originalDueDate" | "completedAt">): boolean {
  return a.status === "DONE" && a.completedAt !== null && a.completedAt.getTime() <= a.originalDueDate.getTime()
}

/** Período efetivo: o fim nunca passa de hoje. */
export function clampPeriod(from: Date, to: Date, today: Date): { from: Date; to: Date } {
  return { from, to: to.getTime() > today.getTime() ? today : to }
}

/**
 * Cumprimento de um conjunto de combinados cujo originalDueDate já está
 * dentro do período (o filtro de período é da consulta).
 */
export function computeAdherence(agreements: AdherenceAgreement[], period: { from: Date; to: Date }, today: Date): Adherence {
  const due = agreements.filter((a) => isDue(a, today))
  const onTime = due.filter(isOnTime)
  const doneLate = due.filter((a) => a.status === "DONE" && !isOnTime(a)).length
  const stillOpen = due.filter((a) => isOpen(a.status)).length
  const cancelled = due.filter((a) => a.status === "CANCELLED").length
  const externallyBlocked = due.filter((a) => !isOnTime(a) && a.lastBlockerCategory === "EXTERNAL").length
  const adjustedTotal = due.length - externallyBlocked
  const reschedules = due.map((a) => a.reschedules)
  const chronic = due.filter((a) => a.reschedules >= ADHERENCE.chronicReschedules)
  return {
    from: period.from,
    to: period.to,
    totalDue: due.length,
    doneOnTime: onTime.length,
    doneLate,
    stillOpen,
    cancelled,
    pending: agreements.length - due.length,
    adherenceRate: makeRate(onTime.length, due.length),
    adjustedTotal,
    adjustedRate: makeRate(onTime.length, adjustedTotal),
    avgReschedules: due.length === 0 ? null : reschedules.reduce((s, n) => s + n, 0) / due.length,
    maxReschedules: reschedules.length === 0 ? 0 : Math.max(...reschedules),
    chronicCount: chronic.length,
    chronicIds: chronic.map((a) => a.id),
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

/** Janelas da tendência: últimos 30 dias (até hoje) e os 30 anteriores. */
export function trendWindows(today: Date) {
  const days = ADHERENCE.trendDays
  return {
    current: { from: addDays(today, -(days - 1)), to: today },
    previous: { from: addDays(today, -(2 * days - 1)), to: addDays(today, -days) },
  }
}

export interface Trend {
  current: Rate
  previous: Rate
  /** Diferença em pontos percentuais (atual − anterior); null se faltar taxa. */
  deltaPoints: number | null
  /** As duas janelas têm amostra suficiente: só então a tendência vale. */
  reliable: boolean
}

export function makeTrend(current: Rate, previous: Rate): Trend {
  const a = percent(current)
  const b = percent(previous)
  return {
    current,
    previous,
    deltaPoints: a === null || b === null ? null : a - b,
    reliable: !current.lowConfidence && !previous.lowConfidence,
  }
}

/** Queda de 20 pontos ou mais com amostra suficiente nas duas janelas. */
export function isDropping(trend: Trend): boolean {
  return trend.reliable && trend.deltaPoints !== null && trend.deltaPoints <= -ADHERENCE.dropPoints
}

/** Primeiro dia do mês de uma data de negócio. */
export function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

/** Últimos N meses (o corrente incluído), do mais antigo ao mais recente: [início, fim]. */
export function lastMonths(today: Date, months: number): { from: Date; to: Date }[] {
  const out: { from: Date; to: Date }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))
    const end = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0))
    out.push({ from, to: end.getTime() > today.getTime() ? today : end })
  }
  return out
}
