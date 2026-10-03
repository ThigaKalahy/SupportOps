"use client"

import * as React from "react"
import { useForm } from "react-hook-form"

import { createNote, updateNote } from "@/actions/records"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { formatDate, maskDateInput, todayBusinessDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { noteSchema, type NoteInput } from "@/lib/validators/records"

import { applyFieldErrors, FormError, VisibilityField, zodResolver } from "./form-kit"

const L = labels.forms.note
const FIELDS = ["date", "title", "body", "visibility"] as const

export interface RecordTarget {
  id: string
  preferredName: string
}

/** Anotação gerencial ou ocorrência. Nasce PRIVATE. */
export function NoteDialog({
  open,
  onOpenChange,
  member,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: RecordTarget
  editing?: { id: string; values: NoteInput }
  /** Chamado depois de salvar, antes de fechar. */
  onSaved?: () => void
}) {
  const toast = useToast()
  const defaults = React.useCallback(
    (): NoteInput => editing?.values ?? ({
      memberId: member.id,
      date: formatDate(todayBusinessDate(), "business"),
      title: "",
      body: "",
      visibility: "PRIVATE",
    }),
    [member.id, editing],
  )
  const form = useForm<NoteInput>({ resolver: zodResolver(noteSchema), defaultValues: defaults() })
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!open) return
    form.reset(defaults())
    setFormError(null)
  }, [open, defaults, form, editing])

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const result = editing ? await updateNote(editing.id, values) : await createNote(values)
      if (result.ok) {
        toast.show(editing ? labels.toast.recordUpdated : labels.toast.noteCreated)
        onSaved?.()
        return onOpenChange(false)
      }
      setFormError(result.error)
      applyFieldErrors(result.fieldErrors, FIELDS, form.setError)
    })
  })

  const err = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto"
        // Foco inicial no campo principal sem autoFocus: com autoFocus o Radix
        // registra o próprio campo como origem e não devolve o foco ao botão.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          form.setFocus("title")
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? L.editTitle : L.title}</DialogTitle>
          <DialogDescription>{fill(editing ? labels.forms.editDescription : L.description, { name: member.preferredName })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <FieldGroup label={L.noteTitle} error={err.title?.message} required>
              <Input autoComplete="off" {...form.register("title")} />
            </FieldGroup>
            <FieldGroup label={labels.forms.date} error={err.date?.message} required>
              <Input
                inputMode="numeric"
                placeholder={labels.forms.datePlaceholder}
                autoComplete="off"
                className="font-mono"
                {...form.register("date", { onChange: (e) => form.setValue("date", maskDateInput(e.target.value)) })}
              />
            </FieldGroup>
          </div>
          <FieldGroup label={L.body} error={err.body?.message} required>
            <Textarea rows={5} {...form.register("body")} />
          </FieldGroup>
          <VisibilityField value={form.watch("visibility")} onChange={(v) => form.setValue("visibility", v)} />
          <FormError message={formError} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? labels.forms.saveChanges : L.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
