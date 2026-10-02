"use client"

import type { FieldErrors, FieldValues, Resolver } from "react-hook-form"
import type { ZodType } from "zod"
import { ChevronDownIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { enumLabel, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

/**
 * Peças comuns dos formulários de registro (1:1, feedback, anotação,
 * combinado). Os formulários usam react-hook-form com o MESMO schema zod da
 * Server Action, via `zodResolver` — sem biblioteca extra.
 */

/**
 * Resolver zod mínimo: primeira mensagem de cada campo. Caminhos aninhados
 * (ex.: agreements.0.title) viram o objeto aninhado que o react-hook-form
 * espera em `errors.agreements[0].title`.
 */
export function zodResolver<T extends FieldValues>(schema: ZodType): Resolver<T> {
  return async (values) => {
    const parsed = schema.safeParse(values)
    if (parsed.success) return { values, errors: {} }
    const errors: Record<string, unknown> = {}
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String)
      if (path.length === 0) continue
      let node = errors
      for (const [i, key] of path.entries()) {
        if (i === path.length - 1) {
          if (!node[key]) node[key] = { type: "zod", message: issue.message }
        } else {
          node[key] ??= /^\d+$/.test(path[i + 1]!) ? [] : {}
          node = node[key] as Record<string, unknown>
        }
      }
    }
    return { values: {}, errors: errors as FieldErrors<T> }
  }
}

/** Botão "mais detalhes" que abre e fecha o trecho opcional do formulário. */
export function DisclosureToggle({
  open,
  onToggle,
  closedLabel = labels.team.form.moreDetails,
  openLabel = labels.team.form.lessDetails,
}: {
  open: boolean
  onToggle: () => void
  closedLabel?: string
  openLabel?: string
}) {
  return (
    <div>
      <Button type="button" variant="ghost" size="sm" className="-ml-2" aria-expanded={open} onClick={onToggle}>
        <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
        {open ? openLabel : closedLabel}
      </Button>
    </div>
  )
}

export type VisibilityValue = "PRIVATE" | "SHARED"

/** Campo de visibilidade: a ajuda diz quem vai ver o registro. */
export function VisibilityField({
  value,
  onChange,
  help,
}: {
  value: VisibilityValue
  onChange: (value: VisibilityValue) => void
  /** Texto adicional (ex.: sugestão de compartilhar reconhecimento). */
  help?: string
}) {
  const consequence = labels.forms.visibilityHelp[value]
  return (
    <FieldGroup label={labels.forms.visibility} help={help ? `${consequence} ${help}` : consequence}>
      {(control) => (
        <Select value={value} onValueChange={(v) => onChange(v as VisibilityValue)}>
          <SelectTrigger {...control} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["PRIVATE", "SHARED"] as const).map((v) => (
              <SelectItem key={v} value={v}>
                {enumLabel("visibility", v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FieldGroup>
  )
}

/** Erro geral do formulário (falha da Server Action), dentro do próprio dialog. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs text-overdue">
      {message}
    </p>
  )
}

/** Aplica os erros de campo devolvidos pela Server Action ao formulário. */
export function applyFieldErrors(
  fieldErrors: Record<string, string> | undefined,
  fields: readonly string[],
  setError: (name: never, error: { type: string; message: string }) => void,
) {
  for (const [field, message] of Object.entries(fieldErrors ?? {})) {
    if (fields.includes(field)) setError(field as never, { type: "server", message })
  }
}
