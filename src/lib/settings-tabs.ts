import { labels } from "./labels.ts"
import { MODULES, type ModuleKey } from "./modules.ts"

const S = labels.settings

export interface SettingsTab {
  href: string
  label: string
  exact?: boolean
  /** O catálogo só existe com ALGUM destes módulos ligados no time (D32). Sem lista: core. */
  modules?: ModuleKey[]
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
]

/** A aba existe neste time? (algum dos módulos dela ligado, ou é core) */
export function settingsTabEnabled(tab: SettingsTab, modules: ReadonlySet<string> | readonly string[]): boolean {
  const has = (key: string) => (modules instanceof Set ? modules.has(key) : (modules as readonly string[]).includes(key))
  return !tab.modules || tab.modules.some(has)
}

export function settingsTabFor(href: string): SettingsTab {
  const tab = SETTINGS_TABS.find((t) => t.href === href)
  if (!tab) throw new Error(`Aba de configurações desconhecida: ${href}`)
  return tab
}
