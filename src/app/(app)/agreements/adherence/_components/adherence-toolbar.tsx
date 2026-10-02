"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { PeriodPicker } from "@/components/ui/period-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ADHERENCE_PERIODS, ADHERENCE_SORTS, type AdherenceFilters, type AdherenceSort } from "@/lib/adherence-filters"
import { labels } from "@/lib/labels"

const L = labels.adherence

/** Período (30 dias, 90 dias, 6 meses, 12 meses, personalizado) e ordenação, na URL. */
export function AdherenceToolbar({ filters }: { filters: AdherenceFilters }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function sortBy(sort: AdherenceSort) {
    const params = new URLSearchParams(searchParams.toString())
    if (sort === "name") params.delete("sort")
    else params.set("sort", sort)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <>
      <Select value={filters.sort} onValueChange={(v) => sortBy(v as AdherenceSort)}>
        <SelectTrigger size="sm" aria-label={L.sort} className="w-auto min-w-0">
          <span className="text-ink-secondary max-sm:sr-only">{L.sort}:</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {ADHERENCE_SORTS.map((s) => (
            <SelectItem key={s} value={s}>
              {L.sorts[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <PeriodPicker
        label={labels.period.label}
        options={ADHERENCE_PERIODS.map((p) => ({ value: p, label: L.periods[p] }))}
        value={filters.period}
        defaultValue="90d"
        from={filters.from}
        to={filters.to}
      />
    </>
  )
}
