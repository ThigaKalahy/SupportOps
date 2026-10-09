"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SlidersHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FilterSelect } from "@/components/ui/filter-select"
import { Label } from "@/components/ui/label"
import { PeriodPicker } from "@/components/ui/period-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { centralFilterOptions } from "@/lib/centrals"
import { DEV_RETURN_DEFAULT_PERIOD, DEV_RETURN_PARAMS, hasDevReturnFilters, type DevReturnFilters } from "@/lib/dev-return-filters"
import { DEV_RETURN_CATEGORIES } from "@/lib/dev-returns"
import { enumLabel, labels } from "@/lib/labels"
import { VALIDATION_PERIODS } from "@/lib/validation-filters"

const F = labels.devReturns.filters

/**
 * Período e filtros de /dev-returns (analista, motivo, categoria, central,
 * apenas em aberto) na barra de contexto. Estado na URL.
 */
export function DevReturnsToolbar({
  filters,
  members,
  reasons,
  centrals,
}: {
  filters: DevReturnFilters
  members: { id: string; preferredName: string }[]
  reasons: { id: string; label: string }[]
  centrals: { id: string; name: string; isActive: boolean }[]
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

  const active = [filters.memberId, filters.reasonId, filters.category, filters.central, filters.openOnly].filter(Boolean).length

  return (
    <>
      <PeriodPicker
        label={labels.period.label}
        options={VALIDATION_PERIODS.map((p) => ({ value: p, label: labels.priorityValidations.filters.periods[p] }))}
        value={filters.period}
        defaultValue={DEV_RETURN_DEFAULT_PERIOD}
        from={filters.from}
        to={filters.to}
      />

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
            label={F.member}
            value={filters.memberId}
            allLabel={F.allMembers}
            options={members.map((m) => ({ value: m.id, label: m.preferredName }))}
            onChange={(v) => replace({ [DEV_RETURN_PARAMS.member]: v })}
          />
          <FilterSelect
            label={F.category}
            value={filters.category}
            allLabel={F.allCategories}
            options={DEV_RETURN_CATEGORIES.map((c) => ({ value: c, label: enumLabel("devReturnCategory", c) }))}
            onChange={(v) => replace({ [DEV_RETURN_PARAMS.category]: v })}
          />
          <FilterSelect
            label={F.reason}
            value={filters.reasonId}
            allLabel={F.allReasons}
            options={reasons.map((r) => ({ value: r.id, label: r.label }))}
            onChange={(v) => replace({ [DEV_RETURN_PARAMS.reason]: v })}
          />
          <FilterSelect
            label={labels.centrals.filter}
            value={filters.central}
            allLabel={labels.centrals.filterAll}
            options={centralFilterOptions(centrals)}
            onChange={(v) => replace({ [DEV_RETURN_PARAMS.central]: v })}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="dev-returns-open-only"
              checked={filters.openOnly}
              onCheckedChange={(c) => replace({ [DEV_RETURN_PARAMS.open]: c === true ? "1" : null })}
            />
            <Label htmlFor="dev-returns-open-only" className="font-normal">
              {F.openOnly}
            </Label>
          </div>
          {hasDevReturnFilters(filters) ? (
            <Button
              variant="link"
              size="sm"
              className="self-start"
              onClick={() =>
                replace({
                  [DEV_RETURN_PARAMS.member]: null,
                  [DEV_RETURN_PARAMS.reason]: null,
                  [DEV_RETURN_PARAMS.category]: null,
                  [DEV_RETURN_PARAMS.central]: null,
                  [DEV_RETURN_PARAMS.open]: null,
                })
              }
            >
              {F.clear}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </>
  )
}
