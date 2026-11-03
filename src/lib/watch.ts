import type { AlertThresholds } from "./alert-thresholds.ts"
import { addBusinessDays, todayBusinessDate } from "./dates.ts"
import { labels, plural } from "./labels.ts"
import type { Severity } from "./severity.ts"

/**
 * Em observação (P21, D24–D27): regras puras, sem banco. Estado de revisão,
 * "fogo alto frio" e "observação parada" são DERIVADOS (D9) de
 * `lastReviewedAt`, `heatChangedAt`, `reviewCount` e das cadências de
 * /settings — nunca persistidos.
 */

export const WATCH_HEATS = ["HIGH", "MEDIUM", "LOW"] as const
export type WatchHeat = (typeof WATCH_HEATS)[number]

export const WATCH_STATUSES = ["ACTIVE", "RESOLVED", "ARCHIVED"] as const
export type WatchStatus = (typeof WATCH_STATUSES)[number]

export const WATCH_ORIGINS = ["DAILY", "AGREEMENT", "PRIORITY_VALIDATION", "DEV_RETURN", "ONE_ON_ONE", "FEEDBACK", "MANUAL"] as const
export type WatchOrigin = (typeof WATCH_ORIGINS)[number]

/** "Observação parada": criada e nunca revisada há mais de N dias. */
export const WATCH_STALLED_DAYS = 14

/** Cor do grau no selo: fogo alto em vermelho, médio em âmbar, baixo neutro. */
export const HEAT_SEVERITY: Record<WatchHeat, Severity> = { HIGH: "overdue", MEDIUM: "attention", LOW: "neutral" }

export function cadenceDays(heat: WatchHeat, t: AlertThresholds): number {
  return heat === "HIGH" ? t.watchHighCadenceDays : heat === "MEDIUM" ? t.watchMediumCadenceDays : t.watchLowCadenceDays
}

/** Um grau acima / abaixo; null no extremo. */
export function hotter(heat: WatchHeat): WatchHeat | null {
  return heat === "LOW" ? "MEDIUM" : heat === "MEDIUM" ? "HIGH" : null
}
export function cooler(heat: WatchHeat): WatchHeat | null {
  return heat === "HIGH" ? "MEDIUM" : heat === "MEDIUM" ? "LOW" : null
}

const DAY = 86_400_000

/** Dias corridos entre dois instantes, pelo dia de calendário em São Paulo. */
export function daysBetween(from: Date, to: Date): number {
  const day = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
    return Date.parse(`${parts}T00:00:00Z`)
  }
  return Math.max(0, Math.round((day(to) - day(from)) / DAY))
}

export type ReviewStatus = "ok" | "due" | "late"

export interface ReviewState {
  status: ReviewStatus
  /** neutral em dia; attention passou da cadência; overdue passou do dobro. */
  severity: Severity
  daysSinceReview: number
  cadence: number
}

/** "Sem revisão": última revisão + cadência do grau < hoje; "muito atrasada" acima do dobro. */
export function reviewState(item: { heat: WatchHeat; lastReviewedAt: Date }, now: Date, t: AlertThresholds): ReviewState {
  const cadence = cadenceDays(item.heat, t)
  const days = daysBetween(item.lastReviewedAt, now)
  if (days > cadence * 2) return { status: "late", severity: "overdue", daysSinceReview: days, cadence }
  if (days > cadence) return { status: "due", severity: "attention", daysSinceReview: days, cadence }
  return { status: "ok", severity: "neutral", daysSinceReview: days, cadence }
}

/**
 * "Fogo alto frio": HIGH e ativa, em fogo alto há mais de `watchStaleHighDays`
 * sem nenhuma revisão que tenha mudado o grau (`heatChangedAt` só muda quando o
 * grau muda). Devolve os dias, ou null.
 */
export function coldHighDays(
  item: { heat: WatchHeat; status: WatchStatus; heatChangedAt: Date },
  now: Date,
  t: AlertThresholds,
): number | null {
  if (item.heat !== "HIGH" || item.status !== "ACTIVE") return null
  const days = daysBetween(item.heatChangedAt, now)
  return days > t.watchStaleHighDays ? days : null
}

/** "Observação parada": ativa, nunca revisada, criada há mais de 14 dias. Devolve os dias, ou null. */
export function stalledDays(item: { status: WatchStatus; reviewCount: number; createdAt: Date }, now: Date): number | null {
  if (item.status !== "ACTIVE" || item.reviewCount > 0) return null
  const days = daysBetween(item.createdAt, now)
  return days > WATCH_STALLED_DAYS ? days : null
}

/**
 * Entra na home ("Precisa de você")? Fogo alto e médio sem revisão, sim; fogo
 * baixo só passado o dobro da cadência — se tudo aparece, nada é urgente
 * (mesma razão do D28).
 */
export function showsOnHome(heat: WatchHeat, state: ReviewState): boolean {
  if (state.status === "ok") return false
  return heat !== "LOW" || state.status === "late"
}

/** Ordem da tela: grau (alto primeiro), depois o mais esquecido. */
export function compareWatch(a: { heat: WatchHeat; lastReviewedAt: Date }, b: { heat: WatchHeat; lastReviewedAt: Date }): number {
  return WATCH_HEATS.indexOf(a.heat) - WATCH_HEATS.indexOf(b.heat) || a.lastReviewedAt.getTime() - b.lastReviewedAt.getTime()
}

/* ─────────────────────────── C22: prazo e urgência ─────────────────────────── */

/** Prazo sugerido para uma observação nova: hoje + N dias úteis do grau (Configurações › Limiares). */
export function defaultWatchDue(heat: WatchHeat, today: Date, t: AlertThresholds): Date {
  const days = heat === "HIGH" ? t.watchHighDueDays : heat === "MEDIUM" ? t.watchMediumDueDays : t.watchLowDueDays
  return addBusinessDays(today, days)
}

export interface WatchUrgency {
  /** 0 vermelho · 1 laranja · 2 âmbar · 3 em dia — a ordem da lista. */
  rank: 0 | 1 | 2 | 3
  severity: Severity
  /** Laranja: `attention` forte (DESIGN.md, escala graduada). */
  strong: boolean
  /** Dias até o prazo (negativo = vencido); null sem prazo. */
  daysToDue: number | null
}

/**
 * Urgência DERIVADA (D9), nunca gravada: o prazo e a revisão juntos.
 * - vermelho: prazo vencido, ou revisão muito atrasada (acima do dobro) em fogo alto;
 * - laranja: vence hoje ou amanhã, ou sem revisão;
 * - âmbar: vence em até 5 dias;
 * - em dia: o resto.
 */
export function watchUrgency(
  item: { heat: WatchHeat; lastReviewedAt: Date; dueDate: Date | null },
  now: Date,
  t: AlertThresholds,
  today: Date = todayBusinessDate(now),
): WatchUrgency {
  const review = reviewState(item, now, t)
  const daysToDue = item.dueDate ? Math.round((item.dueDate.getTime() - today.getTime()) / DAY) : null
  if ((daysToDue !== null && daysToDue < 0) || (review.status === "late" && item.heat === "HIGH")) {
    return { rank: 0, severity: "overdue", strong: false, daysToDue }
  }
  if ((daysToDue !== null && daysToDue <= 1) || review.status !== "ok") return { rank: 1, severity: "attention", strong: true, daysToDue }
  if (daysToDue !== null && daysToDue <= 5) return { rank: 2, severity: "attention", strong: false, daysToDue }
  return { rank: 3, severity: "neutral", strong: false, daysToDue }
}

/** Ordem por urgência (C22): mais urgente primeiro; empate pelo grau e pelo mais esquecido. */
export function compareWatchUrgency(
  a: { heat: WatchHeat; lastReviewedAt: Date; urgency: WatchUrgency },
  b: { heat: WatchHeat; lastReviewedAt: Date; urgency: WatchUrgency },
): number {
  return a.urgency.rank - b.urgency.rank || (a.urgency.daysToDue ?? 9999) - (b.urgency.daysToDue ?? 9999) || compareWatch(a, b)
}

/** "vence hoje", "vence em 3 dias", "venceu há 2 dias". */
export function dueLabel(daysToDue: number): string {
  const D = labels.watch.due
  if (daysToDue === 0) return D.today
  if (daysToDue > 0) return plural(D.in, daysToDue)
  return plural(D.overdue, -daysToDue)
}
