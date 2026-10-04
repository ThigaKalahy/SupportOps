"use client"

import * as React from "react"
import { ArchiveIcon, PlusIcon } from "lucide-react"

import { archiveTrait, createTrait } from "@/actions/development"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { MetaLabel } from "@/components/ui/meta-label"
import { Section } from "@/components/ui/section"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, maskDateInput, todayBusinessDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { fieldErrorsOf } from "@/lib/validators/fields"
import { TRAIT_KINDS, traitSchema, type TraitInput } from "@/lib/validators/development"
import type { MemberDevelopment } from "@/server/queries/development"

const T = labels.development.traits
type Trait = MemberDevelopment["traits"][number]

/**
 * Pontos fortes e de desenvolvimento, cada um com a data em que foi
 * observado. Arquivar tira da lista ativa e manda para o histórico — nada
 * se apaga.
 */
export function TraitsSection({
  traits,
  member,
  canWrite,
}: {
  traits: Trait[]
  member: { id: string; preferredName: string }
  canWrite: boolean
}) {
  const [adding, setAdding] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const archived = traits.filter((t) => !t.isActive)

  function archive(trait: Trait) {
    setError(null)
    startTransition(async () => {
      const result = await archiveTrait({ traitId: trait.id })
      if (!result.ok) setError(result.error)
    })
  }

  const column = (kind: Trait["kind"], title: string) => {
    const list = traits.filter((t) => t.isActive && t.kind === kind)
    return (
      <div className="flex flex-col gap-1.5">
        <MetaLabel>
          {title} · {list.length}
        </MetaLabel>
        {list.length === 0 ? (
          <p className="text-sm text-ink-secondary">{T.empty}</p>
        ) : (
          <ul className="flex flex-col">
            {list.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-2 border-b border-line py-2 last:border-b-0">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-ink">{t.text}</span>
                  <span className="text-xs text-ink-secondary">{fill(T.observedAt, { date: formatDate(t.observedAt, "business") })}</span>
                </span>
                {canWrite ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    aria-label={fill(T.archiveLabel, { text: t.text })}
                    title={T.archive}
                    onClick={() => archive(t)}
                  >
                    <ArchiveIcon />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <Section
      title={T.title}
      action={
        canWrite ? (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <PlusIcon />
            {T.add}
          </Button>
        ) : null
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        {column("STRENGTH", T.strengths)}
        {column("DEVELOPMENT", T.developmentPoints)}
      </div>
      {archived.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-xs text-ink-secondary hover:text-ink">
            {T.archived} · {archived.length}
          </summary>
          <ul className="mt-2 flex flex-col">
            {archived.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 border-b border-line py-1.5 text-sm last:border-b-0">
                <span className="text-xs text-ink-secondary">{T.kindOptions[t.kind]}</span>
                <span className="text-ink-secondary">{t.text}</span>
                <span className="text-xs text-ink-secondary">{fill(T.observedAt, { date: formatDate(t.observedAt, "business") })}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <FormError message={error} />
      {canWrite ? <TraitDialog open={adding} onOpenChange={setAdding} member={member} /> : null}
    </Section>
  )
}

function TraitDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: { id: string; preferredName: string }
}) {
  const empty = React.useCallback(
    (): TraitInput => ({ memberId: member.id, kind: "STRENGTH", text: "", observedAt: formatDate(todayBusinessDate(), "business") }),
    [member.id],
  )
  const [values, setValues] = React.useState<TraitInput>(empty)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const ref = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (!open) return
    setValues(empty())
    setErrors({})
    setFormError(null)
  }, [open, empty])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = traitSchema.safeParse(values)
    if (!parsed.success) return setErrors(fieldErrorsOf(parsed.error))
    startTransition(async () => {
      const result = await createTrait(parsed.data)
      if (result.ok) return onOpenChange(false)
      setFormError(result.error)
      setErrors(result.fieldErrors ?? {})
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ref.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{T.dialogTitle}</DialogTitle>
          <DialogDescription>{fill(T.dialogDescription, { name: member.preferredName })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FieldGroup label={T.text} required error={errors.text}>
            <Textarea ref={ref} rows={2} value={values.text} onChange={(e) => setValues((v) => ({ ...v, text: e.target.value }))} />
          </FieldGroup>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <FieldGroup label={T.kind} required>
              {(control) => (
                <Select value={values.kind} onValueChange={(k) => setValues((v) => ({ ...v, kind: k as TraitInput["kind"] }))}>
                  <SelectTrigger {...control} className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAIT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {T.kindOptions[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            <FieldGroup label={labels.forms.date} required error={errors.observedAt}>
              <Input
                value={values.observedAt}
                inputMode="numeric"
                autoComplete="off"
                placeholder={labels.forms.datePlaceholder}
                className="font-mono"
                onChange={(e) => setValues((v) => ({ ...v, observedAt: maskDateInput(e.target.value) }))}
              />
            </FieldGroup>
          </div>
          <FormError message={formError} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {T.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
