import type { Severity } from "./severity.ts"

/**
 * Regras puras da validação de prioridade, usadas no cliente (resultado ao
 * vivo, ID extraído ao colar) e no servidor (o que é gravado).
 */

export type ValidationOutcome = "MAINTAINED" | "RAISED" | "LOWERED" | "RETURNED"

export const VALIDATION_OUTCOMES = ["MAINTAINED", "RAISED", "LOWERED", "RETURNED"] as const satisfies readonly ValidationOutcome[]

/**
 * Resultado de uma validação. "Devolver" sobrepõe qualquer cálculo; sem as
 * duas prioridades ainda não há resultado. Rank maior = prioridade mais alta.
 */
export function computeOutcome(input: {
  analystRank: number | null
  supervisorRank: number | null
  returned: boolean
}): ValidationOutcome | null {
  if (input.returned) return "RETURNED"
  if (input.analystRank === null || input.supervisorRank === null) return null
  if (input.supervisorRank > input.analystRank) return "RAISED"
  if (input.supervisorRank < input.analystRank) return "LOWERED"
  return "MAINTAINED"
}

/** Cor do StatusPill de cada resultado. Elevar e rebaixar são atenção, não erro. */
export const OUTCOME_SEVERITY: Record<ValidationOutcome, Severity> = {
  MAINTAINED: "calm",
  RAISED: "attention",
  LOWERED: "attention",
  RETURNED: "overdue",
}

/** "Alterados" = elevados + rebaixados + devolvidos. */
export function isChanged(outcome: ValidationOutcome): boolean {
  return outcome !== "MAINTAINED"
}

/** Taxa em % inteiro, ou null sem denominador (nunca 0% de nada). */
export function rate(part: number, total: number): number | null {
  return total === 0 ? null : Math.round((part / total) * 100)
}

export interface TicketPattern {
  id: string
  regex: string
  captureGroup: number
}

/** Compila um padrão de URL; null se a expressão for inválida. */
export function compilePattern(regex: string): RegExp | null {
  try {
    return new RegExp(regex, "g")
  } catch {
    return null
  }
}

/**
 * Aplica UM padrão a todas as ocorrências na URL e fica com a captura mais
 * longa (o padrão genérico `(\d+)` casaria também com "2" de "/v2/").
 */
export function matchPattern(url: string, pattern: Pick<TicketPattern, "regex" | "captureGroup">): string | null {
  const re = compilePattern(pattern.regex)
  if (!re) return null
  let best: string | null = null
  for (const match of url.matchAll(re)) {
    const value = match[pattern.captureGroup]
    if (value && (best === null || value.length > best.length)) best = value
  }
  return best
}

/**
 * ID do chamado: aplica os padrões ativos EM ORDEM e para no primeiro que
 * casar. Null quando nenhum reconhece — o registro segue com ID digitado.
 */
export function extractTicketRef(url: string, patterns: TicketPattern[]): { ref: string; patternId: string } | null {
  const text = url.trim()
  if (!text) return null
  for (const pattern of patterns) {
    const ref = matchPattern(text, pattern)
    if (ref) return { ref, patternId: pattern.id }
  }
  return null
}

/** URL navegável (para o link "abrir chamado"); texto solto não vira link. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
