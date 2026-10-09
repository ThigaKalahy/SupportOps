/**
 * Devolução do desenvolvimento (P20, D21, D22): regras puras, sem banco.
 *
 * Toda taxa sai com o denominador — o total de chamados validados no período
 * (D19) — e com `lowConfidence` abaixo de 20 chamados. A taxa atribuível ao
 * analista (motivos ANALYST) nunca substitui a taxa total: as duas vêm juntas.
 */

export const DEV_RETURN_CATEGORIES = ["ANALYST", "PROCESS"] as const
export type DevReturnCategory = (typeof DEV_RETURN_CATEGORIES)[number]

/** Abaixo disso, a taxa é marcada como amostra pequena. */
export const DEV_RETURN_MIN_SAMPLE = 20

/** Limiares dos alertas (P20). */
export const DEV_RETURN_ALERTS = {
  /** Devoluções ANALYST pelo mesmo motivo, na janela, para "Devoluções recorrentes". */
  recurringCount: 3,
  recurringWindowDays: 60,
  /** Dias sem reenvio para "Devolução sem reenvio". */
  unresolvedDays: 7,
} as const

/**
 * Catálogo inicial (o mesmo que a migration `dev_returns` grava em cada
 * organização existente e o seed grava numa organização nova).
 */
export const DEFAULT_DEV_RETURN_REASONS: { label: string; category: DevReturnCategory; requiresDetail: boolean }[] = [
  { label: "Falta de informação no chamado", category: "ANALYST", requiresDetail: false },
  { label: "Evidência insuficiente (sem log, print ou passo a passo)", category: "ANALYST", requiresDetail: false },
  { label: "Não é bug: comportamento esperado", category: "ANALYST", requiresDetail: false },
  { label: "Não é bug: erro de configuração", category: "ANALYST", requiresDetail: false },
  { label: "Não é bug: erro de uso ou falta de treinamento", category: "ANALYST", requiresDetail: false },
  { label: "Ambiente ou versão não informados", category: "ANALYST", requiresDetail: false },
  { label: "Central ou cliente não identificado", category: "ANALYST", requiresDetail: false },
  { label: "Chamado duplicado", category: "ANALYST", requiresDetail: false },
  { label: "Fora do escopo do desenvolvimento", category: "PROCESS", requiresDetail: false },
  { label: "Critério de triagem divergente entre as áreas", category: "PROCESS", requiresDetail: false },
  { label: "Informação solicitada não era necessária", category: "PROCESS", requiresDetail: false },
  { label: "Regra de negócio não documentada", category: "PROCESS", requiresDetail: false },
  { label: "Outro", category: "PROCESS", requiresDetail: true },
]

/** Taxa com o denominador sempre junto. `percent` é null sem chamado validado (nunca 0% de nada). */
export interface DevReturnRate {
  count: number
  /** Chamados validados no período. */
  total: number
  percent: number | null
  lowConfidence: boolean
}

export function devReturnRate(count: number, ticketsValidated: number): DevReturnRate {
  return {
    count,
    total: ticketsValidated,
    percent: ticketsValidated === 0 ? null : Math.round((count / ticketsValidated) * 100),
    lowConfidence: ticketsValidated < DEV_RETURN_MIN_SAMPLE,
  }
}

export interface DevReturnFact {
  category: DevReturnCategory
  /** Datas de negócio (meia-noite UTC). */
  returnedAt: Date
  resolvedAt: Date | null
}

export interface DevReturnStats {
  total: number
  /** Motivo ANALYST. */
  attributable: number
  /** Motivo PROCESS. */
  process: number
  /** Denominador: validações de prioridade no período. */
  ticketsValidated: number
  returnRate: DevReturnRate
  attributableRate: DevReturnRate
  resolved: number
  stillOpen: number
  /** Média de dias entre devolução e reenvio, dos reenviados; null sem nenhum. */
  avgDaysToResolve: number | null
  lowConfidence: boolean
}

const DAY = 86_400_000

/** Números do período a partir das devoluções e do total de chamados validados. */
export function devReturnStats(facts: readonly DevReturnFact[], ticketsValidated: number): DevReturnStats {
  const attributable = facts.filter((f) => f.category === "ANALYST").length
  const resolved = facts.filter((f) => f.resolvedAt !== null)
  const days = resolved.map((f) => Math.max(0, Math.round((f.resolvedAt!.getTime() - f.returnedAt.getTime()) / DAY)))
  return {
    total: facts.length,
    attributable,
    process: facts.length - attributable,
    ticketsValidated,
    returnRate: devReturnRate(facts.length, ticketsValidated),
    attributableRate: devReturnRate(attributable, ticketsValidated),
    resolved: resolved.length,
    stillOpen: facts.length - resolved.length,
    avgDaysToResolve: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
    lowConfidence: ticketsValidated < DEV_RETURN_MIN_SAMPLE,
  }
}

/** "7% (12 de 180 chamados)"; sem chamado validado, só a contagem. */
export function formatDevReturnRate(rate: DevReturnRate, texts: { withTotal: string; countOnly: string }): string {
  if (rate.percent === null) return texts.countOnly.replace("{count}", String(rate.count))
  return texts.withTotal
    .replace("{rate}", `${rate.percent}%`)
    .replace("{count}", String(rate.count))
    .replace("{total}", new Intl.NumberFormat("pt-BR").format(rate.total))
}
