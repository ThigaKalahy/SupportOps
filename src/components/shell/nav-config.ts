import {
  CalendarCheckIcon,
  ClipboardCheckIcon,
  HouseIcon,
  ListChecksIcon,
  MessagesSquareIcon,
  SettingsIcon,
  SproutIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import { labels } from "@/lib/labels"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Só "/" exige correspondência exata; o resto ativa também nas sub-rotas. */
  exact?: boolean
  /** Contador do motor de alertas mostrado ao lado do item. */
  counter?: "today" | "team" | "agreements" | "dailies" | "records" | "development"
}

export const mainNav: NavItem[] = [
  { href: "/", label: labels.nav.today, icon: HouseIcon, exact: true, counter: "today" },
  { href: "/team", label: labels.nav.team, icon: UsersIcon, counter: "team" },
  { href: "/agreements", label: labels.nav.agreements, icon: ListChecksIcon, counter: "agreements" },
  { href: "/priority-validations", label: labels.nav.priorityValidations, icon: ClipboardCheckIcon },
  { href: "/dailies", label: labels.nav.dailies, icon: CalendarCheckIcon, counter: "dailies" },
  { href: "/records", label: labels.nav.records, icon: MessagesSquareIcon, counter: "records" },
  { href: "/development", label: labels.nav.development, icon: SproutIcon, counter: "development" },
]

export const footerNav: NavItem[] = [{ href: "/settings", label: labels.nav.settings, icon: SettingsIcon }]

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
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
  "ticket-patterns": labels.settings.tabs.ticketPatterns,
  "competency-matrix": labels.settings.tabs.competencyMatrix,
  competencies: labels.settings.tabs.competencies,
  thresholds: labels.settings.tabs.thresholds,
}

export interface Crumb {
  label: string
  href: string
}

/** Breadcrumb derivado da rota: seção da navegação + sub-rotas conhecidas. */
export function crumbsFor(pathname: string, segmentLabels: Record<string, string> = {}): Crumb[] {
  const section = [...mainNav, ...footerNav].find((item) => isActive(item, pathname))
  if (!section) return []

  const crumbs: Crumb[] = [{ label: section.label, href: section.href }]
  if (section.exact) return crumbs

  const rest = pathname.slice(section.href.length).split("/").filter(Boolean)
  let href = section.href
  for (const segment of rest) {
    href = `${href}/${segment}`
    const label = segmentLabels[segment] ?? subrouteLabels[segment]
    if (label) crumbs.push({ label, href })
  }
  return crumbs
}
