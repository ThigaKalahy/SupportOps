"use client"

import * as React from "react"
import { useForm } from "react-hook-form"

import { updateAgreement } from "@/actions/agreements"
import { applyFieldErrors, FormError, zodResolver } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { enumLabel, labels } from "@/lib/labels"
import { AGREEMENT_PRIORITIES, editAgreementSchema, type EditAgreementInput } from "@/lib/validators/agreement"

const L = labels.agreements.editDialog
const F = labels.forms.agreement
const FIELDS = ["title", "description", "priority"] as const

/**
 * Editar combinado: título, detalhes e prioridade. Prazo e responsável não
 * aparecem — o prazo muda na daily, com o arrasto registrado (D12).
 */
export function EditAgreementDialog({
  agreement,
  open,
  onOpenChange,
}: {
  agreement: EditAgreementInput
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const form = useForm<EditAgreementInput>({ resolver: zodResolver(editAgreementSchema), defaultValues: agreement })
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!open) return
    form.reset(agreement)
    setFormError(null)
  }, [open, agreement, form])

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const result = await updateAgreement(values)
      if (result.ok) return onOpenChange(false)
      setFormError(result.error)
      applyFieldErrors(result.fieldErrors, FIELDS, form.setError)
    })
  })

  const err = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          form.setFocus("title")
        }}
      >
        <DialogHeader>
          <DialogTitle>{L.title}</DialogTitle>
          <DialogDescription>{L.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FieldGroup label={F.agreementTitle} error={err.title?.message} required>
            <Input autoComplete="off" {...form.register("title")} />
          </FieldGroup>
          <FieldGroup label={F.details} error={err.description?.message} optional>
            <Textarea rows={3} {...form.register("description")} />
          </FieldGroup>
          <FieldGroup label={F.priority}>
            {(control) => (
              <Select
                value={form.watch("priority")}
                onValueChange={(v) => form.setValue("priority", v as EditAgreementInput["priority"])}
              >
                <SelectTrigger {...control} className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGREEMENT_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {enumLabel("agreementPriority", p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldGroup>
          <p className="text-xs text-ink-secondary">{L.dueDateHint}</p>
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
