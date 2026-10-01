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
}

export const mainNav: NavItem[] = [
  { href: "/", label: labels.nav.today, icon: HouseIcon, exact: true },
  { href: "/team", label: labels.nav.team, icon: UsersIcon },
  { href: "/agreements", label: labels.nav.agreements, icon: ListChecksIcon },
  { href: "/priority-validations", label: labels.nav.priorityValidations, icon: ClipboardCheckIcon },
  { href: "/dailies", label: labels.nav.dailies, icon: CalendarCheckIcon },
  { href: "/records", label: labels.nav.records, icon: MessagesSquareIcon },
  { href: "/development", label: labels.nav.development, icon: SproutIcon },
]

export const footerNav: NavItem[] = [{ href: "/settings", label: labels.nav.settings, icon: SettingsIcon }]

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/** Rótulos de sub-rotas conhecidas, para o breadcrumb. Segmentos dinâmicos (ids) são omitidos. */
const subrouteLabels: Record<string, string> = {
  timeline: labels.nav.timeline,
  agreements: labels.nav.agreements,
  development: labels.nav.development,
  records: labels.nav.records,
}

export interface Crumb {
  label: string
  href: string
}

/** Breadcrumb derivado da rota: seção da navegação + sub-rotas conhecidas. */
export function crumbsFor(pathname: string): Crumb[] {
  const section = [...mainNav, ...footerNav].find((item) => isActive(item, pathname))
  if (!section) return []

  const crumbs: Crumb[] = [{ label: section.label, href: section.href }]
  if (section.exact) return crumbs

  const rest = pathname.slice(section.href.length).split("/").filter(Boolean)
  let href = section.href
  for (const segment of rest) {
    href = `${href}/${segment}`
    const label = subrouteLabels[segment]
    if (label) crumbs.push({ label, href })
  }
  return crumbs
}
