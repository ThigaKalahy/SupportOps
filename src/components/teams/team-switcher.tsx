"use client"

import * as React from "react"
import { ChevronsUpDownIcon } from "lucide-react"

import { selectTeam } from "@/actions/team-selection"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { MetaLabel } from "@/components/ui/meta-label"
import { labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

import { TeamList, type TeamOption } from "./team-list"

const T = labels.teams

/**
 * Escolha de time: chama a Server Action, que confere o acesso, grava o cookie,
 * invalida o cache de rota e vai para a HOME do time novo (nunca a rota
 * equivalente). Erro só volta quando o acesso não confere.
 */
export function useSelectTeam() {
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [, startTransition] = React.useTransition()

  const select = React.useCallback((teamId: string) => {
    setError(null)
    setPendingId(teamId)
    startTransition(async () => {
      const result = await selectTeam(teamId)
      // Sucesso redireciona e não volta; daqui para baixo só a recusa.
      setPendingId(null)
      if (result && !result.ok) setError(result.error)
    })
  }, [])

  return { select, pendingId, error }
}

/**
 * Seletor de time no topo da sidebar (P23). Com um time só, é TEXTO, não
 * controle — nada de dropdown que não abre. Com mais de um, abre um popover com
 * a lista (mesmo teclado da tela de seleção). Recolhida, a sidebar mostra só a
 * inicial; o nome do time continua sempre visível na barra de contexto.
 */
export function TeamSwitcher({
  teams,
  activeTeam,
  collapsed = false,
}: {
  teams: TeamOption[]
  activeTeam: { id: string; name: string }
  collapsed?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const { select, pendingId, error } = useSelectTeam()
  const initial = activeTeam.name.trim().charAt(0).toUpperCase()

  if (teams.length <= 1) {
    if (collapsed) return null
    return (
      <div className="flex flex-col gap-0.5 border-b border-line px-4 py-2">
        <MetaLabel>{T.activeTeam}</MetaLabel>
        <p className="truncate text-sm text-ink" title={activeTeam.name}>
          {activeTeam.name}
        </p>
      </div>
    )
  }

  return (
    <div className={cn("border-b border-line", collapsed ? "flex justify-center py-2" : "p-2")}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${T.switchTo}. ${T.switcherLabel}: ${activeTeam.name}`}
            title={collapsed ? activeTeam.name : undefined}
            className={cn(
              "flex items-center rounded-sm text-left hover:bg-surface-sunken",
              collapsed
                ? "size-8 justify-center border border-line-strong font-mono text-xs font-medium text-ink"
                : "w-full gap-2 px-2 py-1.5",
            )}
          >
            {collapsed ? (
              <span aria-hidden>{initial}</span>
            ) : (
              <>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <MetaLabel>{T.activeTeam}</MetaLabel>
                  <span className="truncate text-sm font-medium text-ink">{activeTeam.name}</span>
                </span>
                <ChevronsUpDownIcon className="size-4 shrink-0 text-ink-tertiary" aria-hidden />
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent side={collapsed ? "right" : "bottom"} className="w-64 gap-2 p-0 py-1">
          <p className="px-3 pt-1.5 text-xs text-ink-secondary">{T.switchTo}</p>
          <TeamList teams={teams} activeId={activeTeam.id} pendingId={pendingId} onSelect={select} autoFocus />
          {error ? (
            <p role="alert" className="px-3 pb-1.5 text-xs text-overdue">
              {error}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
