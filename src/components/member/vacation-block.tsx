"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"

import { cancelVacation, createVacation } from "@/actions/vacations"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { MetaLabel } from "@/components/ui/meta-label"
import { Section } from "@/components/ui/section"
import { StatusPill } from "@/components/ui/status-pill"
import { useToast } from "@/components/ui/toast"
import { formatDate, maskDateInput } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"

const V = labels.vacations

export interface VacationItem {
  id: string
  startDate: Date
  endDate: Date
  note: string | null
  state: "current" | "upcoming" | "past"
}

const day = (d: Date) => formatDate(d, "business")

/**
 * Férias no perfil (C4): em curso e agendadas em cima, as últimas que terminaram
 * embaixo. Registrar pode ser com antecedência; cancelar pede confirmação no app.
 * "De férias" é derivado da data — no dia seguinte ao fim a pessoa volta sozinha.
 */
export function VacationBlock({
  member,
  vacations,
  canWrite,
}: {
  member: { id: string; preferredName: string }
  vacations: VacationItem[]
  canWrite: boolean
}) {
  const [registering, setRegistering] = React.useState(false)
  const [cancelling, setCancelling] = React.useState<VacationItem | null>(null)
  const ahead = vacations.filter((v) => v.state !== "past")
  const past = vacations.filter((v) => v.state === "past")

  if (!canWrite && vacations.length === 0) return null

  return (
    <Section
      title={V.title}
      action={
        canWrite ? (
          <Button size="sm" variant="ghost" onClick={() => setRegistering(true)}>
            <PlusIcon />
            {V.register}
          </Button>
        ) : null
      }
    >
      {ahead.length === 0 ? (
        <p className="text-sm text-ink-secondary">{V.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ahead.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusPill severity={v.state === "current" ? "attention" : "neutral"} label={v.state === "current" ? V.current : V.next} />
              <span className="font-mono text-sm text-ink">
                {fill(V.statePast, { start: day(v.startDate), end: day(v.endDate) })}
              </span>
              {canWrite ? (
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setCancelling(v)}>
                  {V.cancel}
                </Button>
              ) : null}
              {v.note ? <p className="w-full text-xs text-ink-secondary">{v.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 ? (
        <div className="flex flex-col gap-1">
          <MetaLabel>{V.pastTitle}</MetaLabel>
          <ul className="flex flex-col gap-0.5">
            {past.map((v) => (
              <li key={v.id} className="font-mono text-xs text-ink-secondary">
                {fill(V.statePast, { start: day(v.startDate), end: day(v.endDate) })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {canWrite ? <p className="text-xs text-ink-secondary">{V.direction}</p> : null}

      <RegisterVacationDialog member={member} open={registering} onOpenChange={setRegistering} />
      <CancelVacationDialog vacation={cancelling} onOpenChange={(open) => !open && setCancelling(null)} />
    </Section>
  )
}

function RegisterVacationDialog({
  member,
  open,
  onOpenChange,
}: {
  member: { id: string; preferredName: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const [values, setValues] = React.useState({ startDate: "", endDate: "", note: "" })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (open) {
      setValues({ startDate: "", endDate: "", note: "" })
      setErrors({})
      setError(null)
    }
  }, [open])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createVacation({ memberId: member.id, ...values })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        return setError(result.fieldErrors && Object.keys(result.fieldErrors).length ? null : result.error)
      }
      toast.show(V.saved, { tone: "calm" })
      onOpenChange(false)
    })
  }

  const dateInput = (key: "startDate" | "endDate") => (
    <Input
      value={values[key]}
      onChange={(e) => setValues((v) => ({ ...v, [key]: maskDateInput(e.target.value) }))}
      placeholder="DD/MM/AAAA"
      inputMode="numeric"
      autoComplete="off"
      className="font-mono"
    />
  )

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fill(V.dialogTitle, { name: member.preferredName })}</DialogTitle>
          <DialogDescription>{V.dialogDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label={V.start} required error={errors.startDate}>
              {dateInput("startDate")}
            </FieldGroup>
            <FieldGroup label={V.end} required error={errors.endDate}>
              {dateInput("endDate")}
            </FieldGroup>
          </div>
          <FieldGroup label={V.note} optional error={errors.note}>
            <Input
              value={values.note}
              maxLength={300}
              placeholder={V.notePlaceholder}
              onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
            />
          </FieldGroup>
          {error ? (
            <p role="alert" className="text-sm text-overdue">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {V.register}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Cancelar férias: confirmação no app, botão de perigo que nunca é o padrão. */
function CancelVacationDialog({ vacation, onOpenChange }: { vacation: VacationItem | null; onOpenChange: (open: boolean) => void }) {
  const toast = useToast()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const keepRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (vacation) setError(null)
  }, [vacation])

  return (
    <Dialog open={vacation !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          keepRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{V.cancelTitle}</DialogTitle>
          <DialogDescription>{V.cancelDescription}</DialogDescription>
        </DialogHeader>
        {vacation ? (
          <p className="font-mono text-sm text-ink">{fill(V.statePast, { start: day(vacation.startDate), end: day(vacation.endDate) })}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-overdue">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button ref={keepRef} type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {V.keep}
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={pending}
            onClick={() =>
              vacation &&
              startTransition(async () => {
                const result = await cancelVacation({ id: vacation.id })
                if (!result.ok) return setError(result.error)
                toast.show(V.cancelled)
                onOpenChange(false)
              })
            }
          >
            {V.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
