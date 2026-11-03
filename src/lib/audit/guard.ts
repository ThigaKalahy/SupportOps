import { labels } from "../labels.ts"
import { criteriaFor } from "./criteria.ts"

/**
 * C23 Fase D — as travas de uma avaliação, puras (testáveis sem banco). Conferidas ao pôr na fila
 * E de novo antes de cada conversa (o orçamento pode acabar no meio do lote).
 *
 * Simulação: só exige as avaliações ligadas e critérios conhecidos — não chama a OpenAI, custo
 * zero, não precisa de chave, preço nem orçamento. Avaliação real exige tudo: chave no servidor,
 * preços de entrada e saída, orçamento do mês e do lote maiores que zero e ainda não atingidos.
 */

export interface GuardInput {
  enabled: boolean
  simulation: boolean
  criteriaVersion: string
  keyConfigured: boolean
  inputPricePerMTok: number | null
  outputPricePerMTok: number | null
  monthlyBudgetUsd: number
  batchBudgetUsd: number
  monthSpentUsd: number
  batchSpentUsd: number
}

/** O motivo pelo qual nada pode ser avaliado agora, ou null. */
export function evaluationBlocker(g: GuardInput): string | null {
  const B = labels.audit.blockers
  if (!g.enabled) return B.disabled
  if (!criteriaFor(g.criteriaVersion)) return B.criteria
  if (g.simulation) return null
  if (!g.keyConfigured) return B.key
  if (g.inputPricePerMTok === null || g.outputPricePerMTok === null) return B.prices
  if (g.monthlyBudgetUsd <= 0) return B.monthlyZero
  if (g.batchBudgetUsd <= 0) return B.batchZero
  if (g.monthSpentUsd >= g.monthlyBudgetUsd) return B.monthlyReached
  if (g.batchSpentUsd >= g.batchBudgetUsd) return B.batchReached
  return null
}

/** A próxima avaliação, no pior caso, ainda cabe no orçamento do mês e do lote? */
export function budgetFits(g: GuardInput, worstCaseUsd: number): string | null {
  const B = labels.audit.blockers
  if (g.monthSpentUsd + worstCaseUsd > g.monthlyBudgetUsd) return B.monthlyNoRoom
  if (g.batchSpentUsd + worstCaseUsd > g.batchBudgetUsd) return B.batchNoRoom
  return null
}

/** Faixa de alerta do orçamento do mês: 0, 50, 80 ou 100 (%). */
export function budgetAlertLevel(spentUsd: number, budgetUsd: number): 0 | 50 | 80 | 100 {
  if (budgetUsd <= 0) return spentUsd > 0 ? 100 : 0
  const share = spentUsd / budgetUsd
  if (share >= 1) return 100
  if (share >= 0.8) return 80
  if (share >= 0.5) return 50
  return 0
}

/** Início do mês corrente em São Paulo (UTC−3, sem horário de verão), como instante. */
export function startOfMonthSaoPaulo(now: Date = new Date()): Date {
  const local = new Date(now.getTime() - 3 * 3_600_000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 3, 0, 0))
}
