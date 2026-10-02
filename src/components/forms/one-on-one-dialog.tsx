"use client"

import * as React from "react"
import { useForm } from "react-hook-form"

import { createOneOnOne } from "@/actions/records"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react"
import { formatDate, maskDateInput, todayBusinessDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { oneOnOneSchema, type OneOnOneInput } from "@/lib/validators/records"

import { applyFieldErrors, DisclosureToggle, FormError, VisibilityField, zodResolver } from "./form-kit"
import { GeneratedAgreements, isBlankAgreement, type GeneratedRowErrors } from "./generated-agreements"
import { OneOnOneContextPanel } from "./one-on-one-context"
import type { RecordTarget } from "./note-dialog"

const L = labels.forms.oneOnOne
const FIELDS = [
  "date",
  "topics",
  "durationMinutes",
  "memberPerception",
  "managerPerception",
  "wins",
  "difficulties",
  "development",
  "nextReviewAt",
  "visibility",
  "agreements",
] as const

type Group = "perceptions" | "progress" | "next"

/**
 * Registro de 1:1. Data e assuntos de cara; percepções, conquistas e
 * dificuldades, desenvolvimento e próxima revisão em seções recolhidas —
 * ninguém preenche dez campos de uma vez. Nasce PRIVATE. Combinados gerados
 * no próprio formulário (responsável = a pessoa).
 *
 * Ao lado, o painel de contexto (somente leitura): o que ficou do 1:1
 * anterior, combinados em aberto, último feedback e PDI ativo. Aberto por
 * padrão; dá para ocultar.
 */
export function OneOnOneDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: RecordTarget
}) {
  const defaults = React.useCallback(
    (): OneOnOneInput => ({
      memberId: member.id,
      date: formatDate(todayBusinessDate(), "business"),
      topics: "",
      durationMinutes: "",
      memberPerception: "",
      managerPerception: "",
      wins: "",
      difficulties: "",
      development: "",
      nextReviewAt: "",
      visibility: "PRIVATE",
      agreements: [],
    }),
    [member.id],
  )
  const form = useForm<OneOnOneInput>({ resolver: zodResolver(oneOnOneSchema), defaultValues: defaults() })
  const [openGroups, setOpenGroups] = React.useState<Set<Group>>(new Set())
  const [showContext, setShowContext] = React.useState(true)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!open) return
    form.reset(defaults())
    setOpenGroups(new Set())
    setFormError(null)
  }, [open, defaults, form])

  const err = form.formState.errors
  const groupOf: Partial<Record<keyof OneOnOneInput, Group>> = {
    memberPerception: "perceptions",
    managerPerception: "perceptions",
    wins: "progress",
    difficulties: "progress",
    development: "next",
    nextReviewAt: "next",
  }

  function toggle(group: Group) {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const onSubmit = form.handleSubmit(
    (values) => {
      setFormError(null)
      startTransition(async () => {
        const result = await createOneOnOne(values)
        if (result.ok) return onOpenChange(false)
        setFormError(result.error)
        applyFieldErrors(result.fieldErrors, FIELDS, form.setError)
      })
    },
    // Erro dentro de uma seção recolhida: abre a seção para o erro aparecer.
    (errors) => {
      const groups = Object.keys(errors).flatMap((key) => groupOf[key as keyof OneOnOneInput] ?? [])
      if (groups.length) setOpenGroups((current) => new Set([...current, ...groups]))
    },
  )

  // Linhas de combinado vazias não vão para a validação nem para o servidor.
  function submit(event: React.FormEvent) {
    form.setValue(
      "agreements",
      form.getValues("agreements").filter((row) => !isBlankAgreement(row)),
    )
    return onSubmit(event)
  }

  const dateProps = (name: "date" | "nextReviewAt") =>
    form.register(name, { onChange: (e) => form.setValue(name, maskDateInput(e.target.value)) })

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90svh] max-w-dialog-wide overflow-y-auto"
        // Foco inicial no campo principal sem autoFocus: com autoFocus o Radix
        // registra o próprio campo como origem e não devolve o foco ao botão.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          form.setFocus("topics")
        }}
      >
        <DialogHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex flex-col gap-1.5">
            <DialogTitle>{L.title}</DialogTitle>
            <DialogDescription>{fill(L.description, { name: member.preferredName })}</DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 self-start shrink-0 sm:mr-8 sm:ml-0"
            aria-expanded={showContext}
            aria-controls="one-on-one-context"
            onClick={() => setShowContext((v) => !v)}
          >
            {showContext ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
            {showContext ? labels.forms.context.hide : labels.forms.context.show}
          </Button>
        </DialogHeader>
        <div className={showContext ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]" : "grid"}>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-[140px_180px]">
            <FieldGroup label={labels.forms.date} error={err.date?.message} required>
              <Input
                inputMode="numeric"
                placeholder={labels.forms.datePlaceholder}
                autoComplete="off"
                className="font-mono"
                {...dateProps("date")}
              />
            </FieldGroup>
            <FieldGroup label={L.duration} error={err.durationMinutes?.message} optional>
              <Input inputMode="numeric" autoComplete="off" className="font-mono" {...form.register("durationMinutes")} />
            </FieldGroup>
          </div>
          <FieldGroup label={L.topics} error={err.topics?.message} required>
            <Textarea rows={3} {...form.register("topics")} />
          </FieldGroup>

          <OptionalGroup title={L.perceptions} open={openGroups.has("perceptions")} onToggle={() => toggle("perceptions")}>
            <FieldGroup label={L.memberPerception} error={err.memberPerception?.message}>
              <Textarea rows={2} {...form.register("memberPerception")} />
            </FieldGroup>
            <FieldGroup label={L.managerPerception} error={err.managerPerception?.message}>
              <Textarea rows={2} {...form.register("managerPerception")} />
            </FieldGroup>
          </OptionalGroup>

          <OptionalGroup title={L.progress} open={openGroups.has("progress")} onToggle={() => toggle("progress")}>
            <FieldGroup label={L.wins} error={err.wins?.message}>
              <Textarea rows={2} {...form.register("wins")} />
            </FieldGroup>
            <FieldGroup label={L.difficulties} error={err.difficulties?.message}>
              <Textarea rows={2} {...form.register("difficulties")} />
            </FieldGroup>
          </OptionalGroup>

          <OptionalGroup title={L.next} open={openGroups.has("next")} onToggle={() => toggle("next")}>
            <FieldGroup label={L.development} error={err.development?.message}>
              <Textarea rows={2} {...form.register("development")} />
            </FieldGroup>
            <FieldGroup label={L.nextReviewAt} error={err.nextReviewAt?.message} className="sm:max-w-[140px]">
              <Input
                inputMode="numeric"
                placeholder={labels.forms.datePlaceholder}
                autoComplete="off"
                className="font-mono"
                {...dateProps("nextReviewAt")}
              />
            </FieldGroup>
          </OptionalGroup>

          <div className="border-t border-line pt-3">
            <GeneratedAgreements
              memberName={member.preferredName}
              value={form.watch("agreements")}
              onChange={(rows) => form.setValue("agreements", rows, { shouldValidate: form.formState.isSubmitted })}
              errors={form.formState.errors.agreements as GeneratedRowErrors[] | undefined}
            />
          </div>

          <VisibilityField value={form.watch("visibility")} onChange={(v) => form.setValue("visibility", v)} />
          <FormError message={formError} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {L.submit}
            </Button>
          </DialogFooter>
        </form>
        {showContext ? (
          <aside
            id="one-on-one-context"
            aria-label={labels.forms.context.title}
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface-sunken p-4 lg:max-h-[70svh] lg:overflow-y-auto"
          >
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-semibold text-ink">{labels.forms.context.title}</h3>
              <p className="text-xs text-ink-secondary">{labels.forms.context.direction}</p>
            </div>
            <OneOnOneContextPanel memberId={member.id} />
          </aside>
        ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Seção opcional recolhida, com o título como botão de abrir. */
function OptionalGroup({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <DisclosureToggle open={open} onToggle={onToggle} closedLabel={title} openLabel={title} />
      {open ? <div className="flex flex-col gap-4">{children}</div> : null}
    </div>
  )
}
