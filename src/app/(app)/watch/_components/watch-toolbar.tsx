"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SlidersHorizontalIcon } from "lucide-react"

import { WatchButton } from "@/components/watch/watch-button"
import { Button } from "@/components/ui/button"
import { FilterSelect } from "@/components/ui/filter-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { centralFilterOptions } from "@/lib/centrals"
import { labels } from "@/lib/labels"
import { hasWatchFilters, WATCH_PARAMS, type WatchFilters } from "@/lib/watch-filters"
import { WATCH_HEATS, WATCH_ORIGINS } from "@/lib/watch"

const W = labels.watch
const F = W.filters

/** Filtros de /watch (grau, pessoa, central, origem) e "Nova observação". Estado na URL. */
export function WatchToolbar({
  filters,
  members,
  centrals,
  canWrite,
  openNew,
}: {
  filters: WatchFilters
  members: { id: string; preferredName: string }[]
  centrals: { id: string; name: string; isActive: boolean }[]
  canWrite: boolean
  /** ?new=1 (vindo da paleta): abre o "Nova observação" ao entrar. */
  openNew: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function replace(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const active = [filters.heat, filters.memberId, filters.central, filters.origin].filter(Boolean).length

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm">
            <SlidersHorizontalIcon />
            <span className="max-sm:sr-only">{F.button}</span>
            {active > 0 ? <span className="font-mono text-2xs text-accent">{active}</span> : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-64 flex-col gap-3">
          <FilterSelect
            label={F.heat}
            value={filters.heat}
            allLabel={F.allHeats}
            options={WATCH_HEATS.map((h) => ({ value: h, label: W.heat[h] }))}
            onChange={(v) => replace({ [WATCH_PARAMS.heat]: v })}
          />
          <FilterSelect
            label={F.member}
            value={filters.memberId}
            allLabel={F.allMembers}
            options={members.map((m) => ({ value: m.id, label: m.preferredName }))}
            onChange={(v) => replace({ [WATCH_PARAMS.member]: v })}
          />
          <FilterSelect
            label={labels.centrals.filter}
            value={filters.central}
            allLabel={labels.centrals.filterAll}
            options={centralFilterOptions(centrals)}
            onChange={(v) => replace({ [WATCH_PARAMS.central]: v })}
          />
          <FilterSelect
            label={F.origin}
            value={filters.origin}
            allLabel={F.allOrigins}
            options={WATCH_ORIGINS.map((o) => ({ value: o, label: W.origin[o] }))}
            onChange={(v) => replace({ [WATCH_PARAMS.origin]: v })}
          />
          {hasWatchFilters(filters) ? (
            <Button
              variant="link"
              size="sm"
              className="self-start"
              onClick={() => replace({ [WATCH_PARAMS.heat]: null, [WATCH_PARAMS.member]: null, [WATCH_PARAMS.central]: null, [WATCH_PARAMS.origin]: null })}
            >
              {F.clear}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
      {canWrite ? (
        <WatchButton
          variant="label"
          origin="MANUAL"
          defaults={{ title: "" }}
          link={filters.memberId ? { memberId: filters.memberId } : {}}
          openByDefault={openNew}
          labelText={W.actions.new}
          repeatable
          onCreated={() => router.refresh()}
        />
      ) : null}
    </>
  )
}
