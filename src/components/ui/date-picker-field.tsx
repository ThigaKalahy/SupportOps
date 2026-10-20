"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { parseDisplayDate, todayBusinessDate } from "@/lib/dates"
import { labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

const pad = (n: number) => String(n).padStart(2, "0")

/** Data de negócio (meia-noite UTC) → Date local do mesmo dia, como o DayPicker espera. */
function toLocal(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/** Date local do DayPicker → "DD/MM/AAAA". */
function toText(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

/**
 * Campo de data com calendário (C17): um botão com a data em DD/MM/AAAA que abre o
 * calendário em pt-BR. O valor é o texto "DD/MM/AAAA" (o mesmo dos schemas). Alvo de
 * toque de 44px; `min` esconde os dias antes dele; `optional` mostra "Limpar".
 */
export function DatePickerField({
  value,
  onChange,
  min,
  optional = false,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  /** Data de negócio mínima (ex.: hoje — prazo não fica no passado). */
  min?: Date
  optional?: boolean
  placeholder?: string
  className?: string
  "aria-label": string
}) {
  const [open, setOpen] = React.useState(false)
  const parsed = parseDisplayDate(value)
  const selected = parsed ? toLocal(parsed) : undefined
  const today = toLocal(todayBusinessDate())
  const minLocal = min ? toLocal(min) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={value ? `${ariaLabel}: ${value}` : ariaLabel}
          className={cn(
            "inline-flex min-h-11 w-full items-center gap-2 rounded-sm border border-line bg-surface px-3 text-left text-sm",
            value ? "font-mono text-ink" : "text-ink-secondary",
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-ink-secondary" aria-hidden />
          <span className="truncate">{value || placeholder || ariaLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? today}
          today={today}
          disabled={minLocal ? { before: minLocal } : undefined}
          onSelect={(date) => {
            if (!date) return
            onChange(toText(date))
            setOpen(false)
          }}
        />
        {optional && value ? (
          <div className="border-t border-line p-2">
            <button
              type="button"
              className="min-h-11 w-full rounded-sm text-sm text-ink-secondary hover:bg-surface-sunken hover:text-ink"
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
            >
              {labels.common.clear}
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
