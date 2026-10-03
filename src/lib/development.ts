import { businessDaysBetween, todayBusinessDate, toSaoPaulo } from "./dates.ts"
import { ageSeverity, type GradedSeverity, type AgeStage } from "./severity.ts"

/**
 * Desenvolvimento — regras puras. Um PDI sem acompanhamento é um PDI morto:
 * a idade do último acompanhamento (ou do início, se nunca houve) usa a escala
 * graduada — âmbar a partir de 30 dias, laranja depois de 45 (parado),
 * vermelho depois de 90.
 *
 * Prontidão para a próxima senioridade NÃO é nota: só aparece para quem
 * atende a TODAS as competências esperadas da senioridade atual, e diz em
 * quantas competências já atende ao nível esperado da próxima. Sem score, sem
 * porcentagem, sem ordem entre pessoas.
 */

export const PLAN_REVIEW_THRESHOLDS = { attention: 30, strong: 45, overdue: 90 } as const

/** PDI parado: sem acompanhamento há mais de 45 dias. */
export const STALE_PLAN_DAYS = PLAN_REVIEW_THRESHOLDS.strong

export interface PlanStaleness {
  /** Dias desde o último acompanhamento (ou desde o início, se nunca acompanhado). */
  days: number
  neverReviewed: boolean
  stale: boolean
  severity: GradedSeverity<AgeStage>
}

/**
 * lastReviewedAt é instante (timestamptz); startedAt é data de negócio.
 * `staleDays`: limiar de "PDI parado" (configurável em /settings; padrão 45).
 * A escala de cor (30/45/90) é fixa.
 */
export function planStaleness(
  plan: { lastReviewedAt: Date | null; startedAt: Date },
  today = todayBusinessDate(),
  staleDays: number = STALE_PLAN_DAYS,
): PlanStaleness {
  const reference = plan.lastReviewedAt
    ? (() => {
        const sp = toSaoPaulo(plan.lastReviewedAt)
        return new Date(Date.UTC(sp.getFullYear(), sp.getMonth(), sp.getDate()))
      })()
    : plan.startedAt
  const days = Math.max(0, businessDaysBetween(reference, today))
  return {
    days,
    neverReviewed: plan.lastReviewedAt === null,
    stale: days > staleDays,
    severity: ageSeverity(days, PLAN_REVIEW_THRESHOLDS),
  }
}

/** Progresso em ações: concluídas de válidas (canceladas não contam). */
export function planProgress(actions: { status: string }[]): { done: number; total: number } {
  const valid = actions.filter((a) => a.status !== "CANCELLED")
  return { done: valid.filter((a) => a.status === "DONE").length, total: valid.length }
}

export interface SeniorityLevelMap {
  seniorityId: string
  label: string
  order: number
  /** competencyId → nível esperado. */
  expected: Map<string, number>
}

export interface Readiness {
  next: { seniorityId: string; label: string }
  /** Competências com nível esperado definido na próxima senioridade. */
  total: number
  /** Dessas, em quantas o nível atual já atende. */
  met: number
}

/**
 * Prontidão para a próxima senioridade, ou null quando não se aplica: sem
 * próxima senioridade, matriz da atual ou da próxima vazia, ou alguma
 * competência da atual abaixo do esperado (competência não avaliada conta
 * como abaixo).
 */
export function readiness(
  currentSeniorityId: string,
  seniorities: SeniorityLevelMap[],
  levels: Map<string, number>,
): Readiness | null {
  const ordered = [...seniorities].sort((a, b) => a.order - b.order)
  const index = ordered.findIndex((s) => s.seniorityId === currentSeniorityId)
  const current = ordered[index]
  const next = ordered[index + 1]
  if (!current || !next || current.expected.size === 0 || next.expected.size === 0) return null
  for (const [competencyId, expected] of current.expected) {
    if ((levels.get(competencyId) ?? 0) < expected) return null
  }
  let met = 0
  for (const [competencyId, expected] of next.expected) {
    if ((levels.get(competencyId) ?? 0) >= expected) met++
  }
  return { next: { seniorityId: next.seniorityId, label: next.label }, total: next.expected.size, met }
}
