/**
 * Composição de uma definição de score (P17) — regras do CADASTRO, não do
 * cálculo. Nada aqui recebe valor de métrica, normaliza ou soma resultado:
 * não existe fórmula no MVP (D5). Só a soma dos pesos (que precisa fechar
 * 100 para a versão ser ativada) e o que trava a edição de uma versão.
 */

/** Pesos em pontos percentuais: uma versão ativa soma exatamente isto. */
export const WEIGHT_TOTAL = 100

export function weightSum(components: { weight: number }[]): number {
  // Pesos com até uma casa decimal: arredonda para não cair em 99,99999.
  return Math.round(components.reduce((sum, c) => sum + c.weight, 0) * 10) / 10
}

export type ActivationProblem = "noComponents" | "weightSum"

/** Por que a versão ainda não pode ser ativada (lista vazia = pode). */
export function activationProblems(components: { weight: number }[]): ActivationProblem[] {
  const problems: ActivationProblem[] = []
  if (components.length === 0) problems.push("noComponents")
  if (weightSum(components) !== WEIGHT_TOTAL) problems.push("weightSum")
  return problems
}

/**
 * Versão editável: rascunho (inativa) e sem nenhum resultado calculado.
 * Ativa ou com resultado, mudar peso exige versão nova — senão o passado
 * seria reescrito.
 */
export function isEditable(definition: { isActive: boolean; results: number }): boolean {
  return !definition.isActive && definition.results === 0
}
