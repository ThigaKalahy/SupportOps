/**
 * Módulos opcionais por time (P22, D32). `TeamModule.moduleKey` é texto livre no
 * banco para que acrescentar módulo não exija migration; as chaves VÁLIDAS são só
 * estas. Gating em três camadas: navegação (o item some), rota (a página lança) e
 * Server Action/query (`requireModule` em src/server/scope.ts).
 *
 * Tudo o mais é core e não é modulável: Hoje, Em observação, Equipe, Perfil,
 * Timeline, Combinados, Dailies, Registros, Desenvolvimento.
 */
export const MODULES = {
  /** /priority-validations */
  PRIORITY_VALIDATION: "PRIORITY_VALIDATION",
  /** /dev-returns */
  DEV_RETURNS: "DEV_RETURNS",
  /** O campo central em combinados e validações, e /settings/centrals. */
  CENTRALS: "CENTRALS",
} as const

export type ModuleKey = (typeof MODULES)[keyof typeof MODULES]

export const MODULE_KEYS: readonly ModuleKey[] = Object.values(MODULES)

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value)
}
