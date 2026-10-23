"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { discardConductedDaily, ensureMemberCentral, openConductedDaily, saveConductedDaily } from "@/actions/member-portal"
import { Button } from "@/components/ui/button"
import { CentralCombobox, type CentralOption } from "@/components/ui/CentralCombobox"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Section } from "@/components/ui/section"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDate, formatDayMonth, onBusinessDay, todayBusinessDate } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import type { ConductDaily } from "@/server/member-daily"

const C = labels.conductDaily

type Outcome = "DONE" | "PARTIAL" | "NOT_DONE"
const OUTCOMES: Outcome[] = ["DONE", "PARTIAL", "NOT_DONE"]
const SELECTED: Record<Outcome, string> = {
  DONE: "border-calm bg-calm-wash text-calm",
  PARTIAL: "border-attention bg-attention-wash text-attention",
  NOT_DONE: "border-overdue bg-overdue-wash text-overdue",
}
const NO_REASON = "__none__"
const listClass = "flex flex-col divide-y divide-line rounded-lg border border-line bg-surface"
// C20: prazo sempre em dia útil — no fim de semana ou feriado, o padrão é o próximo dia útil.
const todayText = () => formatDate(onBusinessDay(todayBusinessDate()), "business")

type Mine = Extract<ConductDaily, { state: "mine" }>
type Review = {
  outcome: Outcome | ""
  blockerText: string
  blockerReasonId: string
  newDueDate: string
  /** C20: próximo passo depois de Feito. */
  nextOpen: boolean
  nextTitle: string
  nextNote: string
  nextDueDate: string
  nextCentralId: string
}
type Row = { key: number; memberId: string; centralId: string; title: string; why: string; dueDate: string }

/** "Abrir a daily" (C19): cria a daily aberta de hoje em nome do scrum master. */
export function OpenConductButton() {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="min-h-11"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await openConductedDaily()
            if (!result.ok) return setError(result.error)
            router.refresh()
          })
        }
      >
        {C.open}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-overdue">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A daily conduzida pelo scrum master (C19, D46), mobile-first (D45): desfechos com o
 * relato de cada pessoa já preenchido, quem faltou e os combinados de hoje. Salva tudo de
 * uma vez, pelo núcleo da daily. Notas, substituições e observações ficam com o gestor.
 */
export function ConductDailyForm({ data }: { data: Mine }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [reviews, setReviews] = React.useState<Record<string, Review>>(() =>
    Object.fromEntries(
      data.reviews.map((r) => [
        r.id,
        {
          outcome: r.report?.outcome ?? "",
          blockerText: r.report?.blockerText ?? "",
          blockerReasonId: r.report?.blockerReasonId ?? "",
          newDueDate: r.report?.suggestedDueDate ? formatDate(r.report.suggestedDueDate, "business") : todayText(),
          nextOpen: false,
          nextTitle: "",
          nextNote: "",
          nextDueDate: todayText(),
          nextCentralId: r.centralId ?? "",
        },
      ]),
    ),
  )
  const [absent, setAbsent] = React.useState<Set<string>>(new Set())
  const nextKey = React.useRef(1)
  const [rows, setRows] = React.useState<Row[]>([])
  const [centrals, setCentrals] = React.useState<CentralOption[]>(data.centrals ?? [])
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [discarding, setDiscarding] = React.useState(false)

  const patch = (id: string, value: Partial<Review>) => setReviews((all) => ({ ...all, [id]: { ...all[id]!, ...value } }))
  const patchRow = (key: number, value: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...value } : r)))
  const addRow = () => setRows((all) => [...all, { key: nextKey.current++, memberId: "", centralId: "", title: "", why: "", dueDate: todayText() }])

  // Revisões agrupadas por pessoa, na ordem que vieram (alfabética).
  const groups = React.useMemo(() => {
    const out: { name: string; items: Mine["reviews"] }[] = []
    for (const r of data.reviews) {
      const last = out[out.length - 1]
      if (last && last.name === r.member.name) last.items.push(r)
      else out.push({ name: r.member.name, items: [r] })
    }
    return out
  }, [data.reviews])

  function save() {
    const reviewed = data.reviews.filter((r) => reviews[r.id]?.outcome)
    const filled = rows.filter((r) => r.title.trim() || r.memberId)
    setError(null)
    setErrors({})
    startTransition(async () => {
      const result = await saveConductedDaily({
        draftId: data.draftId,
        reviews: reviewed.map((r) => {
          const { nextOpen, nextTitle, nextNote, nextDueDate, nextCentralId, ...review } = reviews[r.id]!
          const next = nextOpen && review.outcome === "DONE"
          return {
            agreementId: r.id,
            ...review,
            nextTitle: next ? nextTitle : "",
            nextNote: next ? nextNote : "",
            nextDueDate: next ? nextDueDate : "",
            nextCentralId: next ? nextCentralId : "",
          }
        }),
        absent: [...absent],
        newAgreements: filled.map(({ memberId, centralId, title, why, dueDate }) => ({ memberId, centralId, title, why, dueDate })),
      })
      if (result.ok) {
        router.push("/me")
        router.refresh()
        return
      }
      // Erros vêm por posição no pedido ("reviews.2.blockerText"): volta para o id da linha.
      const mapped: Record<string, string> = {}
      for (const [key, message] of Object.entries(result.fieldErrors ?? {})) {
        const [list, index, field] = key.split(".")
        const i = Number(index)
        if (list === "reviews" && reviewed[i]) mapped[`${reviewed[i].id}.${field}`] = message
        if (list === "newAgreements" && filled[i]) mapped[`row${filled[i].key}.${field}`] = message
      }
      setErrors(mapped)
      setError(Object.keys(mapped).length ? C.invalid : result.error)
    })
  }

  function discard() {
    startTransition(async () => {
      const result = await discardConductedDaily({ id: data.draftId })
      if (!result.ok) return setError(result.error)
      setDiscarding(false)
      router.push("/me")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section title={C.reviewTitle} count={data.reviews.length}>
        {data.reviews.length === 0 ? (
          <p className="text-sm text-ink-secondary">{C.reviewEmpty}</p>
        ) : (
          <>
            <p className="-mt-2 text-xs text-ink-secondary">{C.reviewHint}</p>
            {groups.map((g) => (
              <div key={g.name} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-ink">{g.name}</h3>
                <ul className={listClass}>
                  {g.items.map((a) => {
                    const r = reviews[a.id]!
                    const err = (field: string) => errors[`${a.id}.${field}`]
                    return (
                      <li key={a.id} className="flex flex-col gap-2 px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <p className="text-sm text-ink">{a.title}</p>
                          {a.why ? <p className="text-xs text-ink-secondary">{fill(C.why, { why: a.why })}</p> : null}
                          <p className="flex flex-wrap gap-x-2 text-xs text-ink-secondary">
                            {a.central ? <span>{a.central}</span> : null}
                            <span className="font-mono">{formatDayMonth(a.dueDate, "business")}</span>
                            <span>{a.report ? fill(C.reported, { outcome: enumLabel("checkinOutcome", a.report.outcome) }) : C.notReported}</span>
                          </p>
                        </div>
                        <div role="group" aria-label={a.title} className="grid grid-cols-3 gap-2">
                          {OUTCOMES.map((o) => (
                            <button
                              key={o}
                              type="button"
                              aria-pressed={r.outcome === o}
                              onClick={() => patch(a.id, { outcome: r.outcome === o ? "" : o })}
                              className={cn(
                                "inline-flex min-h-11 items-center justify-center rounded-sm border px-2 text-sm font-medium transition-colors",
                                r.outcome === o ? SELECTED[o] : "border-line bg-surface text-ink hover:bg-surface-sunken",
                              )}
                            >
                              {enumLabel("checkinOutcome", o)}
                            </button>
                          ))}
                        </div>
                        {r.outcome === "DONE" && !r.nextOpen ? (
                          <button
                            type="button"
                            className="min-h-11 self-start text-sm font-medium text-ink underline-offset-2 hover:underline"
                            onClick={() => patch(a.id, { nextOpen: true })}
                          >
                            {C.next.action}
                          </button>
                        ) : null}
                        {r.outcome === "DONE" && r.nextOpen ? (
                          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-sunken/60 p-3">
                            <p className="text-xs text-ink-secondary">{C.next.hint}</p>
                            <Input
                              value={r.nextTitle}
                              maxLength={160}
                              autoComplete="off"
                              autoFocus
                              placeholder={C.next.title}
                              aria-label={C.next.title}
                              aria-invalid={err("nextTitle") ? true : undefined}
                              className="min-h-11"
                              onChange={(e) => patch(a.id, { nextTitle: e.target.value })}
                            />
                            {err("nextTitle") ? <p className="text-xs text-overdue">{err("nextTitle")}</p> : null}
                            <Input
                              value={r.nextNote}
                              maxLength={300}
                              autoComplete="off"
                              placeholder={C.next.note}
                              aria-label={C.next.note}
                              aria-invalid={err("nextNote") ? true : undefined}
                              className="min-h-11"
                              onChange={(e) => patch(a.id, { nextNote: e.target.value })}
                            />
                            {err("nextNote") ? <p className="text-xs text-overdue">{err("nextNote")}</p> : null}
                            {data.centrals ? (
                              <CentralCombobox
                                aria-label={labels.memberPortal.create.centralField}
                                options={centrals}
                                value={r.nextCentralId || null}
                                onValueChange={(id) => patch(a.id, { nextCentralId: id ?? "" })}
                                onCreate={(option) => setCentrals((all) => (all.some((c) => c.id === option.id) ? all : [...all, option]))}
                                createCentral={ensureMemberCentral}
                                inputClassName="min-h-11"
                              />
                            ) : null}
                            <DatePickerField aria-label={C.dueField} value={r.nextDueDate} onChange={(v) => patch(a.id, { nextDueDate: v })} min={data.date} />
                            {err("nextDueDate") ? <p className="text-xs text-overdue">{err("nextDueDate")}</p> : null}
                            <Button type="button" variant="ghost" className="min-h-11 self-start" onClick={() => patch(a.id, { nextOpen: false })}>
                              {C.next.remove}
                            </Button>
                          </div>
                        ) : null}
                        {r.outcome === "PARTIAL" || r.outcome === "NOT_DONE" ? (
                          <div className="flex flex-col gap-2">
                            <Input
                              value={r.blockerText}
                              maxLength={300}
                              autoComplete="off"
                              placeholder={C.blocker}
                              aria-label={C.blocker}
                              aria-invalid={err("blockerText") ? true : undefined}
                              className="min-h-11"
                              onChange={(e) => patch(a.id, { blockerText: e.target.value })}
                            />
                            {err("blockerText") ? <p className="text-xs text-overdue">{err("blockerText")}</p> : null}
                            {data.reasons.length ? (
                              <Select value={r.blockerReasonId || NO_REASON} onValueChange={(v) => patch(a.id, { blockerReasonId: v === NO_REASON ? "" : v })}>
                                <SelectTrigger aria-label={C.reason} className="min-h-11 w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NO_REASON}>{C.reasonNone}</SelectItem>
                                  {data.reasons.map((reason) => (
                                    <SelectItem key={reason.id} value={reason.id}>
                                      {reason.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : null}
                            <DatePickerField aria-label={C.newDue} value={r.newDueDate} onChange={(v) => patch(a.id, { newDueDate: v })} min={data.date} />
                            {err("newDueDate") ? <p className="text-xs text-overdue">{err("newDueDate")}</p> : null}
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </>
        )}
      </Section>

      <Section title={C.presenceTitle} count={data.members.length - absent.size}>
        <p className="-mt-2 text-xs text-ink-secondary">{C.presenceHint}</p>
        <ul className="flex flex-wrap gap-2">
          {data.members.map((m) => {
            const out = absent.has(m.id)
            return (
              <li key={m.id}>
                <button
                  type="button"
                  aria-pressed={!out}
                  onClick={() =>
                    setAbsent((all) => {
                      const next = new Set(all)
                      if (out) next.delete(m.id)
                      else next.add(m.id)
                      return next
                    })
                  }
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-sm border px-3 text-sm",
                    out ? "border-line bg-surface-sunken text-ink-secondary line-through" : "border-line bg-surface text-ink",
                  )}
                >
                  {m.name}
                  <span className="text-xs text-ink-secondary no-underline">{out ? C.absent : C.present}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title={C.newTitle} count={rows.length}>
        {rows.length ? (
          <ul className={listClass}>
            {rows.map((row) => {
              const err = (field: string) => errors[`row${row.key}.${field}`]
              return (
                <li key={row.key} className="flex flex-col gap-2 px-4 py-3">
                  <Select value={row.memberId} onValueChange={(v) => patchRow(row.key, { memberId: v })}>
                    <SelectTrigger aria-label={C.person} aria-invalid={err("memberId") ? true : undefined} className="min-h-11 w-full">
                      <SelectValue placeholder={C.personPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {data.members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {err("memberId") ? <p className="text-xs text-overdue">{err("memberId")}</p> : null}
                  <Input
                    value={row.title}
                    maxLength={160}
                    autoComplete="off"
                    placeholder={C.titleField}
                    aria-label={C.titleField}
                    aria-invalid={err("title") ? true : undefined}
                    className="min-h-11"
                    onChange={(e) => patchRow(row.key, { title: e.target.value })}
                  />
                  {err("title") ? <p className="text-xs text-overdue">{err("title")}</p> : null}
                  {data.centrals ? (
                    <CentralCombobox
                      aria-label={labels.memberPortal.create.centralField}
                      options={centrals}
                      value={row.centralId || null}
                      onValueChange={(id) => patchRow(row.key, { centralId: id ?? "" })}
                      onCreate={(option) => setCentrals((all) => (all.some((c) => c.id === option.id) ? all : [...all, option]))}
                      createCentral={ensureMemberCentral}
                      inputClassName="min-h-11"
                    />
                  ) : null}
                  {data.whyEnabled ? (
                    <Input
                      value={row.why}
                      maxLength={300}
                      autoComplete="off"
                      placeholder={C.whyField}
                      aria-label={C.whyField}
                      className="min-h-11"
                      onChange={(e) => patchRow(row.key, { why: e.target.value })}
                    />
                  ) : null}
                  <div className="flex items-center gap-2">
                    <DatePickerField aria-label={C.dueField} value={row.dueDate} onChange={(v) => patchRow(row.key, { dueDate: v })} min={data.date} className="flex-1" />
                    <Button type="button" variant="ghost" className="min-h-11" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}>
                      {C.remove}
                    </Button>
                  </div>
                  {err("dueDate") ? <p className="text-xs text-overdue">{err("dueDate")}</p> : null}
                </li>
              )
            })}
          </ul>
        ) : null}
        <Button type="button" variant="secondary" className="min-h-11 self-start" onClick={addRow}>
          {C.addRow}
        </Button>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-canvas px-4 py-3">
        <p className="text-xs text-ink-secondary">{C.managerLater}</p>
        {error ? (
          <p role="alert" className="text-sm text-overdue">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" className="min-h-11" disabled={pending} onClick={() => setDiscarding(true)}>
            {C.discard}
          </Button>
          <Button type="button" className="min-h-11" loading={pending} onClick={save}>
            {C.save}
          </Button>
        </div>
      </div>

      <Dialog open={discarding} onOpenChange={(open) => !pending && setDiscarding(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{C.discardTitle}</DialogTitle>
            <DialogDescription>{C.discardDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDiscarding(false)}>
              {C.discardKeep}
            </Button>
            <Button type="button" variant="destructive" loading={pending} onClick={discard}>
              {C.discardConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
