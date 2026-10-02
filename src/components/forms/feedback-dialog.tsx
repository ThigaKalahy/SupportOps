"use client"

import * as React from "react"
import { useForm } from "react-hook-form"

import { createFeedback } from "@/actions/records"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, maskDateInput, todayBusinessDate } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import { FEEDBACK_CATEGORIES, feedbackSchema, type FeedbackInput } from "@/lib/validators/records"

import { applyFieldErrors, FormError, VisibilityField, zodResolver } from "./form-kit"
import type { RecordTarget } from "./note-dialog"

const L = labels.forms.feedback
const FIELDS = ["date", "category", "context", "behavior", "impact", "guidance", "followUpAt", "visibility"] as const

/**
 * Feedback no modelo SCI, com rótulos que ajudam a escrever bem. Nasce
 * PRIVATE; a categoria Reconhecimento SUGERE compartilhar — troca o padrão
 * enquanto a pessoa não escolheu a visibilidade, nunca depois.
 * (Combinado gerado a partir do feedback: P13.)
 *
 * `suggestion`: contexto sugerido por quem abriu (ex.: o bloco de validação
 * de prioridade do perfil). Aparece acima do campo e só entra nele se a
 * pessoa escolher usar — sugerido, nunca escrito automaticamente.
 */
export function FeedbackDialog({
  open,
  onOpenChange,
  member,
  suggestion,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: RecordTarget
  suggestion?: string
}) {
  const defaults = React.useCallback(
    (): FeedbackInput => ({
      memberId: member.id,
      date: formatDate(todayBusinessDate(), "business"),
      category: "DEVELOPMENT",
      context: "",
      behavior: "",
      impact: "",
      guidance: "",
      followUpAt: "",
      visibility: "PRIVATE",
    }),
    [member.id],
  )
  const form = useForm<FeedbackInput>({ resolver: zodResolver(feedbackSchema), defaultValues: defaults() })
  const [visibilityTouched, setVisibilityTouched] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!open) return
    form.reset(defaults())
    setVisibilityTouched(false)
    setFormError(null)
  }, [open, defaults, form])

  const category = form.watch("category")

  function changeCategory(value: FeedbackInput["category"]) {
    form.setValue("category", value, { shouldValidate: true })
    if (!visibilityTouched) form.setValue("visibility", value === "RECOGNITION" ? "SHARED" : "PRIVATE")
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const result = await createFeedback(values)
      if (result.ok) return onOpenChange(false)
      setFormError(result.error)
      applyFieldErrors(result.fieldErrors, FIELDS, form.setError)
    })
  })

  const err = form.formState.errors
  const dateProps = (name: "date" | "followUpAt") =>
    form.register(name, { onChange: (e) => form.setValue(name, maskDateInput(e.target.value)) })

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto"
        // Foco inicial no campo principal sem autoFocus: com autoFocus o Radix
        // registra o próprio campo como origem e não devolve o foco ao botão.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          form.setFocus("behavior")
        }}
      >
        <DialogHeader>
          <DialogTitle>{L.title}</DialogTitle>
          <DialogDescription>{fill(L.description, { name: member.preferredName })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <FieldGroup label={L.category} error={err.category?.message} required>
              {(control) => (
                <Select value={category} onValueChange={(v) => changeCategory(v as FeedbackInput["category"])}>
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEEDBACK_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {enumLabel("feedbackCategory", c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            <FieldGroup label={labels.forms.date} error={err.date?.message} required>
              <Input
                inputMode="numeric"
                placeholder={labels.forms.datePlaceholder}
                autoComplete="off"
                className="font-mono"
                {...dateProps("date")}
              />
            </FieldGroup>
          </div>
          {suggestion ? (
            <div className="flex flex-col gap-1.5 rounded-sm border border-line bg-surface-sunken px-3 py-2">
              <span className="text-xs text-ink-secondary">{L.suggestion}</span>
              <p className="text-sm text-ink">{suggestion}</p>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="self-start"
                onClick={() => form.setValue("context", suggestion, { shouldDirty: true })}
              >
                {L.useSuggestion}
              </Button>
            </div>
          ) : null}
          <FieldGroup label={L.context} help={L.contextHelp} error={err.context?.message}>
            <Textarea rows={2} {...form.register("context")} />
          </FieldGroup>
          <FieldGroup label={L.behavior} help={L.behaviorHelp} error={err.behavior?.message} required>
            <Textarea rows={3} {...form.register("behavior")} />
          </FieldGroup>
          <FieldGroup label={L.impact} help={L.impactHelp} error={err.impact?.message}>
            <Textarea rows={2} {...form.register("impact")} />
          </FieldGroup>
          <FieldGroup label={L.guidance} help={L.guidanceHelp} error={err.guidance?.message}>
            <Textarea rows={2} {...form.register("guidance")} />
          </FieldGroup>
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <FieldGroup label={L.followUpAt} error={err.followUpAt?.message} optional>
              <Input
                inputMode="numeric"
                placeholder={labels.forms.datePlaceholder}
                autoComplete="off"
                className="font-mono"
                {...dateProps("followUpAt")}
              />
            </FieldGroup>
            <VisibilityField
              value={form.watch("visibility")}
              onChange={(v) => {
                setVisibilityTouched(true)
                form.setValue("visibility", v)
              }}
              help={category === "RECOGNITION" ? L.recognitionHint : undefined}
            />
          </div>
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
      </DialogContent>
    </Dialog>
  )
}
