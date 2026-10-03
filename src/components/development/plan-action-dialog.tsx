"use client"

import * as React from "react"

import { addPlanAction } from "@/actions/development"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { maskDateInput } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { fieldErrorsOf } from "@/lib/validators/fields"
import { ACTION_OWNERS, addPlanActionSchema, type PlanActionInput } from "@/lib/validators/development"

const A = labels.development.actionDialog
const D = labels.development.planDialog
const P = labels.development.plans

const blank = (): PlanActionInput => ({ description: "", ownerType: "MEMBER", ownerMemberId: "", dueDate: "" })

/** Acrescenta uma ação a um PDI existente: descrição, responsável (pessoa, gestor ou mentor) e prazo. */
export function PlanActionDialog({
  plan,
  mentors,
  onOpenChange,
}: {
  /** null = fechado. */
  plan: { id: string; objective: string } | null
  mentors: { id: string; preferredName: string }[]
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const ref = React.useRef<HTMLInputElement>(null)
  const [values, setValues] = React.useState<PlanActionInput>(blank)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!plan) return
    setValues(blank())
    setErrors({})
    setFormError(null)
  }, [plan])

  const set = (patch: Partial<PlanActionInput>) => setValues((v) => ({ ...v, ...patch }))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!plan) return
    const parsed = addPlanActionSchema.safeParse({ planId: plan.id, action: values })
    if (!parsed.success) return setErrors(fieldErrorsOf(parsed.error))
    setErrors({})
    setFormError(null)
    startTransition(async () => {
      const result = await addPlanAction(parsed.data)
      if (result.ok) {
        toast.show(labels.toast.actionAdded)
        return onOpenChange(false)
      }
      setFormError(result.error)
      setErrors(result.fieldErrors ?? {})
    })
  }

  return (
    <Dialog open={plan !== null} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ref.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{A.title}</DialogTitle>
          <DialogDescription>{plan ? fill(A.description, { objective: plan.objective }) : null}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FieldGroup label={D.actionDescription} required error={errors["action.description"]}>
            <Input ref={ref} value={values.description} maxLength={300} autoComplete="off" onChange={(e) => set({ description: e.target.value })} />
          </FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label={D.actionOwner}>
              {(control) => (
                <Select value={values.ownerType} onValueChange={(v) => set({ ownerType: v as PlanActionInput["ownerType"] })}>
                  <SelectTrigger {...control} className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_OWNERS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {P.owner[o]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            {values.ownerType === "MENTOR" ? (
              <FieldGroup label={D.actionMentor} required error={errors["action.ownerMemberId"]}>
                {(control) => (
                  <Select value={values.ownerMemberId} onValueChange={(v) => set({ ownerMemberId: v })}>
                    <SelectTrigger {...control} className="w-full min-w-0">
                      <SelectValue placeholder={D.actionMentorPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {mentors.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.preferredName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FieldGroup>
            ) : null}
          </div>
          <FieldGroup label={D.actionDue} optional error={errors["action.dueDate"]} className="sm:max-w-[140px]">
            <Input
              value={values.dueDate}
              inputMode="numeric"
              autoComplete="off"
              placeholder={labels.forms.datePlaceholder}
              className="font-mono"
              onChange={(e) => set({ dueDate: maskDateInput(e.target.value) })}
            />
          </FieldGroup>
          <FormError message={formError} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {A.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
