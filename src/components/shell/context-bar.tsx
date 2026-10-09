"use client"

import * as React from "react"
import Link from "next/link"
import { EyeIcon, MenuIcon, SearchIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MetaLabel } from "@/components/ui/meta-label"
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
                <span aria-hidden className={cn("text-ink-secondary", last && "max-md:hidden")}>
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
 * Campo de busca da barra de contexto: abre a paleta de comandos (P16), o
 * mesmo que ⌘K / Ctrl+K.
 */
export function ContextSearch({ onOpen }: { onOpen?: () => void }) {
  return (
    <button
      type="button"
      disabled={!onOpen}
      onClick={onOpen}
      aria-keyshortcuts="Control+K Meta+K"
      className="flex h-8 w-full max-w-[360px] items-center gap-2 rounded-sm border border-line bg-canvas px-2.5 text-sm text-ink-secondary hover:border-line-strong hover:text-ink-secondary"
    >
      <SearchIcon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate text-left">{labels.shell.searchPlaceholder}</span>
      <kbd className="rounded-xs border border-line bg-surface px-1 font-mono text-2xs text-ink-secondary">
        {labels.shell.searchShortcut}
      </kbd>
    </button>
  )
}

/** Indicador discreto para quem tem acesso de leitura (VIEWER). */
export function ReadOnlyIndicator() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0} className="cursor-default">
          <EyeIcon aria-hidden />
          {labels.auth.readOnly}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom">{labels.auth.readOnlyHint}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Time ativo, à esquerda do breadcrumb (P23). Só para quem tem mais de um time:
 * sempre visível, em toda tela e em toda largura — com a sidebar recolhida ou no
 * celular é a única pista de qual time se está lendo.
 */
export function ActiveTeamIndicator({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-1.5" title={name}>
      <span className="sr-only">{labels.teams.switcherLabel}: </span>
      <MetaLabel className="max-w-[16ch] truncate text-ink">{name}</MetaLabel>
      <span aria-hidden className="text-ink-secondary">
        /
      </span>
    </span>
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
  readOnly = false,
  teamName = null,
  onOpenSearch,
  className,
}: {
  /** Nome do time ativo (só com mais de um time — P23). */
  teamName?: string | null
  crumbs: Crumb[]
  /** Abre a paleta de comandos (campo de busca e, no celular, o ícone). */
  onOpenSearch?: () => void
  onOpenNavigation?: () => void
  actions?: React.ReactNode
  actionsSlotId?: string
  /** Mostra o indicador "Somente leitura" (papel VIEWER). */
  readOnly?: boolean
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
        {teamName ? <ActiveTeamIndicator name={teamName} /> : null}
        <Breadcrumb crumbs={crumbs} />
      </div>
      <div className="hidden w-full max-w-[360px] justify-center md:flex">
        <ContextSearch onOpen={onOpenSearch} />
      </div>
      <div className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-2">
        {onOpenSearch ? (
          <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onOpenSearch} aria-label={labels.command.open}>
            <SearchIcon />
          </Button>
        ) : null}
        {readOnly ? <ReadOnlyIndicator /> : null}
        <div id={actionsSlotId} className="flex items-center gap-2">
          {actions}
        </div>
      </div>
    </header>
  )
}
