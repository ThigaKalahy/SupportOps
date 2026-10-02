"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { maskDateInput, parseDisplayDate, todayBusinessDate } from "@/lib/dates"
import { labels } from "@/lib/labels"

const L = labels.dailies.otherDate

/**
 * Troca a data da daily em registro (para lançar uma que ficou para trás).
 * A data vai para a URL como DD-MM-AAAA; Enter ou "Abrir" aplicam.
 */
export function DailyDatePicker({ value, retroactive }: { value: string; retroactive: boolean }) {
  const router = useRouter()
  const [text, setText] = React.useState(value)
  const [error, setError] = React.useState<string | null>(null)
  const id = React.useId()

  function apply(event: React.FormEvent) {
    event.preventDefault()
    const parsed = parseDisplayDate(text)
    if (!parsed) return setError(labels.validation.date)
    if (parsed > todayBusinessDate()) return setError(L.future)
    setError(null)
    if (text !== value) router.push(`/dailies/new?date=${text.replaceAll("/", "-")}`)
  }

  return (
    <form onSubmit={apply} className="flex flex-col items-end gap-1" noValidate>
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-xs text-ink-secondary">
          {L.label}
        </Label>
        <Input
          id={id}
          value={text}
          inputMode="numeric"
          autoComplete="off"
          placeholder={labels.forms.datePlaceholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-[7.5rem] font-mono"
          onChange={(e) => setText(maskDateInput(e.target.value))}
        />
        <Button type="submit" size="sm" variant="secondary">
          {L.open}
        </Button>
        {retroactive ? (
          <Button asChild size="sm" variant="ghost">
            <Link href="/dailies/new">{L.today}</Link>
          </Button>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-overdue">
          {error}
        </p>
      ) : null}
    </form>
  )
}
