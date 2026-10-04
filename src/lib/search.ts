/**
 * Busca global (P16) — regras puras. O servidor faz a busca com Postgres
 * full-text em português (colunas tsvector geradas, sem acento); aqui ficam a
 * montagem da consulta a partir do que a pessoa digitou e o trecho com o termo
 * destacado. Comparação sempre sem acento e sem caixa: "relatorio" acha
 * "Relatório".
 */

export const SEARCH_KINDS = ["person", "oneOnOne", "feedback", "note", "agreement", "other"] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

export const SEARCH_PERIODS = ["30d", "3m", "6m", "12m", "all"] as const
export type SearchPeriod = (typeof SEARCH_PERIODS)[number]

export const SEARCH_PARAMS = { q: "q", type: "type", period: "period" } as const
export const MIN_QUERY = 2
export const MAX_QUERY = 120
const MAX_TERMS = 8

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

/** Palavras da busca: letras e números, sem acento, sem repetição. */
export function searchTerms(query: string): string[] {
  const words = normalize(query.slice(0, MAX_QUERY)).match(/[\p{L}\p{N}]+/gu) ?? []
  return [...new Set(words)].slice(0, MAX_TERMS)
}

/**
 * tsquery do Postgres: todas as palavras (E), cada uma como prefixo — a
 * paleta busca enquanto se digita. Só letras e números entram: nada do
 * texto do usuário vira operador. null quando não há o que buscar.
 */
export function toTsQuery(query: string): string | null {
  const terms = searchTerms(query)
  if (terms.join("").length < MIN_QUERY) return null
  return terms.map((t) => `${t}:*`).join(" & ")
}

/** Trecho de texto com as partes que casam marcadas. */
export type Highlighted = { text: string; match: boolean }[]

/**
 * A palavra do texto "casa" com o termo quando começa por ele, ou quando os
 * dois têm o mesmo radical aproximado (o dicionário português reduz
 * "relatórios" e "relatório" à mesma raiz; aqui, prefixo comum de pelo menos
 * 4 letras cobrindo quase o termo inteiro).
 */
function matches(word: string, term: string): boolean {
  if (word.startsWith(term)) return true
  if (term.length < 5) return false
  const stem = term.slice(0, Math.max(4, term.length - 2))
  return word.startsWith(stem)
}

const WINDOW = 160

/**
 * Trecho de até ~160 caracteres em volta da primeira ocorrência, com
 * reticências quando corta, e cada palavra que casa marcada. Sem
 * ocorrência (o termo casou em outro campo), o começo do texto.
 */
export function highlight(text: string, query: string, window = WINDOW): Highlighted {
  const terms = searchTerms(query)
  const clean = text.replace(/\s+/g, " ").trim()
  const words = [...clean.matchAll(/[\p{L}\p{N}]+/gu)]
  const isHit = (w: string) => terms.some((t) => matches(normalize(w), t))
  const first = words.find((w) => isHit(w[0]))

  let start = 0
  if (first?.index !== undefined && first.index > window / 3) {
    start = clean.lastIndexOf(" ", first.index - Math.floor(window / 4)) + 1
  }
  let end = Math.min(clean.length, start + window)
  if (end < clean.length) {
    const cut = clean.lastIndexOf(" ", end)
    if (cut > start) end = cut
  }
  const slice = clean.slice(start, end)

  const parts: Highlighted = []
  if (start > 0) parts.push({ text: "…", match: false })
  let last = 0
  for (const w of slice.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (!isHit(w[0]) || w.index === undefined) continue
    if (w.index > last) parts.push({ text: slice.slice(last, w.index), match: false })
    parts.push({ text: w[0], match: true })
    last = w.index + w[0].length
  }
  if (last < slice.length) parts.push({ text: slice.slice(last), match: false })
  if (end < clean.length) parts.push({ text: "…", match: false })
  return parts
}

/** Primeiro dia (data de negócio) do período, ou null para "tudo". */
export function searchPeriodStart(period: SearchPeriod, today: Date): Date | null {
  if (period === "all") return null
  const start = new Date(today)
  if (period === "30d") start.setUTCDate(start.getUTCDate() - 29)
  else start.setUTCMonth(start.getUTCMonth() - (period === "3m" ? 3 : period === "6m" ? 6 : 12))
  return start
}

export interface SearchFilters {
  q: string
  type: SearchKind | null
  period: SearchPeriod
}

type Params = Record<string, string | string[] | undefined>

export function parseSearchFilters(params: Params): SearchFilters {
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string).trim() : "")
  const type = one(SEARCH_PARAMS.type)
  const period = one(SEARCH_PARAMS.period)
  return {
    q: one(SEARCH_PARAMS.q).slice(0, MAX_QUERY),
    type: SEARCH_KINDS.includes(type as SearchKind) ? (type as SearchKind) : null,
    period: SEARCH_PERIODS.includes(period as SearchPeriod) ? (period as SearchPeriod) : "all",
  }
}
