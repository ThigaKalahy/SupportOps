"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SlidersHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FilterSelect } from "@/components/ui/filter-select"
import { PeriodPicker } from "@/components/ui/period-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { centralFilterOptions } from "@/lib/centrals"
import { enumLabel, labels } from "@/lib/labels"
import { VALIDATION_OUTCOMES } from "@/lib/priority-validation"
import {
  hasValidationFilters,
  VALIDATION_PARAMS,
  VALIDATION_PERIODS,
  type ValidationFilters,
} from "@/lib/validation-filters"

const F = labels.priorityValidations.filters

/**
 * Período (hoje, 7 dias, 30 dias, mês atual, intervalo personalizado) e
 * filtros (responsável, resultado, motivo) na barra de contexto. Estado na URL.
 */
export function ValidationsToolbar({
  filters,
  members,
  reasons,
  centrals,
}: {
  filters: ValidationFilters
  members: { id: string; preferredName: string }[]
  reasons: { id: string; label: string }[]
  /** Todas as centrais, inclusive desativadas (o histórico aponta para elas). */
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

  const active = [filters.memberId, filters.outcome, filters.reasonId, filters.central].filter(Boolean).length

  return (
    <>
      <PeriodPicker
        label={labels.period.label}
        options={VALIDATION_PERIODS.map((p) => ({ value: p, label: F.periods[p] }))}
        value={filters.period}
        defaultValue="today"
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
            onChange={(v) => replace({ [VALIDATION_PARAMS.member]: v })}
          />
          <FilterSelect
            label={F.outcome}
            value={filters.outcome}
            allLabel={F.allOutcomes}
            options={VALIDATION_OUTCOMES.map((o) => ({ value: o, label: enumLabel("validationOutcome", o) }))}
            onChange={(v) => replace({ [VALIDATION_PARAMS.outcome]: v })}
          />
          <FilterSelect
            label={F.reason}
            value={filters.reasonId}
            allLabel={F.allReasons}
            options={reasons.map((r) => ({ value: r.id, label: r.label }))}
            onChange={(v) => replace({ [VALIDATION_PARAMS.reason]: v })}
          />
          <FilterSelect
            label={labels.centrals.filter}
            value={filters.central}
            allLabel={labels.centrals.filterAll}
            options={centralFilterOptions(centrals)}
            onChange={(v) => replace({ [VALIDATION_PARAMS.central]: v })}
          />
          {hasValidationFilters(filters) ? (
            <Button
              variant="link"
              size="sm"
              className="self-start"
              onClick={() =>
                replace({
                  [VALIDATION_PARAMS.member]: null,
                  [VALIDATION_PARAMS.outcome]: null,
                  [VALIDATION_PARAMS.reason]: null,
                  [VALIDATION_PARAMS.central]: null,
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
