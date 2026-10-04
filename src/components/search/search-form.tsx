"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FilterSelect } from "@/components/ui/filter-select"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { labels } from "@/lib/labels"
import { SEARCH_KINDS, SEARCH_PARAMS, SEARCH_PERIODS, type SearchFilters, type SearchPeriod } from "@/lib/search"

const S = labels.search

/** Termo, tipo e período da busca, na URL (?q=&type=&period=). Enter busca. */
export function SearchForm({ filters }: { filters: SearchFilters }) {
  const router = useRouter()
  const pathname = usePathname()
  const [q, setQ] = React.useState(filters.q)

  React.useEffect(() => setQ(filters.q), [filters.q])

  function go(changes: Partial<SearchFilters>) {
    const next = { ...filters, q, ...changes }
    const params = new URLSearchParams()
    if (next.q.trim()) params.set(SEARCH_PARAMS.q, next.q.trim())
    if (next.type) params.set(SEARCH_PARAMS.type, next.type)
    if (next.period !== "all") params.set(SEARCH_PARAMS.period, next.period)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        go({})
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <div className="relative min-w-0 flex-1 basis-64">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-tertiary" aria-hidden />
        <Input
          type="search"
          value={q}
          maxLength={120}
          autoComplete="off"
          aria-label={S.label}
          placeholder={S.placeholder}
          className="pl-8"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="w-44">
        <FilterSelect
          label={S.type}
          value={filters.type}
          allLabel={S.allTypes}
          options={SEARCH_KINDS.map((k) => ({ value: k, label: S.kinds[k] }))}
          onChange={(type) => go({ type: type as SearchFilters["type"] })}
        />
      </div>
      <Select value={filters.period} onValueChange={(v) => go({ period: v as SearchPeriod })}>
        <SelectTrigger size="sm" aria-label={S.period} className="w-auto min-w-0">
          <span className="text-ink-secondary">{S.period}:</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {SEARCH_PERIODS.map((p) => (
            <SelectItem key={p} value={p}>
              {S.periods[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm">
        {S.submit}
      </Button>
    </form>
  )
}
