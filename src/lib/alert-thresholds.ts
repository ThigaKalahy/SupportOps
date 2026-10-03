/**
 * Limiares do motor de alertas (P15). Os ALERTAS são derivados em query e
 * nunca persistidos (D9); só os limiares ficam no banco (AlertThreshold, um
 * valor por chave), editáveis em /settings. Chave sem linha = padrão daqui.
 *
 * Puro: usado no servidor (motor, /team, timeline) e no cliente (selo de
 * arrasto), que recebe os valores do layout.
 */

export interface AlertThresholds {
  /** Combinado vencendo: prazo em até N dias. */
  dueSoonDays: number
  /** Combinado crônico: N ou mais reagendamentos, ainda em aberto. */
  chronicReschedules: number
  /** Sem 1:1 há mais de N dias, por chave de senioridade. */
  oneOnOneDays: Record<string, number>
  /** Para senioridade sem valor próprio (ex.: uma nova, criada depois). */
  defaultOneOnOneDays: number
  /** Silêncio gerencial: nenhum registro de qualquer tipo há mais de N dias. */
  silenceDays: number
  /** PDI parado: ativo sem acompanhamento há mais de N dias. */
  stalePlanDays: number
  /** Daily não registrada nos últimos N dias úteis. */
  dailyMissingDays: number
  /** Cumprimento em queda: queda de N pontos percentuais entre as janelas de 30 dias. */
  adherenceDropPoints: number
  /** ...com pelo menos N combinados devidos em cada janela. */
  adherenceMinSample: number
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  dueSoonDays: 3,
  chronicReschedules: 3,
  oneOnOneDays: { JUNIOR: 21, PLENO: 30, SENIOR: 30 },
  defaultOneOnOneDays: 30,
  silenceDays: 30,
  stalePlanDays: 45,
  dailyMissingDays: 2,
  adherenceDropPoints: 20,
  adherenceMinSample: 5,
}

type ScalarKey = Exclude<keyof AlertThresholds, "oneOnOneDays">

/** Chaves escalares com os limites aceitos no /settings. */
export const THRESHOLD_LIMITS: Record<ScalarKey, { min: number; max: number }> = {
  dueSoonDays: { min: 1, max: 30 },
  chronicReschedules: { min: 2, max: 10 },
  defaultOneOnOneDays: { min: 7, max: 120 },
  silenceDays: { min: 7, max: 120 },
  stalePlanDays: { min: 7, max: 180 },
  dailyMissingDays: { min: 1, max: 10 },
  adherenceDropPoints: { min: 5, max: 60 },
  adherenceMinSample: { min: 2, max: 20 },
}

export const ONE_ON_ONE_LIMITS = { min: 7, max: 120 } as const

/** Prefixo da chave de cadência por senioridade: "oneOnOneDays.JUNIOR". */
export const ONE_ON_ONE_PREFIX = "oneOnOneDays."

export function isScalarKey(key: string): key is ScalarKey {
  return key in THRESHOLD_LIMITS
}

/** Linhas do banco → limiares completos (o que falta fica no padrão). */
export function resolveThresholds(rows: { key: string; value: number }[]): AlertThresholds {
  const t: AlertThresholds = { ...DEFAULT_THRESHOLDS, oneOnOneDays: { ...DEFAULT_THRESHOLDS.oneOnOneDays } }
  for (const { key, value } of rows) {
    if (key.startsWith(ONE_ON_ONE_PREFIX)) t.oneOnOneDays[key.slice(ONE_ON_ONE_PREFIX.length)] = value
    else if (isScalarKey(key)) t[key] = value
  }
  return t
}

/** Referência de dias sem 1:1 para uma senioridade. */
export function oneOnOneLimit(t: AlertThresholds, seniorityKey: string): number {
  return t.oneOnOneDays[seniorityKey] ?? t.defaultOneOnOneDays
}

/** Padrão de uma chave (para "voltar ao padrão" e para a tela mostrar). */
export function defaultFor(key: string): number {
  if (key.startsWith(ONE_ON_ONE_PREFIX)) {
    return DEFAULT_THRESHOLDS.oneOnOneDays[key.slice(ONE_ON_ONE_PREFIX.length)] ?? DEFAULT_THRESHOLDS.defaultOneOnOneDays
  }
  return isScalarKey(key) ? DEFAULT_THRESHOLDS[key] : 0
}
