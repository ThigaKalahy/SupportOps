"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ListFilterIcon, SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { enumLabel, fill, labels } from "@/lib/labels"
import {
  isFiltered,
  TIMELINE_PARAMS,
  TIMELINE_PERIODS,
  TIMELINE_TYPES,
  type TimelineFilters,
  type TimelinePeriod,
} from "@/lib/timeline-filters"

const F = labels.timeline.filters
const SEARCH_DELAY = 350

/**
 * Filtros da timeline: tipos (multi-seleção em popover), período e busca.
 * Tudo na URL — o servidor relê e devolve a primeira página filtrada.
 */
export function TimelineToolbar({ filters }: { filters: TimelineFilters }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = React.useState(filters.q)

  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") params.delete(key)
        else params.set(key, value)
      }
      const next = params.toString()
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  // Busca com pequena espera: a URL muda quando a pessoa para de digitar.
  React.useEffect(() => {
    if (query.trim() === filters.q) return
    const timer = setTimeout(() => update({ [TIMELINE_PARAMS.q]: query.trim() }), SEARCH_DELAY)
    return () => clearTimeout(timer)
  }, [query, filters.q, update])

  function toggleType(type: (typeof TIMELINE_TYPES)[number], checked: boolean) {
    const current = new Set(filters.types)
    if (checked) current.add(type)
    else current.delete(type)
    update({ [TIMELINE_PARAMS.types]: [...current].join(",") })
  }

  const typesLabel =
    filters.types.length === 0
      ? F.allTypes
      : filters.types.length === 1
        ? enumLabel("timelineEventType", filters.types[0]!)
        : fill(F.typesCount, { count: filters.types.length })

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm" aria-label={`${F.types}: ${typesLabel}`}>
            <ListFilterIcon />
            {typesLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{F.types}</legend>
            {TIMELINE_TYPES.map((type) => {
              const id = `timeline-type-${type}`
              return (
                <div key={type} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={filters.types.includes(type)}
                    onCheckedChange={(checked) => toggleType(type, checked === true)}
                  />
                  <Label htmlFor={id} className="font-normal">
                    {enumLabel("timelineEventType", type)}
                  </Label>
                </div>
              )
            })}
            {filters.types.length ? (
              <Button
                variant="link"
                size="sm"
                className="self-start"
                onClick={() => update({ [TIMELINE_PARAMS.types]: null })}
              >
                {F.clearTypes}
              </Button>
            ) : null}
          </fieldset>
        </PopoverContent>
      </Popover>

      <Tabs value={filters.period} onValueChange={(value) => update({ [TIMELINE_PARAMS.period]: value === "all" ? null : value })}>
        <TabsList variant="segmented" aria-label={F.period}>
          {TIMELINE_PERIODS.map((period: TimelinePeriod) => (
            // Filtro, não painel: sem TabsContent, o aria-controls do Radix apontaria para nada.
            <TabsTrigger key={period} value={period} aria-controls={undefined}>
              {labels.timeline.periods[period]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative w-full sm:w-64">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-tertiary" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={F.search}
          aria-label={F.search}
          className="h-8 pl-8"
        />
      </div>

      {isFiltered(filters) ? (
        <Button
          variant="link"
          size="sm"
          onClick={() => {
            setQuery("")
            router.replace(pathname, { scroll: false })
          }}
        >
          {F.clear}
        </Button>
      ) : null}
    </div>
  )
}
