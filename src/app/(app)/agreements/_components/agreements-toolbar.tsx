"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { PlusIcon, SlidersHorizontalIcon } from "lucide-react"

import { useQuickAgreement } from "@/components/forms/quick-agreement"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AGREEMENT_PARAMS, CREATED_PERIODS, hasAgreementFilters, type AgreementFilters } from "@/lib/agreement-filters"
import { enumLabel, labels } from "@/lib/labels"
import { AGREEMENT_ORIGINS, AGREEMENT_PRIORITIES } from "@/lib/validators/agreement"

const F = labels.agreements.filters
const ALL = "all"

function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string
  value: string | null
  allLabel: string
  options: { value: string; label: string }[]
  onChange: (value: string | null) => void
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger size="sm" aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>
          {label}: {allLabel}
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Filtros (popover) e "Novo combinado" na barra de contexto de /agreements.
 * Estado na URL, como as abas.
 */
export function AgreementsToolbar({
  filters,
  members,
  seniorities,
  canWrite,
}: {
  filters: AgreementFilters
  members: { id: string; preferredName: string }[]
  seniorities: { key: string; label: string }[]
  canWrite: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const quickAgreement = useQuickAgreement()

  function update(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null) params.delete(key)
    else params.set(key, value)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function clear() {
    const params = new URLSearchParams()
    const view = searchParams.get(AGREEMENT_PARAMS.view)
    if (view) params.set(AGREEMENT_PARAMS.view, view)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const active = [filters.memberId, filters.seniority, filters.origin, filters.priority, filters.created !== "all"].filter(
    Boolean,
  ).length

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm">
            <SlidersHorizontalIcon />
            {F.button}
            {active > 0 ? <span className="font-mono text-2xs text-accent">{active}</span> : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-64 flex-col gap-3">
          <FilterSelect
            label={F.member}
            value={filters.memberId}
            allLabel={F.allMembers}
            options={members.map((m) => ({ value: m.id, label: m.preferredName }))}
            onChange={(v) => update(AGREEMENT_PARAMS.member, v)}
          />
          <FilterSelect
            label={F.seniority}
            value={filters.seniority}
            allLabel={F.allSeniorities}
            options={seniorities.map((s) => ({ value: s.key, label: s.label }))}
            onChange={(v) => update(AGREEMENT_PARAMS.seniority, v)}
          />
          <FilterSelect
            label={F.origin}
            value={filters.origin}
            allLabel={F.allOrigins}
            options={AGREEMENT_ORIGINS.map((o) => ({ value: o, label: enumLabel("agreementOrigin", o) }))}
            onChange={(v) => update(AGREEMENT_PARAMS.origin, v)}
          />
          <FilterSelect
            label={F.priority}
            value={filters.priority}
            allLabel={F.allPriorities}
            options={AGREEMENT_PRIORITIES.map((p) => ({ value: p, label: enumLabel("agreementPriority", p) }))}
            onChange={(v) => update(AGREEMENT_PARAMS.priority, v)}
          />
          <FilterSelect
            label={F.created}
            value={filters.created === "all" ? null : filters.created}
            allLabel={F.allTime}
            options={CREATED_PERIODS.filter((p) => p !== "all").map((p) => ({ value: p, label: labels.agreements.created[p] }))}
            onChange={(v) => update(AGREEMENT_PARAMS.created, v)}
          />
          {hasAgreementFilters(filters) ? (
            <Button variant="link" size="sm" className="self-start" onClick={clear}>
              {F.clear}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
      {canWrite && quickAgreement ? (
        <Button size="sm" onClick={() => quickAgreement.open()} title={`${labels.agreements.new} (${labels.agreements.newShortcut})`}>
          <PlusIcon />
          <span className="max-sm:sr-only">{labels.agreements.new}</span>
          <kbd className="ml-1 rounded-xs border border-surface/40 px-1 font-mono text-2xs max-sm:hidden">
            {labels.agreements.newShortcut}
          </kbd>
        </Button>
      ) : null}
    </>
  )
}
