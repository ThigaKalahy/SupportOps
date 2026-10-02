"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarIcon, ChevronDownIcon, SlidersHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDate, maskDateInput, parseDisplayDate, todayBusinessDate } from "@/lib/dates"
import { enumLabel, labels } from "@/lib/labels"
import { VALIDATION_OUTCOMES } from "@/lib/priority-validation"
import { cn } from "@/lib/utils"
import {
  hasValidationFilters,
  toUrlDate,
  VALIDATION_PARAMS,
  VALIDATION_PERIODS,
  type ValidationFilters,
  type ValidationPeriod,
} from "@/lib/validation-filters"

const F = labels.priorityValidations.filters
const ALL = "all"

/**
 * Período (hoje, 7 dias, 30 dias, mês atual, intervalo personalizado) e
 * filtros (responsável, resultado, motivo) na barra de contexto. Estado na URL.
 */
export function ValidationsToolbar({
  filters,
  members,
  reasons,
}: {
  filters: ValidationFilters
  members: { id: string; preferredName: string }[]
  reasons: { id: string; label: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [periodOpen, setPeriodOpen] = React.useState(false)
  const [custom, setCustom] = React.useState(filters.period === "custom")
  const [from, setFrom] = React.useState(filters.from ? formatDate(filters.from, "business") : "")
  const [to, setTo] = React.useState(filters.to ? formatDate(filters.to, "business") : "")
  const [rangeError, setRangeError] = React.useState<string | null>(null)

  function replace(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function choosePeriod(period: ValidationPeriod) {
    if (period === "custom") return setCustom(true)
    setCustom(false)
    setPeriodOpen(false)
    replace({
      [VALIDATION_PARAMS.period]: period === "today" ? null : period,
      [VALIDATION_PARAMS.from]: null,
      [VALIDATION_PARAMS.to]: null,
    })
  }

  function applyRange(event: React.FormEvent) {
    event.preventDefault()
    const start = parseDisplayDate(from)
    const end = parseDisplayDate(to)
    if (!start || !end) return setRangeError(labels.validation.date)
    if (end > todayBusinessDate() || start > todayBusinessDate()) return setRangeError(labels.validation.futureDate)
    setRangeError(null)
    setPeriodOpen(false)
    const [a, b] = start <= end ? [start, end] : [end, start]
    replace({
      [VALIDATION_PARAMS.period]: "custom",
      [VALIDATION_PARAMS.from]: toUrlDate(a),
      [VALIDATION_PARAMS.to]: toUrlDate(b),
    })
  }

  const periodLabel =
    filters.period === "custom" && filters.from && filters.to
      ? `${formatDate(filters.from, "business")} – ${formatDate(filters.to, "business")}`
      : F.periods[filters.period]
  const active = [filters.memberId, filters.outcome, filters.reasonId].filter(Boolean).length

  return (
    <>
      <Popover open={periodOpen} onOpenChange={setPeriodOpen}>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm" aria-label={`${F.period}: ${periodLabel}`}>
            <CalendarIcon />
            <span className="max-sm:sr-only">{periodLabel}</span>
            <ChevronDownIcon className="text-ink-secondary" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-64 flex-col gap-3">
          <div role="radiogroup" aria-label={F.period} className="flex flex-col">
            {VALIDATION_PERIODS.map((period) => {
              const checked = period === "custom" ? custom : !custom && filters.period === period
              return (
                <button
                  key={period}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => choosePeriod(period)}
                  className={cn(
                    "flex h-8 items-center rounded-sm px-2 text-left text-sm hover:bg-surface-sunken",
                    checked ? "font-medium text-ink" : "text-ink-secondary",
                  )}
                >
                  {F.periods[period]}
                </button>
              )
            })}
          </div>
          {custom ? (
            <form onSubmit={applyRange} className="flex flex-col gap-3 border-t border-line pt-3" noValidate>
              <div className="grid grid-cols-2 gap-2">
                <FieldGroup label={F.from}>
                  <Input
                    value={from}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={labels.forms.datePlaceholder}
                    className="h-8 font-mono"
                    onChange={(e) => setFrom(maskDateInput(e.target.value))}
                  />
                </FieldGroup>
                <FieldGroup label={F.to}>
                  <Input
                    value={to}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={labels.forms.datePlaceholder}
                    className="h-8 font-mono"
                    onChange={(e) => setTo(maskDateInput(e.target.value))}
                  />
                </FieldGroup>
              </div>
              {rangeError ? (
                <p role="alert" className="text-xs text-overdue">
                  {rangeError}
                </p>
              ) : null}
              <Button type="submit" size="sm" className="self-end">
                {F.apply}
              </Button>
            </form>
          ) : null}
        </PopoverContent>
      </Popover>

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
          {hasValidationFilters(filters) ? (
            <Button
              variant="link"
              size="sm"
              className="self-start"
              onClick={() =>
                replace({ [VALIDATION_PARAMS.member]: null, [VALIDATION_PARAMS.outcome]: null, [VALIDATION_PARAMS.reason]: null })
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
