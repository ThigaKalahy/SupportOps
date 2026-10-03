"use client"

import * as React from "react"
import { useForm, type Resolver } from "react-hook-form"
import { ChevronDownIcon } from "lucide-react"

import { createMember, updateMember } from "@/actions/members"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { formatDate, maskDateInput } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { memberFieldsSchema, type MemberFormValues } from "@/lib/validators/member"
import type { MemberForEdit, MemberFormCatalogs } from "@/server/queries/members"

const L = labels.team.form
const STATUSES = ["ACTIVE", "ON_LEAVE", "OFFBOARDING"] as const
const LEVELS = ["1", "2", "3", "4", "5"] as const
const NOT_ASSESSED = "none"

type MainFields = Omit<MemberFormValues, "responsibilityIds" | "competencies"> & { reason: string }

/** Resolver zod mínimo (sem biblioteca extra): mesmo schema da Server Action. */
const mainSchema = memberFieldsSchema.omit({ responsibilityIds: true, competencies: true })
const resolver: Resolver<MainFields> = async (values) => {
  const parsed = mainSchema.safeParse(values)
  if (parsed.success) return { values: { ...values, ...parsed.data }, errors: {} }
  const errors: Record<string, { type: string; message: string }> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "")
    if (key && !errors[key]) errors[key] = { type: "zod", message: issue.message }
  }
  return { values: {}, errors }
}

export function MemberDialog({
  open,
  onOpenChange,
  catalogs,
  member,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalogs: MemberFormCatalogs
  /** Sem `member`, o dialog cadastra; com ele, edita. */
  member?: MemberForEdit
}) {
  const editing = Boolean(member)
  const defaults: MainFields = React.useMemo(
    () => ({
      fullName: member?.fullName ?? "",
      preferredName: member?.preferredName ?? "",
      position: member?.position ?? "",
      seniorityId: member?.seniorityId ?? catalogs.seniorities.find((s) => s.key === "JUNIOR")?.id ?? "",
      joinedAt: member ? formatDate(member.joinedAt, "business") : "",
      status: member && member.status !== "INACTIVE" ? member.status : "ACTIVE",
      email: member?.email ?? "",
      reason: "",
    }),
    [member, catalogs.seniorities],
  )

  const form = useForm<MainFields>({ resolver, defaultValues: defaults })
  const [responsibilityIds, setResponsibilityIds] = React.useState<string[]>(member?.responsibilityIds ?? [])
  const [levels, setLevels] = React.useState<Record<string, string>>(
    Object.fromEntries((member?.competencies ?? []).map((c) => [c.competencyId, String(c.level)])),
  )
  const [showDetails, setShowDetails] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const toast = useToast()

  // Reabrir o dialog sempre começa do cadastro atual.
  React.useEffect(() => {
    if (!open) return
    form.reset(defaults)
    setResponsibilityIds(member?.responsibilityIds ?? [])
    setLevels(Object.fromEntries((member?.competencies ?? []).map((c) => [c.competencyId, String(c.level)])))
    setShowDetails(false)
    setFormError(null)
  }, [open, defaults, form, member])

  const watched = form.watch(["seniorityId", "position", "status"])
  const candidates: (string | null)[] = [
    watched[0] !== defaults.seniorityId ? L.fieldSeniority : null,
    watched[1].trim() !== defaults.position ? L.fieldPosition : null,
    watched[2] !== defaults.status ? L.fieldStatus : null,
  ]
  const changedFields = editing ? candidates.filter((x): x is string => x !== null) : []
  const careerChange = changedFields.length > 0

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    if (careerChange && values.reason.trim().length < 3) {
      form.setError("reason", { type: "required", message: labels.validation.reasonRequired })
      return
    }
    const payload = {
      ...values,
      responsibilityIds,
      competencies: Object.entries(levels)
        .filter(([, level]) => level !== "" && level !== NOT_ASSESSED)
        .map(([competencyId, level]) => ({ competencyId, level: Number(level) })),
    }
    startTransition(async () => {
      const result = member ? await updateMember({ ...payload, id: member.id }) : await createMember(payload)
      if (result.ok) {
        toast.show(labels.toast.memberSaved)
        onOpenChange(false)
        return
      }
      setFormError(result.error)
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        if (field in defaults) form.setError(field as keyof MainFields, { type: "server", message })
      }
    })
  })

  const err = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? L.editTitle : L.createTitle}</DialogTitle>
          <DialogDescription>{editing ? L.editDescription : L.createDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FieldGroup label={L.fullName} error={err.fullName?.message} required>
            <Input autoComplete="off" {...form.register("fullName")} />
          </FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label={L.preferredName} help={L.preferredNameHelp} error={err.preferredName?.message} required>
              <Input autoComplete="off" {...form.register("preferredName")} />
            </FieldGroup>
            <FieldGroup label={L.position} error={err.position?.message} required>
              <Input autoComplete="off" {...form.register("position")} />
            </FieldGroup>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label={L.seniority} error={err.seniorityId?.message} required>
              {(control) => (
                <Select value={form.watch("seniorityId")} onValueChange={(v) => form.setValue("seniorityId", v, { shouldValidate: true })}>
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogs.seniorities.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            <FieldGroup label={L.joinedAt} error={err.joinedAt?.message} required>
              <Input
                inputMode="numeric"
                placeholder={L.joinedAtPlaceholder}
                autoComplete="off"
                {...form.register("joinedAt", { onChange: (e) => form.setValue("joinedAt", maskDateInput(e.target.value)) })}
              />
            </FieldGroup>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label={L.status} error={err.status?.message} required>
              {(control) => (
                <Select
                  value={form.watch("status")}
                  onValueChange={(v) => form.setValue("status", v as MainFields["status"], { shouldValidate: true })}
                >
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {enumLabel("memberStatus", s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            <FieldGroup label={L.email} error={err.email?.message} optional>
              <Input type="email" autoComplete="off" {...form.register("email")} />
            </FieldGroup>
          </div>

          {careerChange ? (
            <div className="flex flex-col gap-2 rounded-lg border border-attention/30 bg-attention-wash p-3">
              <p className="text-xs text-attention">{fill(L.careerChange, { fields: changedFields.join(", ") })}</p>
              <FieldGroup label={L.reason} help={L.reasonHelp} error={err.reason?.message} required>
                <Textarea rows={2} {...form.register("reason")} />
              </FieldGroup>
            </div>
          ) : null}

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              aria-expanded={showDetails}
              onClick={() => setShowDetails((v) => !v)}
            >
              <ChevronDownIcon className={cn("transition-transform", showDetails && "rotate-180")} />
              {showDetails ? L.lessDetails : L.moreDetails}
            </Button>
          </div>

          {showDetails ? (
            <div className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-ink">{L.responsibilities}</legend>
                <p className="text-xs text-ink-secondary">{L.responsibilitiesHelp}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {catalogs.responsibilities.map((r) => {
                    const id = `resp-${r.id}`
                    return (
                      <div key={r.id} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={responsibilityIds.includes(r.id)}
                          onCheckedChange={(checked) =>
                            setResponsibilityIds((current) =>
                              checked === true ? [...current, r.id] : current.filter((x) => x !== r.id),
                            )
                          }
                        />
                        <Label htmlFor={id} className="font-normal">
                          {r.name}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-ink">{L.competencies}</legend>
                <p className="text-xs text-ink-secondary">{L.competenciesHelp}</p>
                <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
                  {catalogs.competencies.map((c) => {
                    const id = `comp-${c.id}`
                    return (
                      <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <Label htmlFor={id} className="font-normal">
                          {c.name}
                        </Label>
                        <Select
                          value={levels[c.id] ?? NOT_ASSESSED}
                          onValueChange={(value) => setLevels((current) => ({ ...current, [c.id]: value }))}
                        >
                          <SelectTrigger id={id} size="sm" className="w-20 min-w-20 font-mono">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NOT_ASSESSED}>{L.notAssessed}</SelectItem>
                            {LEVELS.map((level) => (
                              <SelectItem key={level} value={level} className="font-mono">
                                {level}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })}
                </div>
              </fieldset>
            </div>
          ) : null}

          {formError ? (
            <p role="alert" className="text-xs text-overdue">
              {formError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? L.save : L.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
