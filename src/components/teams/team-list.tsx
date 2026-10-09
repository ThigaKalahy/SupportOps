"use client"

import * as React from "react"
import type { TeamAccessLevel } from "@prisma/client"

import { MetaLabel } from "@/components/ui/meta-label"
import { labels, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"

const T = labels.teams

export interface TeamOption {
  id: string
  name: string
  level: TeamAccessLevel
  members: number
}

/**
 * Lista de times para escolher (P23): a tela /select-team e o popover do seletor
 * da sidebar. Uma linha por time — nome, nível ("gerencia" / "somente leitura")
 * e, discreto, quantas pessoas. Sem card, sem ícone.
 *
 * Teclado: é um listbox com uma parada de Tab; setas (e Home/End) percorrem,
 * Enter ou Espaço escolhe. O foco começa no time ativo, ou no primeiro.
 */
export function TeamList({
  teams,
  activeId = null,
  pendingId = null,
  onSelect,
  autoFocus = false,
  className,
}: {
  teams: TeamOption[]
  /** Time ativo agora: marcado "atual" e ponto de partida do foco. */
  activeId?: string | null
  /** Time sendo aberto (a escolha está em andamento). */
  pendingId?: string | null
  onSelect: (teamId: string) => void
  autoFocus?: boolean
  className?: string
}) {
  const initial = Math.max(0, teams.findIndex((t) => t.id === activeId))
  const [focused, setFocused] = React.useState(initial)
  const refs = React.useRef<(HTMLLIElement | null)[]>([])
  const busy = pendingId !== null

  React.useEffect(() => {
    if (autoFocus) refs.current[initial]?.focus()
    // Só na montagem: depois disso o foco é de quem usa o teclado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function move(to: number) {
    const next = (to + teams.length) % teams.length
    setFocused(next)
    refs.current[next]?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === "ArrowDown") move(index + 1)
    else if (event.key === "ArrowUp") move(index - 1)
    else if (event.key === "Home") move(0)
    else if (event.key === "End") move(teams.length - 1)
    else if (event.key === "Enter" || event.key === " ") {
      if (!busy) onSelect(teams[index]!.id)
    } else return
    event.preventDefault()
  }

  return (
    <ul
      role="listbox"
      aria-label={T.listLabel}
      aria-busy={busy || undefined}
      className={cn("flex flex-col divide-y divide-line", className)}
    >
      {teams.map((team, index) => {
        const active = team.id === activeId
        return (
          <li
            key={team.id}
            ref={(node) => {
              refs.current[index] = node
            }}
            role="option"
            aria-selected={active}
            tabIndex={index === focused ? 0 : -1}
            onFocus={() => setFocused(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => {
              if (!busy) onSelect(team.id)
            }}
            className={cn(
              "flex min-h-10 cursor-pointer items-center gap-3 px-3 py-2 outline-offset-[-2px] hover:bg-surface-sunken",
              active && "bg-accent-wash shadow-[inset_2px_0_0_var(--accent)] hover:bg-accent-wash",
              busy && team.id !== pendingId && "cursor-default",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{team.name}</p>
              <p className="text-xs text-ink-secondary">
                {T.level[team.level]}
                <span aria-hidden> · </span>
                <span className="font-mono text-2xs">{plural(T.members, team.members)}</span>
              </p>
            </div>
            {team.id === pendingId ? (
              <span className="text-xs text-ink-secondary">{T.opening}</span>
            ) : active ? (
              <MetaLabel>{T.current}</MetaLabel>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
