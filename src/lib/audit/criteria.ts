/**
 * C23 Fase D — critérios da avaliação (documento do módulo, seção 6). Versionados: a versão vai
 * em cada execução (`AuditRun.criteriaVersion`) e mudar peso ou texto é versão NOVA — avaliações
 * antigas continuam com a versão que as gerou (mesma lógica da ScoreDefinition).
 *
 * Política de normalização (critério não aplicável), documentada aqui e na tela:
 *   nota final = soma dos pontos dos critérios APLICÁVEIS ÷ soma dos pesos aplicáveis × 100.
 * O critério que não se aplica sai do denominador (não vira zero nem nota cheia). A soma bruta
 * e cada nota por critério ficam guardadas ao lado da final. Com menos de metade do peso
 * aplicável, a nota vai para revisão humana; sem nenhum, não há nota.
 */

import { labels } from "../labels.ts"

export type CriterionKey = "communication" | "investigation" | "conduct" | "resolution" | "expectations" | "closing"

export interface Criterion {
  key: CriterionKey
  weight: number
  /** O que avaliar — vai no prompt e aparece na tela. */
  guidance: string
}

const V1: Criterion[] = [
  {
    key: "communication",
    weight: 20,
    guidance: "Clareza, educação, linguagem adequada, empatia e capacidade de transmitir informações compreensíveis.",
  },
  {
    key: "investigation",
    weight: 25,
    guidance:
      "Perguntas realizadas, coleta de informações, investigação da causa e coerência do diagnóstico apresentado. Não presuma que o diagnóstico estava correto só porque foi apresentado de forma convincente.",
  },
  {
    key: "conduct",
    weight: 20,
    guidance: "Organização, direcionamento, responsabilidade pelo atendimento e iniciativa diante das necessidades identificadas.",
  },
  {
    key: "resolution",
    weight: 20,
    guidance:
      "Se o problema foi resolvido ou se houve encaminhamento apropriado. Não penalize automaticamente um atendimento que dependa legitimamente de outra equipe.",
  },
  {
    key: "expectations",
    weight: 10,
    guidance:
      "Comunicação de prazos, atualização de status, transparência e definição dos próximos passos. Não exija compromisso com prazo inexistente ou fora da autonomia do analista.",
  },
  {
    key: "closing",
    weight: 5,
    guidance: "Orientação final, confirmação quando aplicável e clareza sobre a continuidade ou conclusão do atendimento.",
  },
]

export const CRITERIA_VERSIONS: Record<string, Criterion[]> = { v1: V1 }

export const CRITERION_KEYS: CriterionKey[] = V1.map((c) => c.key)

export function criteriaFor(version: string): Criterion[] | null {
  return CRITERIA_VERSIONS[version] ?? null
}

/** Rótulo na tela (único ponto de tradução: labels.ts). */
export function criterionLabel(key: string): string {
  return (labels.audit.criteria as Record<string, string>)[key] ?? key
}

/** Abaixo desta fração do peso total aplicável, a nota vai para revisão humana. */
export const MIN_APPLICABLE_WEIGHT_SHARE = 0.5

export interface CriterionResult {
  key: CriterionKey
  applicable: boolean
  score: number | null
}

export interface ScoreBreakdown {
  /** Soma dos pontos dos aplicáveis (bruta). */
  rawPoints: number
  /** Soma dos pesos dos aplicáveis (o denominador). */
  applicableWeight: number
  totalWeight: number
  /** 0–100 com duas casas, ou null sem critério aplicável. */
  finalScore: number | null
  /** Pouco peso aplicável: a nota existe, mas pede revisão. */
  lowCoverage: boolean
}

/** Nota final pela política de normalização (ver o topo do arquivo). */
export function computeScore(criteria: Criterion[], results: CriterionResult[]): ScoreBreakdown {
  const totalWeight = criteria.reduce((n, c) => n + c.weight, 0)
  let rawPoints = 0
  let applicableWeight = 0
  for (const c of criteria) {
    const r = results.find((x) => x.key === c.key)
    if (!r || !r.applicable || r.score === null) continue
    rawPoints += r.score
    applicableWeight += c.weight
  }
  const finalScore = applicableWeight === 0 ? null : Math.round((rawPoints / applicableWeight) * 10_000) / 100
  return {
    rawPoints: Math.round(rawPoints * 100) / 100,
    applicableWeight,
    totalWeight,
    finalScore,
    lowCoverage: applicableWeight < totalWeight * MIN_APPLICABLE_WEIGHT_SHARE,
  }
}
