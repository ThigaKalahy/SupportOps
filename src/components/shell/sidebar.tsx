"use client"

import * as React from "react"
import { LogOutIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react"
import type { TeamAccessLevel } from "@prisma/client"

import { logoutAction } from "@/actions/auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { enumLabel, labels } from "@/lib/labels"
import { initials } from "@/lib/people"
import { cn } from "@/lib/utils"

import { footerNav, isActive, navItemsFor, type NavItem } from "./nav-config"
import { NavLink } from "./nav-link"

/** Identidade do produto: marca de 24px e nome, sem logo grande. */
export function ProductIdentity({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={cn("flex h-12 shrink-0 items-center gap-2 border-b border-line", collapsed ? "justify-center px-0" : "px-4")}>
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-line-strong font-mono text-xs font-medium text-ink"
      >
        P
      </span>
      <span className={cn("truncate text-sm font-semibold text-ink", collapsed && "sr-only")}>{labels.app.name}</span>
    </div>
  )
}

/** Contadores da sidebar (src/server/alerts.ts → alertCounts). */
export type NavCounts = Record<NonNullable<NavItem["counter"]>, number>

export interface ShellUser {
  name: string
  email: string
  /** Nível no time ativo (TeamAccess, P22). */
  level: TeamAccessLevel
}

/** Usuário atual, discreto, com o botão de sair. */
export function CurrentUser({ user, collapsed = false }: { user: ShellUser; collapsed?: boolean }) {
  return (
    <div
      aria-label={labels.auth.currentUser}
      className={cn("mt-2 flex items-center gap-2 border-t border-line pt-3", collapsed && "flex-col")}
    >
      <Avatar size="sm" title={collapsed ? `${user.name} · ${enumLabel("teamAccessLevel", user.level)}` : undefined}>
        <AvatarFallback>{initials(user.name)}</AvatarFallback>
      </Avatar>
      {collapsed ? null : (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink" title={user.email}>
            {user.name}
          </p>
          <p className="truncate text-xs text-ink-secondary">{enumLabel("teamAccessLevel", user.level)}</p>
        </div>
      )}
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="icon-sm" aria-label={labels.auth.signOut} title={labels.auth.signOut}>
          <LogOutIcon />
        </Button>
      </form>
    </div>
  )
}

/** Listas de navegação (principal e rodapé), compartilhadas pela sidebar e pelo drawer. */
export function SidebarNav({
  pathname,
  collapsed = false,
  onNavigate,
  footer,
  counts,
  modules,
}: {
  pathname: string
  counts?: NavCounts
  /** Módulos ligados no time (D32): a navegação só mostra os itens deles. */
  modules: readonly string[]
  collapsed?: boolean
  onNavigate?: () => void
  /** Conteúdo extra no rodapé, abaixo de Configurações (ex.: botão de recolher). */
  footer?: React.ReactNode
}) {
  return (
    <>
      <nav aria-label={labels.shell.mainNavigation} className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-0.5">
          {navItemsFor(modules).map((item) => (
            <li key={item.href}>
              <NavLink
                item={item}
                active={isActive(item, pathname)}
                collapsed={collapsed}
                onNavigate={onNavigate}
                count={item.counter && counts ? counts[item.counter] : 0}
              />
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-col gap-0.5 p-3 pt-0">
        <Separator className="mb-3" />
        <ul className="flex flex-col gap-0.5">
          {footerNav.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item, pathname)} collapsed={collapsed} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        {footer}
      </div>
    </>
  )
}

/**
 * Sidebar fixa (≥ 1024px): 232px, recolhível para 56px. A largura muda sem
 * animação — o DESIGN.md proíbe animar largura.
 */
export function Sidebar({
  pathname,
  collapsed,
  onToggle,
  user,
  counts,
  modules,
  teamSwitcher,
}: {
  pathname: string
  collapsed: boolean
  onToggle: () => void
  user: ShellUser
  counts?: NavCounts
  modules: readonly string[]
  /** Seletor (ou nome estático) do time ativo, acima da navegação (P23). */
  teamSwitcher?: React.ReactNode
}) {
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon
  const toggleLabel = collapsed ? labels.shell.expandSidebar : labels.shell.collapseSidebar

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-line bg-surface lg:flex",
        collapsed ? "w-14" : "w-[232px]"
      )}
    >
      <ProductIdentity collapsed={collapsed} />
      {teamSwitcher}
      <SidebarNav
        pathname={pathname}
        counts={counts}
        modules={modules}
        collapsed={collapsed}
        footer={
          <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            title={collapsed ? toggleLabel : undefined}
            className={cn("mt-1 w-full", collapsed ? "justify-center px-0" : "justify-start px-2")}
          >
            <ToggleIcon />
            {collapsed ? null : <span className="truncate font-normal">{labels.shell.collapseSidebar}</span>}
          </Button>
          <CurrentUser user={user} collapsed={collapsed} />
          </>
        }
      />
    </aside>
  )
}
