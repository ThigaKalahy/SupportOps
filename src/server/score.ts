/**
 * Métricas operacionais são insumo de conversa, não substituto de avaliação,
 * e nenhum score pode ser exibido sem o breakdown que o explica.
 *
 * Este arquivo contém APENAS tipos (P17, D5). Não há fórmula, cálculo,
 * normalização implementada nem integração com helpdesk. O que existe no
 * produto é o cadastro (MetricDefinition, ScoreDefinition versionada e
 * ScoreComponent, em /settings) e a pré-visualização da composição — que é
 * documentação viva da fórmula, não execução dela. O contrato de importação
 * futura está no CLAUDE.md ("Contrato de importação de métricas").
 */

/** Direção de uma métrica: o que significa "melhor" para ela. */
export type MetricDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER"

/**
 * Uma linha importada do helpdesk (contrato futuro, ver CLAUDE.md). Uma
 * métrica, uma pessoa, um período fechado. `sampleSize` é obrigatório: número
 * sem cobertura é mentira.
 */
export interface MetricResultImport {
  /** MetricDefinition.key da organização (ex.: "csat"). */
  metricKey: string
  /** Chave de correspondência com TeamMember (e-mail do analista no helpdesk). */
  memberEmail: string
  /** Primeiro e último dia do período (datas de negócio, "AAAA-MM-DD" na carga). */
  periodStart: string
  periodEnd: string
  value: number
  /** Quantos chamados/avaliações formaram o valor. Nunca opcional. */
  sampleSize: number
  /** Identificador do lote ou relatório de origem, para auditoria. */
  sourceRef?: string
}

/** Componente de uma definição de score: métrica, peso e faixa de normalização. */
export interface ScoreComponentSpec {
  metricKey: string
  direction: MetricDirection
  /** Peso em pontos percentuais; os pesos de uma versão somam 100. */
  weight: number
  normalizationMin: number
  normalizationMax: number
}

/** Uma versão de definição de score. Alterar pesos cria versão nova. */
export interface ScoreDefinitionSpec {
  name: string
  version: number
  components: ScoreComponentSpec[]
}

/**
 * Parcela de um score já calculado (ScoreResultComponent). Todo score
 * exibido precisa poder ser aberto até aqui.
 */
export interface ScoreBreakdownItem {
  metricKey: string
  rawValue: number
  /** Cobertura do valor bruto (MetricResult.sampleSize). */
  sampleSize: number
  normalizedValue: number
  weight: number
  contribution: number
}

/** Score explicável: o número nunca anda sem as parcelas que o formaram. */
export interface ExplainedScore {
  scoreDefinitionId: string
  version: number
  memberId: string
  periodStart: Date
  periodEnd: Date
  value: number
  breakdown: ScoreBreakdownItem[]
}
