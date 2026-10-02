"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SlidersHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FilterSelect } from "@/components/ui/filter-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { enumLabel, labels } from "@/lib/labels"
import {
  DEFAULT_RECORD_PERIOD,
  RECORD_PARAMS,
  RECORD_PERIODS,
  RECORD_TYPES,
  type RecordFilters,
  type RecordPeriod,
} from "@/lib/records-filters"
import { FEEDBACK_CATEGORIES } from "@/lib/validators/records"

const R = labels.records
const F = R.filters

/** Período e filtros (tipo, pessoa, categoria) do índice de 1:1 e feedbacks, na URL. */
export function RecordsToolbar({
  filters,
  members,
}: {
  filters: RecordFilters
  /** Sem lista, o filtro de pessoa some (aba do perfil). */
  members?: { id: string; preferredName: string }[]
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

  const active = [filters.type, members ? filters.memberId : null, filters.category].filter(Boolean).length

  return (
    <>
      <Select
        value={filters.period}
        onValueChange={(v) => replace({ [RECORD_PARAMS.period]: v === DEFAULT_RECORD_PERIOD ? null : v })}
      >
        <SelectTrigger size="sm" aria-label={F.period} className="w-auto min-w-0">
          <span className="text-ink-secondary max-sm:sr-only">{F.period}:</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {RECORD_PERIODS.map((p: RecordPeriod) => (
            <SelectItem key={p} value={p}>
              {R.periods[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
            label={F.type}
            value={filters.type}
            allLabel={F.allTypes}
            options={RECORD_TYPES.map((t) => ({ value: t, label: R.types[t] }))}
            onChange={(v) => replace({ [RECORD_PARAMS.type]: v, ...(v === "oneOnOne" ? { [RECORD_PARAMS.category]: null } : {}) })}
          />
          {members ? (
            <FilterSelect
              label={F.member}
              value={filters.memberId}
              allLabel={F.allMembers}
              options={members.map((m) => ({ value: m.id, label: m.preferredName }))}
              onChange={(v) => replace({ [RECORD_PARAMS.member]: v })}
            />
          ) : null}
          <FilterSelect
            label={F.category}
            value={filters.category}
            allLabel={F.allCategories}
            options={FEEDBACK_CATEGORIES.map((c) => ({ value: c, label: enumLabel("feedbackCategory", c) }))}
            onChange={(v) => replace({ [RECORD_PARAMS.category]: v, ...(v ? { [RECORD_PARAMS.type]: null } : {}) })}
          />
          {active > 0 ? (
            <Button
              variant="link"
              size="sm"
              className="self-start"
              onClick={() =>
                replace({ [RECORD_PARAMS.type]: null, [RECORD_PARAMS.category]: null, ...(members ? { [RECORD_PARAMS.member]: null } : {}) })
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
