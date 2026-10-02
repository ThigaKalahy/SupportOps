"use client"

import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MetaLabel } from "@/components/ui/meta-label"
import { maskDateInput } from "@/lib/dates"
import { fill, labels, plural } from "@/lib/labels"
import { MAX_GENERATED_AGREEMENTS, type GeneratedAgreementInput } from "@/lib/validators/records"

const L = labels.forms.generated

export type GeneratedRowErrors = { title?: { message?: string }; dueDate?: { message?: string } } | undefined

/** Linha totalmente vazia: descartada antes de enviar. */
export function isBlankAgreement(row: GeneratedAgreementInput): boolean {
  return row.title.trim() === "" && row.dueDate.trim() === ""
}

/**
 * Combinados gerados dentro do 1:1 ou do feedback. O responsável é a pessoa
 * do registro; cada linha pede o que foi combinado e o prazo. Enter no prazo
 * acrescenta outra linha. Linhas vazias não são enviadas.
 */
export function GeneratedAgreements({
  value,
  onChange,
  errors,
  memberName,
}: {
  value: GeneratedAgreementInput[]
  onChange: (rows: GeneratedAgreementInput[]) => void
  errors?: GeneratedRowErrors[]
  memberName: string
}) {
  const titleRefs = React.useRef<(HTMLInputElement | null)[]>([])
  const focusNext = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (focusNext.current === null) return
    titleRefs.current[focusNext.current]?.focus()
    focusNext.current = null
  }, [value.length])

  function patch(index: number, change: Partial<GeneratedAgreementInput>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...change } : row)))
  }

  function add() {
    if (value.length >= MAX_GENERATED_AGREEMENTS) return
    focusNext.current = value.length
    onChange([...value, { title: "", dueDate: "" }])
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  const filled = value.filter((row) => !isBlankAgreement(row)).length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <MetaLabel>{L.title}</MetaLabel>
        {filled > 0 ? <span className="font-mono text-2xs text-ink-secondary">{plural(L.count, filled)}</span> : null}
      </div>
      <p className="text-xs text-ink-secondary">{fill(L.direction, { name: memberName })}</p>
      {value.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {value.map((row, i) => {
            const err = errors?.[i]
            return (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <Input
                    ref={(el) => {
                      titleRefs.current[i] = el
                    }}
                    value={row.title}
                    maxLength={160}
                    autoComplete="off"
                    aria-label={`${L.agreementTitle} ${i + 1}`}
                    aria-invalid={err?.title ? true : undefined}
                    placeholder={L.agreementTitle}
                    className="min-w-0 flex-1"
                    onChange={(e) => patch(i, { title: e.target.value })}
                  />
                  <Input
                    value={row.dueDate}
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`${L.dueDate} ${i + 1}`}
                    aria-invalid={err?.dueDate ? true : undefined}
                    placeholder={labels.forms.datePlaceholder}
                    className="w-[7.5rem] shrink-0 font-mono"
                    onChange={(e) => patch(i, { dueDate: maskDateInput(e.target.value) })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault()
                        add()
                      }
                    }}
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label={`${L.remove} ${i + 1}`} onClick={() => remove(i)}>
                    <XIcon />
                  </Button>
                </div>
                {err?.title || err?.dueDate ? (
                  <p className="text-xs text-overdue">{err.title?.message ?? err.dueDate?.message}</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {value.length < MAX_GENERATED_AGREEMENTS ? (
        <Button type="button" variant="ghost" size="sm" className="-ml-2 self-start" onClick={add}>
          <PlusIcon />
          {L.add}
        </Button>
      ) : null}
    </div>
  )
}
