import {
  CalendarCheckIcon,
  FlameIcon,
  ClipboardCheckIcon,
  HouseIcon,
  ListChecksIcon,
  MessagesSquareIcon,
  SearchIcon,
  SettingsIcon,
  SproutIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import { labels } from "@/lib/labels"
import { MODULES, type ModuleKey } from "@/lib/modules"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Só "/" exige correspondência exata; o resto ativa também nas sub-rotas. */
  exact?: boolean
  /** Contador do motor de alertas mostrado ao lado do item. */
  counter?: "today" | "watch" | "team" | "agreements" | "validations" | "dailies" | "records" | "development"
  /** Outras rotas que são abas desta mesma seção (ex.: /dev-returns em Validação de prioridade, P20). */
  also?: { href: string; label: string; module?: ModuleKey }[]
  /** Módulo opcional do time (D32): desligado, o item não existe na navegação. */
  module?: ModuleKey
}

export const mainNav: NavItem[] = [
  { href: "/", label: labels.nav.today, icon: HouseIcon, exact: true, counter: "today" },
  // P21: destino diário próprio, logo depois de Hoje; o contador é o fogo alto ativo.
  { href: "/watch", label: labels.nav.watch, icon: FlameIcon, counter: "watch" },
  { href: "/team", label: labels.nav.team, icon: UsersIcon, counter: "team" },
  { href: "/agreements", label: labels.nav.agreements, icon: ListChecksIcon, counter: "agreements" },
  {
    href: "/priority-validations",
    label: labels.nav.priorityValidations,
    icon: ClipboardCheckIcon,
    counter: "validations",
    module: MODULES.PRIORITY_VALIDATION,
    // Mesmo domínio (qualidade da triagem), visto do outro lado: aba, não item novo (oito é o teto).
    also: [{ href: "/dev-returns", label: labels.devReturns.title, module: MODULES.DEV_RETURNS }],
  },
  { href: "/dailies", label: labels.nav.dailies, icon: CalendarCheckIcon, counter: "dailies" },
  { href: "/records", label: labels.nav.records, icon: MessagesSquareIcon, counter: "records" },
  { href: "/development", label: labels.nav.development, icon: SproutIcon, counter: "development" },
]

/**
 * Itens da navegação principal com os módulos LIGADOS no time (D32): módulo
 * desligado, item não existe. Se só as devoluções estiverem ligadas, o item da
 * seção de triagem aponta direto para /dev-returns.
 */
export function navItemsFor(modules: readonly string[]): NavItem[] {
  const on = (key?: ModuleKey) => !key || modules.includes(key)
  return mainNav.flatMap((item) => {
    const also = (item.also ?? []).filter((a) => on(a.module))
    if (on(item.module)) return [{ ...item, also }]
    const [first, ...rest] = also
    return first ? [{ ...item, href: first.href, label: first.label, module: first.module, also: rest }] : []
  })
}

export const footerNav: NavItem[] = [{ href: "/settings", label: labels.nav.settings, icon: SettingsIcon }]

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`)

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href
  return under(pathname, item.href) || (item.also ?? []).some((a) => under(pathname, a.href))
}

/**
 * Rótulos de sub-rotas conhecidas, para o breadcrumb. Segmentos dinâmicos
 * (ids) só aparecem quando a página informa o rótulo (<CrumbLabel>).
 */
const subrouteLabels: Record<string, string> = {
  timeline: labels.nav.timeline,
  agreements: labels.nav.agreements,
  development: labels.nav.development,
  records: labels.nav.records,
  new: labels.dailies.new,
  adherence: labels.adherence.title,
  "reclassification-reasons": labels.settings.tabs.reclassificationReasons,
  "blocker-reasons": labels.settings.tabs.blockerReasons,
  "dev-return-reasons": labels.settings.tabs.devReturnReasons,
  centrals: labels.settings.tabs.centrals,
  "ticket-patterns": labels.settings.tabs.ticketPatterns,
  "competency-matrix": labels.settings.tabs.competencyMatrix,
  competencies: labels.settings.tabs.competencies,
  thresholds: labels.settings.tabs.thresholds,
  metrics: labels.settings.tabs.metrics,
  // /settings/team (P23). Só aparece como segmento depois de /settings: /team é seção própria.
  team: labels.settings.tabs.team,
  score: labels.settings.tabs.score,
  preview: labels.settings.score.preview.title,
}

export interface Crumb {
  label: string
  href: string
}

/** Breadcrumb derivado da rota: seção da navegação + sub-rotas conhecidas. */
/** Páginas fora da navegação lateral que ainda precisam de breadcrumb. */
const extraSections: NavItem[] = [{ href: "/search", label: labels.search.title, icon: SearchIcon }]

export function crumbsFor(pathname: string, segmentLabels: Record<string, string> = {}): Crumb[] {
  const section = [...mainNav, ...footerNav, ...extraSections].find((item) => isActive(item, pathname))
  if (!section) return []

  const crumbs: Crumb[] = [{ label: section.label, href: section.href }]
  if (section.exact) return crumbs

  // Rota-aba da seção (ex.: /dev-returns): a seção, depois a aba.
  const tab = (section.also ?? []).find((a) => under(pathname, a.href))
  if (tab) crumbs.push({ label: tab.label, href: tab.href })
  const base = tab?.href ?? section.href
  const rest = pathname.slice(base.length).split("/").filter(Boolean)
  let href = base
  for (const segment of rest) {
    href = `${href}/${segment}`
    const label = segmentLabels[segment] ?? subrouteLabels[segment]
    if (label) crumbs.push({ label, href })
  }
  return crumbs
}
