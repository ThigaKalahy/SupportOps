"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarIcon, ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDate, maskDateInput, parseDisplayDate, todayBusinessDate, toUrlDate } from "@/lib/dates"
import { labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

/**
 * Período na barra de contexto: botão com o período atual e popover com as
 * opções; "custom" abre De/Até (DD/MM/AAAA, nunca no futuro). Estado na URL:
 * `period` (omitido quando é o padrão), `from` e `to` em DD-MM-AAAA.
 */
export function PeriodPicker<P extends string>({
  options,
  value,
  defaultValue,
  from,
  to,
  label,
}: {
  options: { value: P | "custom"; label: string }[]
  value: P | "custom"
  /** Período que não vai para a URL. */
  defaultValue: P
  /** Intervalo atual quando value = "custom". */
  from: Date | null
  to: Date | null
  /** Nome acessível ("Período"). */
  label: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = React.useState(false)
  const [custom, setCustom] = React.useState(value === "custom")
  const [start, setStart] = React.useState(from ? formatDate(from, "business") : "")
  const [end, setEnd] = React.useState(to ? formatDate(to, "business") : "")
  const [error, setError] = React.useState<string | null>(null)
  const P = labels.period

  function replace(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, v] of Object.entries(changes)) {
      if (v === null) params.delete(key)
      else params.set(key, v)
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function choose(period: P | "custom") {
    if (period === "custom") return setCustom(true)
    setCustom(false)
    setOpen(false)
    replace({ period: period === defaultValue ? null : period, from: null, to: null })
  }

  function apply(event: React.FormEvent) {
    event.preventDefault()
    const a = parseDisplayDate(start)
    const b = parseDisplayDate(end)
    if (!a || !b) return setError(labels.validation.date)
    if (a > todayBusinessDate() || b > todayBusinessDate()) return setError(labels.validation.futureDate)
    setError(null)
    setOpen(false)
    const [x, y] = a <= b ? [a, b] : [b, a]
    replace({ period: "custom", from: toUrlDate(x), to: toUrlDate(y) })
  }

  const current =
    value === "custom" && from && to
      ? `${formatDate(from, "business")} – ${formatDate(to, "business")}`
      : (options.find((o) => o.value === value)?.label ?? "")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`${label}: ${current}`}>
          <CalendarIcon />
          <span className="max-sm:sr-only">{current}</span>
          <ChevronDownIcon className="text-ink-secondary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-3">
        <div role="radiogroup" aria-label={label} className="flex flex-col">
          {options.map((option) => {
            const checked = option.value === "custom" ? custom : !custom && value === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => choose(option.value)}
                className={cn(
                  "flex h-8 items-center rounded-sm px-2 text-left text-sm hover:bg-surface-sunken",
                  checked ? "font-medium text-ink" : "text-ink-secondary",
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        {custom ? (
          <form onSubmit={apply} className="flex flex-col gap-3 border-t border-line pt-3" noValidate>
            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label={P.from}>
                <Input
                  value={start}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={labels.forms.datePlaceholder}
                  className="h-8 font-mono"
                  onChange={(e) => setStart(maskDateInput(e.target.value))}
                />
              </FieldGroup>
              <FieldGroup label={P.to}>
                <Input
                  value={end}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={labels.forms.datePlaceholder}
                  className="h-8 font-mono"
                  onChange={(e) => setEnd(maskDateInput(e.target.value))}
                />
              </FieldGroup>
            </div>
            {error ? (
              <p role="alert" className="text-xs text-overdue">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="sm" className="self-end">
              {P.apply}
            </Button>
          </form>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
