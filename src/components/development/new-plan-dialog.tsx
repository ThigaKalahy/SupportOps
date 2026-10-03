"use client"

import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { createPlan, updatePlan } from "@/actions/development"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { MetaLabel } from "@/components/ui/meta-label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { formatDate, maskDateInput, todayBusinessDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { fieldErrorsOf } from "@/lib/validators/fields"
import {
  ACTION_OWNERS,
  createPlanSchema,
  MAX_PLAN_ACTIONS,
  updatePlanSchema,
  type CreatePlanInput,
  type PlanActionInput,
} from "@/lib/validators/development"

const D = labels.development.planDialog
const P = labels.development.plans
const NONE = "none"

function emptyPlan(memberId: string): CreatePlanInput {
  return {
    memberId,
    competencyId: "",
    currentSituation: "",
    objective: "",
    expectedEvidence: "",
    startedAt: formatDate(todayBusinessDate(), "business"),
    dueDate: "",
    status: "ACTIVE",
    actions: [],
  }
}

const blankAction = (): PlanActionInput => ({ description: "", ownerType: "MEMBER", ownerMemberId: "", dueDate: "" })
const isBlank = (a: PlanActionInput) => !a.description.trim() && !a.dueDate.trim()

/**
 * Novo PDI: competência, situação atual, objetivo, evidência esperada, início
 * e prazo, e as ações com responsável (pessoa, gestor ou mentor) e prazo.
 * Ctrl/⌘+Enter salva.
 *
 * Com `editing`, o mesmo formulário edita o texto, a competência e o prazo de
 * um PDI existente; início, status e ações ficam fora (têm caminho próprio).
 */
export function NewPlanDialog({
  open,
  onOpenChange,
  member,
  competencies,
  mentors,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: { id: string; preferredName: string }
  competencies: { id: string; name: string }[]
  /** Pessoas que podem ser mentoras numa ação (o time, menos a própria pessoa). */
  mentors: { id: string; preferredName: string }[]
  editing?: { planId: string; values: CreatePlanInput }
}) {
  const initial = React.useCallback(() => editing?.values ?? emptyPlan(member.id), [editing, member.id])
  const [values, setValues] = React.useState<CreatePlanInput>(initial)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const toast = useToast()
  const firstRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (!open) return
    setValues(initial())
    setErrors({})
    setFormError(null)
  }, [open, initial])

  const set = (patch: Partial<CreatePlanInput>) => setValues((v) => ({ ...v, ...patch }))
  const setAction = (i: number, patch: Partial<PlanActionInput>) =>
    set({ actions: values.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) })

  function submit(event?: React.FormEvent) {
    event?.preventDefault()
    if (editing) return submitEdit(editing.planId)
    const input = { ...values, actions: values.actions.filter((a) => !isBlank(a)) }
    const parsed = createPlanSchema.safeParse(input)
    if (!parsed.success) {
      setValues(input)
      return setErrors(fieldErrorsOf(parsed.error))
    }
    setErrors({})
    setFormError(null)
    startTransition(async () => {
      const result = await createPlan(parsed.data)
      if (result.ok) {
        toast.show(labels.toast.planCreated)
        return onOpenChange(false)
      }
      setFormError(result.error)
      setErrors(result.fieldErrors ?? {})
    })
  }

  function submitEdit(planId: string) {
    const parsed = updatePlanSchema.safeParse({
      planId,
      competencyId: values.competencyId,
      currentSituation: values.currentSituation,
      objective: values.objective,
      expectedEvidence: values.expectedEvidence,
      dueDate: values.dueDate,
    })
    if (!parsed.success) return setErrors(fieldErrorsOf(parsed.error))
    setErrors({})
    setFormError(null)
    startTransition(async () => {
      const result = await updatePlan(parsed.data)
      if (result.ok) {
        toast.show(labels.toast.planUpdated)
        return onOpenChange(false)
      }
      setFormError(result.error)
      setErrors(result.fieldErrors ?? {})
    })
  }

  const date = (key: "startedAt" | "dueDate", label: string, required: boolean) => (
    <FieldGroup label={label} required={required} optional={!required} error={errors[key]}>
      <Input
        value={values[key]}
        disabled={Boolean(editing) && key === "startedAt"}
        inputMode="numeric"
        autoComplete="off"
        placeholder={labels.forms.datePlaceholder}
        className="font-mono"
        onChange={(e) => set({ [key]: maskDateInput(e.target.value) })}
      />
    </FieldGroup>
  )

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90svh] max-w-dialog-wide overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          firstRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? D.editTitle : D.title}</DialogTitle>
          <DialogDescription>{fill(editing ? D.editDescription : D.description, { name: member.preferredName })}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              submit()
            }
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FieldGroup label={P.currentSituation} required error={errors.currentSituation}>
              <Textarea ref={firstRef} rows={3} value={values.currentSituation} onChange={(e) => set({ currentSituation: e.target.value })} />
            </FieldGroup>
            <FieldGroup label={P.objective} required error={errors.objective}>
              <Textarea rows={3} value={values.objective} onChange={(e) => set({ objective: e.target.value })} />
            </FieldGroup>
          </div>
          <FieldGroup label={P.expectedEvidence} optional error={errors.expectedEvidence}>
            <Textarea rows={2} value={values.expectedEvidence} onChange={(e) => set({ expectedEvidence: e.target.value })} />
          </FieldGroup>
          <div
            className={
              editing ? "grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px_140px]" : "grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px_140px_140px]"
            }
          >
            <FieldGroup label={P.competency} optional>
              {(control) => (
                <Select value={values.competencyId || NONE} onValueChange={(v) => set({ competencyId: v === NONE ? "" : v })}>
                  <SelectTrigger {...control} className="w-full min-w-0">
                    <SelectValue placeholder={D.competencyPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{D.noCompetency}</SelectItem>
                    {competencies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            {date("startedAt", P.startedAt, true)}
            {date("dueDate", P.dueDate, false)}
            {editing ? null : (
            <FieldGroup label={D.status}>
              {(control) => (
                <Select value={values.status} onValueChange={(v) => set({ status: v as CreatePlanInput["status"] })}>
                  <SelectTrigger {...control} className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["ACTIVE", "DRAFT"] as const).map((s) => (
                      <SelectItem key={s} value={s}>
                        {D.statusOptions[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            )}
          </div>

          {editing ? null : (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <MetaLabel>{D.actions}</MetaLabel>
            {values.actions.map((a, i) => {
              const err = (field: string) => errors[`actions.${i}.${field}`]
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_136px_minmax(0,140px)_120px_auto]">
                    <Input
                      value={a.description}
                      maxLength={300}
                      autoComplete="off"
                      aria-label={`${D.actionDescription} ${i + 1}`}
                      aria-invalid={err("description") ? true : undefined}
                      placeholder={D.actionDescription}
                      onChange={(e) => setAction(i, { description: e.target.value })}
                    />
                    <Select value={a.ownerType} onValueChange={(v) => setAction(i, { ownerType: v as PlanActionInput["ownerType"] })}>
                      <SelectTrigger aria-label={`${D.actionOwner} ${i + 1}`} className="w-full min-w-0">
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
                    {a.ownerType === "MENTOR" ? (
                      <Select value={a.ownerMemberId} onValueChange={(v) => setAction(i, { ownerMemberId: v })}>
                        <SelectTrigger
                          aria-label={`${D.actionMentor} ${i + 1}`}
                          aria-invalid={err("ownerMemberId") ? true : undefined}
                          className="w-full min-w-0"
                        >
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
                    ) : (
                      <span aria-hidden className="max-sm:hidden" />
                    )}
                    <Input
                      value={a.dueDate}
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label={`${D.actionDue} ${i + 1}`}
                      aria-invalid={err("dueDate") ? true : undefined}
                      placeholder={labels.forms.datePlaceholder}
                      className="font-mono"
                      onChange={(e) => setAction(i, { dueDate: maskDateInput(e.target.value) })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${D.removeAction} ${i + 1}`}
                      onClick={() => set({ actions: values.actions.filter((_, j) => j !== i) })}
                    >
                      <XIcon />
                    </Button>
                  </div>
                  {err("description") || err("ownerMemberId") || err("dueDate") ? (
                    <p className="text-xs text-overdue">{err("description") ?? err("ownerMemberId") ?? err("dueDate")}</p>
                  ) : null}
                </div>
              )
            })}
            {values.actions.length < MAX_PLAN_ACTIONS ? (
              <Button type="button" variant="ghost" size="sm" className="-ml-2 self-start" onClick={() => set({ actions: [...values.actions, blankAction()] })}>
                <PlusIcon />
                {D.addAction}
              </Button>
            ) : null}
          </div>
          )}

          <FormError message={formError} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? labels.forms.saveChanges : D.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
