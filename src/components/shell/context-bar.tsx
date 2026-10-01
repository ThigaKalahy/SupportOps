"use client"

import * as React from "react"
import Link from "next/link"
import { MenuIcon, SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

import type { Crumb } from "./nav-config"

/** Breadcrumb. Abaixo de 768px mostra só a página atual. */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label={labels.shell.breadcrumb} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <li key={crumb.href} className={cn("flex min-w-0 items-center gap-1.5", !last && "max-md:hidden")}>
              {index > 0 ? (
                <span aria-hidden className="text-ink-tertiary">
                  /
                </span>
              ) : null}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-ink">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="truncate text-ink-secondary hover:text-ink">
                  {crumb.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * Campo de busca da barra de contexto. Inerte até a paleta de comandos (P16):
 * aparece, mas não recebe foco nem clique.
 */
export function ContextSearch() {
  return (
    <button
      type="button"
      disabled
      className="flex h-8 w-full max-w-[360px] items-center gap-2 rounded-sm border border-line bg-canvas px-2.5 text-sm text-ink-tertiary"
    >
      <SearchIcon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate text-left">{labels.shell.searchPlaceholder}</span>
      <kbd className="rounded-xs border border-line bg-surface px-1 font-mono text-2xs text-ink-secondary">
        {labels.shell.searchShortcut}
      </kbd>
    </button>
  )
}

/**
 * Barra de contexto de 48px no topo do conteúdo: breadcrumb à esquerda, busca
 * no centro, ação primária à direita. Não é navbar.
 *
 * `actionsSlotId` cria o alvo onde as páginas injetam a ação primária via
 * <ContextActions>; `actions` permite passar a ação diretamente (ex.: /ui-lab).
 */
export function ContextBar({
  crumbs,
  onOpenNavigation,
  actions,
  actionsSlotId,
  className,
}: {
  crumbs: Crumb[]
  onOpenNavigation?: () => void
  actions?: React.ReactNode
  actionsSlotId?: string
  className?: string
}) {
  return (
    <header
      className={cn("flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:px-6", className)}
    >
      <div className="flex min-w-0 flex-1 basis-0 items-center gap-2">
        {onOpenNavigation ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-1.5 lg:hidden"
            onClick={onOpenNavigation}
            aria-label={labels.shell.openNavigation}
          >
            <MenuIcon />
          </Button>
        ) : null}
        <Breadcrumb crumbs={crumbs} />
      </div>
      <div className="hidden w-full max-w-[360px] justify-center md:flex">
        <ContextSearch />
      </div>
      <div id={actionsSlotId} className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-2">
        {actions}
      </div>
    </header>
  )
}
