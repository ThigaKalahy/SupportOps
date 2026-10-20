"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { createProposal, deleteProposal, deleteSelfReport, pollPortalState, upsertSelfReport } from "@/actions/member-portal"
import { DueCell } from "@/components/agreements/agreements-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Section } from "@/components/ui/section"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDate, formatDayMonth, maskDateInput } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import type { MyOpenAgreement, MyPendingProposal, MyPortalState } from "@/server/queries/member-portal"

const L = labels.memberPortal
const R = L.report
const NO_REASON = "none"
/** Consulta do estado com a aba visível (D43: o aviso é conveniência; a recusa é do servidor). */
const POLL_MS = 25_000

type Outcome = "DONE" | "PARTIAL" | "NOT_DONE"
type Report = NonNullable<MyOpenAgreement["pendingReport"]>

const OUTCOMES: Outcome[] = ["DONE", "PARTIAL", "NOT_DONE"]
const SELECTED: Record<Outcome, string> = {
  DONE: "border-calm bg-calm-wash text-calm",
  PARTIAL: "border-attention bg-attention-wash text-attention",
  NOT_DONE: "border-overdue bg-overdue-wash text-overdue",
}

const listClass = "flex flex-col divide-y divide-line rounded-lg border border-line bg-surface"

/**
 * Parte viva do portal (P26): Zona 1 editável, "Propor combinado", o aviso de daily em
 * andamento e a faixa "Atualizar". Salvamento imediato por item — ela preenche no celular
 * entre uma coisa e outra. Travado, os controles de escrita ficam AUSENTES (não
 * desabilitados) e o conteúdo continua legível. Nunca recarrega sozinho.
 */
export function PortalLive({
  initialState,
  agreements,
  reasons,
  proposals,
  header,
  children,
}: {
  initialState: MyPortalState
  agreements: MyOpenAgreement[]
  reasons: { id: string; label: string }[]
  proposals: MyPendingProposal[]
  header: React.ReactNode
  /** Zonas somente leitura (última daily, histórico). */
  children: React.ReactNode
}) {
  const router = useRouter()
  const [locked, setLocked] = React.useState(initialState.locked)
  const [registered, setRegistered] = React.useState(false)
  const lastClosed = React.useRef(initialState.lastClosedDailyId)

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let cancelled = false
    async function poll() {
      try {
        const state = await pollPortalState()
        if (cancelled || !state) return
        setLocked(state.locked)
        if (state.lastClosedDailyId && state.lastClosedDailyId !== lastClosed.current) setRegistered(true)
      } catch {
        // rede ou deploy no meio: tenta de novo no próximo ciclo
      }
    }
    function start() {
      if (timer || document.visibilityState !== "visible") return
      void poll()
      timer = setInterval(poll, POLL_MS)
    }
    function stop() {
      if (timer) clearInterval(timer)
      timer = null
    }
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop())
    start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return (
    <>
      {registered || locked ? (
        <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 bg-canvas px-4 pt-1 pb-2">
          {registered ? (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-3">
              <p className="text-sm text-ink">{L.refreshed.banner}</p>
              <Button type="button" className="min-h-11" onClick={() => router.refresh()}>
                {L.refreshed.action}
              </Button>
            </div>
          ) : null}
          {locked ? (
            <p role="status" className="rounded-lg border border-attention bg-attention-wash px-4 py-3 text-sm text-attention">
              {L.locked.banner}
            </p>
          ) : null}
        </div>
      ) : null}
      {header}
      <Section title={L.open.title} count={agreements.length}>
        {agreements.length === 0 ? (
          <p className="text-sm text-ink-secondary">{L.open.empty}</p>
        ) : (
          <ul className={listClass}>
            {agreements.map((a) => (
              <ReportRow key={a.id} agreement={a} reasons={reasons} locked={locked} onLocked={() => setLocked(true)} />
            ))}
          </ul>
        )}
      </Section>
      <ProposeZone proposals={proposals} locked={locked} onLocked={() => setLocked(true)} />
      {children}
    </>
  )
}

/** Um combinado dela: o desfecho em três botões grandes, salvo na hora. */
function ReportRow({
  agreement,
  reasons,
  locked,
  onLocked,
}: {
  agreement: MyOpenAgreement
  reasons: { id: string; label: string }[]
  locked: boolean
  onLocked: () => void
}) {
  const [report, setReport] = React.useState<Report | null>(agreement.pendingReport)
  const [editing, setEditing] = React.useState<Outcome | null>(null)
  const [choosing, setChoosing] = React.useState(!agreement.pendingReport)
  const [blockerText, setBlockerText] = React.useState(agreement.pendingReport?.blockerText ?? "")
  const [reasonId, setReasonId] = React.useState(agreement.pendingReport?.reasonId ?? "")
  const [suggested, setSuggested] = React.useState(
    agreement.pendingReport?.suggestedDueDate ? formatDate(agreement.pendingReport.suggestedDueDate, "business") : "",
  )
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const blockerRef = React.useRef<HTMLInputElement>(null)

  function fail(result: { error: string; fieldErrors?: Record<string, string> }) {
    if (result.error === L.locked.refused) onLocked()
    setError(result.fieldErrors?.blockerText ?? result.fieldErrors?.suggestedDueDate ?? result.error)
  }

  function save(outcome: Outcome) {
    setError(null)
    startTransition(async () => {
      const input = outcome === "DONE" ? { agreementId: agreement.id, outcome } : { agreementId: agreement.id, outcome, blockerText, blockerReasonId: reasonId, suggestedDueDate: suggested }
      const result = await upsertSelfReport(input)
      if (!result.ok) return fail(result)
      const reason = reasons.find((r) => r.id === reasonId)?.label ?? null
      const [d, m, y] = suggested.split("/").map(Number)
      const suggestedDate = suggested.length === 10 ? new Date(Date.UTC(y!, m! - 1, d!)) : null
      setReport(
        outcome === "DONE"
          ? { outcome, blockerText: null, reasonId: null, reason: null, suggestedDueDate: null }
          : { outcome, blockerText, reasonId: reasonId || null, reason, suggestedDueDate: suggestedDate },
      )
      setEditing(null)
      setChoosing(false)
    })
  }

  function choose(outcome: Outcome) {
    if (outcome === "DONE") return save(outcome)
    setEditing(outcome)
    requestAnimationFrame(() => blockerRef.current?.focus())
  }

  function undo() {
    setError(null)
    startTransition(async () => {
      const result = await deleteSelfReport(agreement.id)
      if (!result.ok) return fail(result)
      setReport(null)
      setChoosing(true)
    })
  }

  const showControls = !locked
  return (
    <li className={cn("flex flex-col gap-2 px-4 py-3", editing && "bg-surface-sunken/60")}>
      <p className="text-sm font-medium text-ink">{agreement.title}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <DueCell row={{ dueDate: agreement.dueDate, open: true, deadline: agreement.deadline }} />
        {agreement.reschedules >= 3 ? <span className="text-xs text-overdue">{fill(L.open.rescheduled, { count: agreement.reschedules })}</span> : null}
      </div>

      {report && !choosing && !editing ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary">
          <span className="font-mono text-2xs uppercase tracking-wide text-calm">{R.reported}</span>
          <span>
            {enumLabel("checkinOutcome", report.outcome)}
            {report.blockerText ? ` — ${report.blockerText}` : null}
          </span>
          {showControls ? (
            <>
              <button type="button" className="min-h-11 underline-offset-2 hover:text-ink hover:underline" onClick={() => setChoosing(true)}>
                {R.change}
              </button>
              <button type="button" className="min-h-11 underline-offset-2 hover:text-ink hover:underline" onClick={undo} disabled={pending}>
                {R.undo}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {showControls && (choosing || editing) ? (
        <div role="group" aria-label={`${R.outcomes}: ${agreement.title}`} className="grid grid-cols-3 gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={editing === o}
              disabled={pending}
              onClick={() => choose(o)}
              className={cn(
                "inline-flex min-h-11 items-center justify-center rounded-sm border px-2 text-sm font-medium transition-colors",
                editing === o ? SELECTED[o] : "border-line bg-surface text-ink hover:bg-surface-sunken",
              )}
            >
              {enumLabel("checkinOutcome", o)}
            </button>
          ))}
        </div>
      ) : null}

      {showControls && editing ? (
        <div className="flex flex-col gap-2">
          <label className="sr-only" htmlFor={`blocker-${agreement.id}`}>
            {R.blocker}
          </label>
          <Input
            ref={blockerRef}
            id={`blocker-${agreement.id}`}
            value={blockerText}
            maxLength={300}
            autoComplete="off"
            placeholder={R.blockerPlaceholder}
            className="min-h-11"
            aria-required
            onChange={(e) => setBlockerText(e.target.value)}
          />
          {reasons.length ? (
            <Select value={reasonId || NO_REASON} onValueChange={(v) => setReasonId(v === NO_REASON ? "" : v)}>
              <SelectTrigger aria-label={R.reason} className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_REASON}>{R.reasonNone}</SelectItem>
                {reasons.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Input
            aria-label={R.suggestedDue}
            value={suggested}
            inputMode="numeric"
            autoComplete="off"
            placeholder={R.suggestedDue}
            className="min-h-11 font-mono"
            onChange={(e) => setSuggested(maskDateInput(e.target.value))}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="min-h-11" disabled={pending} onClick={() => (setEditing(null), setChoosing(!report))}>
              {R.cancel}
            </Button>
            <Button type="button" className="min-h-11" loading={pending} onClick={() => save(editing)}>
              {R.save}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs text-overdue">{error}</p> : null}
    </li>
  )
}

/** Propor combinado: título e prazo sugerido. Sempre dela; a prioridade é do gestor. */
function ProposeZone({ proposals, locked, onLocked }: { proposals: MyPendingProposal[]; locked: boolean; onLocked: () => void }) {
  const P = L.propose
  const [items, setItems] = React.useState(proposals)
  const [title, setTitle] = React.useState("")
  const [due, setDue] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => setItems(proposals), [proposals])

  function add(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createProposal({ title, suggestedDueDate: due })
      if (!result.ok) {
        if (result.error === L.locked.refused) onLocked()
        return setError(result.fieldErrors?.title ?? result.fieldErrors?.suggestedDueDate ?? result.error)
      }
      const date = due ? (() => {
        const [d, m, y] = due.split("/").map(Number)
        return new Date(Date.UTC(y!, m! - 1, d!))
      })() : null
      setItems((list) => [...list, { id: result.id ?? `local-${list.length}`, title: title.trim(), suggestedDueDate: date }])
      setTitle("")
      setDue("")
    })
  }

  function remove(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await deleteProposal(id)
      if (!result.ok) {
        if (result.error === L.locked.refused) onLocked()
        return setError(result.error)
      }
      setItems((list) => list.filter((p) => p.id !== id))
    })
  }

  return (
    <Section title={P.title} count={items.length || undefined}>
      {locked ? null : (
        <form onSubmit={add} className="flex flex-col gap-2">
          <p className="-mt-2 text-xs text-ink-secondary">{P.hint}</p>
          <Input value={title} maxLength={160} autoComplete="off" placeholder={P.titleField} aria-label={P.titleField} className="min-h-11" onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-2">
            <Input
              value={due}
              inputMode="numeric"
              autoComplete="off"
              placeholder={P.dueField}
              aria-label={P.dueField}
              className="min-h-11 flex-1 font-mono"
              onChange={(e) => setDue(maskDateInput(e.target.value))}
            />
            <Button type="submit" className="min-h-11" loading={pending} disabled={title.trim().length < 3}>
              {P.add}
            </Button>
          </div>
        </form>
      )}
      {error ? <p role="alert" className="text-xs text-overdue">{error}</p> : null}
      {items.length ? (
        <ul className={listClass}>
          {items.map((p) => (
            <li key={p.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{p.title}</p>
                <p className="text-xs text-ink-secondary">
                  {P.waiting}
                  {p.suggestedDueDate ? ` · ${formatDayMonth(p.suggestedDueDate, "business")}` : null}
                </p>
              </div>
              {locked ? null : (
                <Button type="button" variant="ghost" className="min-h-11" disabled={pending} onClick={() => remove(p.id)}>
                  {P.remove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  )
}
