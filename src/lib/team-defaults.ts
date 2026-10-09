import type { BlockerCategory } from "@prisma/client"

/**
 * O MÍNIMO que um time novo precisa para o sistema funcionar (P24, D33). Nada
 * além disto: nenhuma pessoa, competência, responsabilidade, registro ou dado de
 * demonstração — o gestor cadastra o próprio time.
 *
 * As listas são as mesmas do time do Suporte (prisma/seed.ts), e são renomeáveis
 * em /settings depois.
 */

/** Senioridade é tabela (D3); as chaves casam com a cadência de 1:1 por senioridade. */
export const DEFAULT_SENIORITIES = [
  { key: "JUNIOR", label: "Júnior", order: 1 },
  { key: "PLENO", label: "Pleno", order: 2 },
  { key: "SENIOR", label: "Sênior", order: 3 },
] as const

/** Os nove motivos de impeditivo, com a categoria que separa cumprimento bruto de ajustado (D18). */
export const DEFAULT_BLOCKER_REASONS: readonly { label: string; category: BlockerCategory }[] = [
  { label: "Dependência de terceiro", category: "EXTERNAL" },
  { label: "Aguardando cliente", category: "EXTERNAL" },
  { label: "Falta de acesso ou permissão", category: "EXTERNAL" },
  { label: "Volume operacional", category: "CAPACITY" },
  { label: "Ausência (férias/licença)", category: "CAPACITY" },
  { label: "Prioridade alterada", category: "CAPACITY" },
  { label: "Falta de informação", category: "INTERNAL" },
  { label: "Escopo mal definido", category: "INTERNAL" },
  { label: "Outro", category: "INTERNAL" },
]

/** Cadências de "Em observação" (P21), gravadas explicitamente no time novo. */
export const DEFAULT_WATCH_CADENCES = {
  watchHighCadenceDays: 2,
  watchMediumCadenceDays: 7,
  watchLowCadenceDays: 21,
  watchStaleHighDays: 30,
} as const
