"use client"

import * as React from "react"
import { EllipsisIcon } from "lucide-react"

import { reviewPlan, setActionStatus, setPlanStatus } from "@/actions/development"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DateStamp } from "@/components/ui/date-stamp"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldGroup } from "@/components/ui/field-group"
import { MetaLabel } from "@/components/ui/meta-label"
import { StatusPill } from "@/components/ui/status-pill"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { formatDate } from "@/lib/dates"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { reviewPlanSchema } from "@/lib/validators/development"
import type { PlanView } from "@/server/queries/development"

import { NewPlanDialog } from "./new-plan-dialog"
import { PlanActionDialog } from "./plan-action-dialog"

const P = labels.development.plans
type PlanStatus = PlanView["status"]

/** Idade do acompanhamento: "acompanhado em DD/MM" ou "sem acompanhamento há N dias", com a escala graduada. */
export function PlanReviewAge({ plan }: { plan: Pick<PlanView, "status" | "staleness" | "lastReviewedAt"> }) {
  const s = plan.staleness
  const text = s.neverReviewed ? plural(P.neverReviewed, s.days) : plural(P.lastReviewAgo, s.days)
  if (plan.status !== "ACTIVE") {
    return plan.lastReviewedAt ? (
      <span className="text-xs text-ink-secondary">{fill(P.lastReview, { date: formatDate(plan.lastReviewedAt) })}</span>
    ) : null
  }
  if (s.severity.severity === "neutral") {
    return <span className="text-xs text-ink-secondary">{plan.lastReviewedAt ? fill(P.lastReview, { date: formatDate(plan.lastReviewedAt) }) : text}</span>
  }
  return <StatusPill severity={s.severity.severity} strong={s.severity.strong} label={text} title={s.stale ? P.stale : undefined} />
}

export function PlanStatusCell({ status }: { status: PlanStatus }) {
  if (status === "DONE") return <StatusPill severity="calm" label={enumLabel("planStatus", status)} />
  if (status === "CANCELLED") return <StatusPill severity="neutral" label={enumLabel("planStatus", status)} />
  return <span className="text-xs text-ink-secondary">{enumLabel("planStatus", status)}</span>
}

const NEXT_STATUSES: Record<PlanStatus, PlanStatus[]> = {
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["PAUSED", "DONE", "CANCELLED"],
  PAUSED: ["ACTIVE", "DONE", "CANCELLED"],
  DONE: ["ACTIVE"],
  CANCELLED: ["ACTIVE"],
}

/**
 * Um PDI: competência, situação atual, objetivo, evidência esperada, ações
 * com responsável e prazo, progresso e o último acompanhamento. PDI ativo sem
 * acompanhamento há mais de 45 dias aparece em laranja/vermelho — um PDI sem
 * acompanhamento é um PDI morto.
 */
export interface PlanEditOptions {
  competencies: { id: string; name: string }[]
  /** Pessoas que podem ser mentoras numa ação (o time, menos a própria pessoa). */
  mentors: { id: string; preferredName: string }[]
}

const d = (date: Date | null) => (date ? formatDate(date, "business") : "")

export function PlanBlock({ plan, canWrite, edit }: { plan: PlanView; canWrite: boolean; edit?: PlanEditOptions }) {
  const [reviewing, setReviewing] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const closed = plan.status === "DONE" || plan.status === "CANCELLED"
  const [confirm, setConfirm] = React.useState<PlanStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const stale = plan.status === "ACTIVE" && plan.staleness.stale

  function changeStatus(status: PlanStatus) {
    if (status === "DONE" || status === "CANCELLED") return setConfirm(status)
    run(() => setPlanStatus({ planId: plan.id, status }))
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error ?? labels.validation.generic)
    })
  }

  return (
    <article
      aria-label={plan.objective}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-surface p-4",
        stale ? (plan.staleness.severity.severity === "overdue" ? "border-overdue" : "border-attention-strong") : "border-line",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs tracking-wide text-ink-secondary uppercase">
              {plan.competency?.name ?? P.noCompetency}
            </span>
            <PlanStatusCell status={plan.status} />
          </span>
          <h3 className="text-sm font-semibold text-ink">{plan.objective}</h3>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <PlanReviewAge plan={plan} />
            <span className="text-xs text-ink-secondary">
              {P.startedAt} <DateStamp date={plan.startedAt} kind="business" />
              {plan.dueDate ? (
                <>
                  {" · "}
                  {P.dueDate} <DateStamp date={plan.dueDate} kind="business" />
                </>
              ) : null}
            </span>
          </span>
        </div>
        {canWrite ? (
          <div className="flex shrink-0 items-center gap-1">
            {plan.status === "ACTIVE" || plan.status === "PAUSED" ? (
              <Button size="sm" variant={stale ? "default" : "secondary"} onClick={() => setReviewing(true)}>
                {P.review}
              </Button>
            ) : null}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={P.statusMenu} disabled={pending}>
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {edit ? (
                  <>
                    <DropdownMenuItem onSelect={() => setEditing(true)}>{P.edit}</DropdownMenuItem>
                    {closed ? null : <DropdownMenuItem onSelect={() => setAdding(true)}>{P.addAction}</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                {NEXT_STATUSES[plan.status].map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onSelect={() => changeStatus(status)}
                    className={status === "CANCELLED" ? "text-overdue focus:text-overdue" : undefined}
                  >
                    {P.setStatus[status]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </header>

      <dl className="grid gap-3 md:grid-cols-3">
        <Text label={labels.development.plans.currentSituation} text={plan.currentSituation} />
        <Text label={labels.development.plans.expectedEvidence} text={plan.expectedEvidence} />
        <Text label={labels.development.plans.progressNote} text={plan.progressNote} />
      </dl>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <MetaLabel>{P.actions}</MetaLabel>
          {plan.progress.total > 0 ? (
            <span className="font-mono text-2xs text-ink-secondary">{fill(P.progress, plan.progress)}</span>
          ) : null}
        </div>
        {plan.actions.length === 0 ? (
          <p className="text-sm text-ink-tertiary">{P.noActions}</p>
        ) : (
          <ul className="flex flex-col">
            {plan.actions.map((a) => {
              const done = a.status === "DONE"
              const cancelled = a.status === "CANCELLED"
              return (
                <li key={a.id} className="flex items-start gap-2 border-b border-line py-1.5 last:border-b-0">
                  {canWrite && !cancelled ? (
                    <Checkbox
                      className="mt-0.5"
                      checked={done}
                      disabled={pending}
                      aria-label={fill(done ? P.actionReopen : P.actionDone, { description: a.description })}
                      onCheckedChange={(c) => run(() => setActionStatus({ actionId: a.id, status: c === true ? "DONE" : "OPEN" }))}
                    />
                  ) : null}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn("text-sm", done || cancelled ? "text-ink-secondary line-through" : "text-ink")}>{a.description}</span>
                    <span className="text-xs text-ink-secondary">
                      {a.ownerType === "MENTOR" && a.ownerName ? fill(P.ownerWithName, { name: a.ownerName }) : P.owner[a.ownerType]}
                      {" · "}
                      {a.dueDate ? <DateStamp date={a.dueDate} kind="business" /> : P.noDue}
                      {a.status !== "OPEN" ? ` · ${enumLabel("actionStatus", a.status)}` : ""}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <FormError message={error} />

      <ReviewDialog plan={reviewing ? plan : null} onOpenChange={(open) => !open && setReviewing(false)} />
      {edit ? (
        <>
          <NewPlanDialog
            open={editing}
            onOpenChange={setEditing}
            member={plan.member}
            competencies={edit.competencies}
            mentors={edit.mentors}
            editing={{
              planId: plan.id,
              values: {
                memberId: plan.member.id,
                competencyId: plan.competency?.id ?? "",
                currentSituation: plan.currentSituation,
                objective: plan.objective,
                expectedEvidence: plan.expectedEvidence ?? "",
                startedAt: d(plan.startedAt),
                dueDate: d(plan.dueDate),
                status: "ACTIVE",
                actions: [],
              },
            }}
          />
          <PlanActionDialog plan={adding ? plan : null} mentors={edit.mentors} onOpenChange={(open) => !open && setAdding(false)} />
        </>
      ) : null}
      <StatusConfirmDialog
        plan={plan}
        status={confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        onConfirm={(status) => run(() => setPlanStatus({ planId: plan.id, status }))}
      />
    </article>
  )
}

function Text({ label, text }: { label: string; text: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <MetaLabel asChild>
        <dt>{label}</dt>
      </MetaLabel>
      <dd className={cn("text-sm whitespace-pre-line", text ? "text-ink" : "text-ink-tertiary")}>{text ?? "—"}</dd>
    </div>
  )
}

/** Registrar acompanhamento: o que mudou. Entra na timeline e zera o relógio do PDI. */
function ReviewDialog({ plan, onOpenChange }: { plan: PlanView | null; onOpenChange: (open: boolean) => void }) {
  const R = labels.development.reviewDialog
  const toast = useToast()
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const ref = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (plan) {
      setNote("")
      setError(null)
    }
  }, [plan])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!plan) return
    const parsed = reviewPlanSchema.safeParse({ planId: plan.id, note })
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? labels.validation.generic)
    startTransition(async () => {
      const result = await reviewPlan(parsed.data)
      if (!result.ok) return setError(result.error)
      toast.show(labels.toast.planReviewed)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={plan !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ref.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{R.title}</DialogTitle>
          <DialogDescription>{R.description}</DialogDescription>
        </DialogHeader>
        {plan ? <p className="text-sm font-medium text-ink">{plan.objective}</p> : null}
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e)
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <FieldGroup label={R.note} required error={error ?? undefined}>
            <Textarea ref={ref} rows={3} value={note} placeholder={R.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {R.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Concluir ou cancelar pede confirmação; cancelar é destrutivo (cor de perigo, nunca o padrão). */
function StatusConfirmDialog({
  plan,
  status,
  onOpenChange,
  onConfirm,
}: {
  plan: PlanView
  status: PlanStatus | null
  onOpenChange: (open: boolean) => void
  onConfirm: (status: PlanStatus) => void
}) {
  const S = labels.development.statusDialog
  const keepRef = React.useRef<HTMLButtonElement>(null)
  const action = status ? P.setStatus[status] : ""
  return (
    <Dialog open={status !== null} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          keepRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{fill(S.title, { action })}</DialogTitle>
          <DialogDescription>
            {status ? fill(S.description, { objective: plan.objective, status: enumLabel("planStatus", status).toLowerCase() }) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={keepRef} type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {S.keep}
          </Button>
          <Button
            type="button"
            variant={status === "CANCELLED" ? "destructive" : "default"}
            onClick={() => {
              if (status) onConfirm(status)
              onOpenChange(false)
            }}
          >
            {fill(S.confirm, { action })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
