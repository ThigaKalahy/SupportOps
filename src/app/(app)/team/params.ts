/**
 * Estado de /team na URL. Nomes de parâmetro em inglês, como as rotas (D6).
 * ?seniority=PLENO&status=inactive&attention=1&group=off
 */

export const TEAM_PARAMS = {
  seniority: "seniority",
  status: "status",
  attention: "attention",
  group: "group",
} as const

export interface TeamView {
  seniority: string | null
  status: "current" | "inactive"
  needsAttention: boolean
  /** Agrupar por senioridade: ligado por padrão. */
  grouped: boolean
}

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function parseTeamView(params: SearchParams, seniorityKeys: string[]): TeamView {
  const seniority = first(params[TEAM_PARAMS.seniority])
  return {
    seniority: seniority && seniorityKeys.includes(seniority) ? seniority : null,
    status: first(params[TEAM_PARAMS.status]) === "inactive" ? "inactive" : "current",
    needsAttention: first(params[TEAM_PARAMS.attention]) === "1",
    grouped: first(params[TEAM_PARAMS.group]) !== "off",
  }
}
