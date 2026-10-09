import { labels } from "./labels.ts"
import { MODULES, type ModuleKey } from "./modules.ts"

const S = labels.settings

export interface SettingsTab {
  href: string
  label: string
  exact?: boolean
  /** O catálogo só existe com ALGUM destes módulos ligados no time (D32). Sem lista: core. */
  modules?: ModuleKey[]
  /** Só para quem administra a plataforma (`isPlatformAdmin`, P23). */
  platformAdmin?: boolean
}

/** Abas de /settings, uma por catálogo, na ordem de exibição. */
export const SETTINGS_TABS: SettingsTab[] = [
  { href: "/settings", label: S.tabs.priorityLevels, exact: true, modules: [MODULES.PRIORITY_VALIDATION] },
  { href: "/settings/reclassification-reasons", label: S.tabs.reclassificationReasons, modules: [MODULES.PRIORITY_VALIDATION] },
  { href: "/settings/blocker-reasons", label: S.tabs.blockerReasons },
  { href: "/settings/dev-return-reasons", label: S.tabs.devReturnReasons, modules: [MODULES.DEV_RETURNS] },
  { href: "/settings/ticket-patterns", label: S.tabs.ticketPatterns, modules: [MODULES.PRIORITY_VALIDATION, MODULES.DEV_RETURNS] },
  { href: "/settings/centrals", label: S.tabs.centrals, modules: [MODULES.CENTRALS] },
  { href: "/settings/competencies", label: S.tabs.competencies },
  { href: "/settings/competency-matrix", label: S.tabs.competencyMatrix },
  { href: "/settings/thresholds", label: S.tabs.thresholds },
  { href: "/settings/metrics", label: S.tabs.metrics },
  { href: "/settings/score", label: S.tabs.score },
  { href: "/settings/team", label: S.tabs.team, platformAdmin: true },
]

/**
 * A aba existe para este contexto? Algum dos módulos dela ligado no time (ou é
 * core) e, se for de administração, quem vê administra a plataforma.
 */
export function settingsTabEnabled(
  tab: SettingsTab,
  ctx: { modules: ReadonlySet<string> | readonly string[]; isPlatformAdmin: boolean },
): boolean {
  if (tab.platformAdmin && !ctx.isPlatformAdmin) return false
  const { modules } = ctx
  const has = (key: string) => (modules instanceof Set ? modules.has(key) : (modules as readonly string[]).includes(key))
  return !tab.modules || tab.modules.some(has)
}

export function settingsTabFor(href: string): SettingsTab {
  const tab = SETTINGS_TABS.find((t) => t.href === href)
  if (!tab) throw new Error(`Aba de configurações desconhecida: ${href}`)
  return tab
}
