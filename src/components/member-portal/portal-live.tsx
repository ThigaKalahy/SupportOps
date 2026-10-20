"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  createAgreement,
  createNextStepAgreement,
  deleteSelfReport,
  ensureMemberCentral,
  pollPortalState,
  upsertSelfReport,
} from "@/actions/member-portal"
import { DueCell } from "@/components/agreements/agreements-table"
import { Button } from "@/components/ui/button"
import { CentralCombobox, type CentralOption } from "@/components/ui/CentralCombobox"
import { Input } from "@/components/ui/input"
import { Section } from "@/components/ui/section"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDate, maskDateInput } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import type { MyOpenAgreement, MyPortalState } from "@/server/queries/member-portal"

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
 * Parte viva do portal (P26, C14): Zona 1 editável, "Novo combinado", o aviso de daily em
 * andamento e a faixa "Atualizar". Salvamento imediato por item — ela preenche no celular
 * entre uma coisa e outra. Travado, os controles de escrita ficam AUSENTES (não
 * desabilitados) e o conteúdo continua legível. Nunca recarrega sozinho.
 */
export function PortalLive({
  initialState,
  agreements,
  reasons,
  centrals: initialCentrals = null,
  header,
  children,
}: {
  initialState: MyPortalState
  agreements: MyOpenAgreement[]
  reasons: { id: string; label: string }[]
  /** C16: centrais ativas do time; null com o módulo desligado (o campo não aparece). */
  centrals?: CentralOption[] | null
  header: React.ReactNode
  /** Zonas somente leitura (última daily, histórico). */
  children: React.ReactNode
}) {
  const router = useRouter()
  const [locked, setLocked] = React.useState(initialState.locked)
  const [registered, setRegistered] = React.useState(false)
  const lastClosed = React.useRef(initialState.lastClosedDailyId)
  // Centrais do time + as criadas agora (todos os campos de central enxergam a nova).
  const [centrals, setCentrals] = React.useState<CentralOption[] | null>(initialCentrals)
  const addCentral = React.useCallback(
    (option: CentralOption) => setCentrals((list) => (list && !list.some((c) => c.id === option.id) ? [...list, option] : list)),
    [],
  )
  const centralField = centrals ? { options: centrals, onCreate: addCentral } : null

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
              <ReportRow key={a.id} agreement={a} reasons={reasons} centrals={centralField} locked={locked} onLocked={() => setLocked(true)} />
            ))}
          </ul>
        )}
      </Section>
      <CreateZone locked={locked} centrals={centralField} onLocked={() => setLocked(true)} />
      {children}
    </>
  )
}

/** Um combinado dela: o desfecho em três botões grandes, salvo na hora. */
type CentralField = { options: CentralOption[]; onCreate: (option: CentralOption) => void } | null

/** Campo de cliente do portal: escolhe ou cria a central, sem duplicar nomes (D20). */
function PortalCentral({ field, value, onChange, label }: { field: CentralField; value: string; onChange: (id: string) => void; label: string }) {
  if (!field) return null
  return (
    <CentralCombobox
      aria-label={label}
      options={field.options}
      value={value || null}
      onValueChange={(id) => onChange(id ?? "")}
      onCreate={field.onCreate}
      createCentral={ensureMemberCentral}
      inputClassName="min-h-11"
    />
  )
}

function ReportRow({
  agreement,
  reasons,
  centrals,
  locked,
  onLocked,
}: {
  agreement: MyOpenAgreement
  reasons: { id: string; label: string }[]
  centrals: CentralField
  locked: boolean
  onLocked: () => void
}) {
  const router = useRouter()
  // C16: próximo passo depois de um Feito — combinado novo, com o mesmo cliente (trocável).
  const [nextOpen, setNextOpen] = React.useState(false)
  const [nextTitle, setNextTitle] = React.useState("")
  const [nextDue, setNextDue] = React.useState("")
  const [nextCentral, setNextCentral] = React.useState(agreement.central?.id ?? "")
  const [nextAdded, setNextAdded] = React.useState(false)
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

  function addNextStep(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createNextStepAgreement({ agreementId: agreement.id, title: nextTitle, dueDate: nextDue, centralId: nextCentral })
      if (!result.ok) {
        if (result.error === L.locked.refused) onLocked()
        return setError(("fieldErrors" in result && (result.fieldErrors?.title ?? result.fieldErrors?.dueDate)) || result.error)
      }
      setNextOpen(false)
      setNextTitle("")
      setNextDue("")
      setNextAdded(true)
      // O novo aparece em "Seus combinados", vindo do servidor.
      router.refresh()
    })
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
        {agreement.central ? <span className="text-xs text-ink-secondary">{agreement.central.name}</span> : null}
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
              {report.outcome === "DONE" && !nextOpen ? (
                <button type="button" className="min-h-11 font-medium text-ink underline-offset-2 hover:underline" onClick={() => (setNextOpen(true), setNextAdded(false))}>
                  {L.next.action}
                </button>
              ) : null}
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
      {showControls && nextOpen ? (
        <form onSubmit={addNextStep} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-sunken/60 p-3">
          <p className="text-xs text-ink-secondary">{L.next.hint}</p>
          <Input
            value={nextTitle}
            maxLength={160}
            autoComplete="off"
            autoFocus
            placeholder={L.next.titleField}
            aria-label={L.next.titleField}
            className="min-h-11"
            onChange={(e) => setNextTitle(e.target.value)}
          />
          <PortalCentral field={centrals} value={nextCentral} onChange={setNextCentral} label={labels.centrals.field} />
          <Input
            value={nextDue}
            inputMode="numeric"
            autoComplete="off"
            placeholder={L.create.dueField}
            aria-label={L.create.dueField}
            className="min-h-11 font-mono"
            onChange={(e) => setNextDue(maskDateInput(e.target.value))}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="min-h-11" disabled={pending} onClick={() => setNextOpen(false)}>
              {L.next.cancel}
            </Button>
            <Button type="submit" className="min-h-11" loading={pending} disabled={nextTitle.trim().length < 3}>
              {L.next.add}
            </Button>
          </div>
        </form>
      ) : null}
      {nextAdded && !error ? <p role="status" className="text-xs text-calm">{L.next.added}</p> : null}
      {error ? <p role="alert" className="text-xs text-overdue">{error}</p> : null}
    </li>
  )
}

/** C14: o colaborador cria o próprio combinado. Sempre dele; a prioridade é do gestor. */
function CreateZone({ locked, centrals, onLocked }: { locked: boolean; centrals: CentralField; onLocked: () => void }) {
  const C = L.create
  const router = useRouter()
  const [title, setTitle] = React.useState("")
  const [due, setDue] = React.useState("")
  const [centralId, setCentralId] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [added, setAdded] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  if (locked) return null

  function add(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setAdded(false)
    startTransition(async () => {
      const result = await createAgreement({ title, dueDate: due, centralId })
      if (!result.ok) {
        if (result.error === L.locked.refused) onLocked()
        return setError(("fieldErrors" in result && (result.fieldErrors?.title ?? result.fieldErrors?.dueDate)) || result.error)
      }
      setTitle("")
      setDue("")
      setCentralId("")
      setAdded(true)
      // A lista "Seus combinados" vem do servidor: o novo aparece lá, pronto para relatar.
      router.refresh()
    })
  }

  return (
    <Section title={C.title}>
      <form onSubmit={add} className="flex flex-col gap-2">
        <p className="-mt-2 text-xs text-ink-secondary">{C.hint}</p>
        <Input value={title} maxLength={160} autoComplete="off" placeholder={C.titleField} aria-label={C.titleField} className="min-h-11" onChange={(e) => setTitle(e.target.value)} />
        <PortalCentral field={centrals} value={centralId} onChange={setCentralId} label={labels.centrals.field} />
        <div className="flex gap-2">
          <Input
            value={due}
            inputMode="numeric"
            autoComplete="off"
            placeholder={C.dueField}
            aria-label={C.dueField}
            className="min-h-11 flex-1 font-mono"
            onChange={(e) => setDue(maskDateInput(e.target.value))}
          />
          <Button type="submit" className="min-h-11" loading={pending} disabled={title.trim().length < 3}>
            {C.add}
          </Button>
        </div>
      </form>
      {error ? <p role="alert" className="text-xs text-overdue">{error}</p> : null}
      {added && !error ? <p role="status" className="text-xs text-calm">{C.added}</p> : null}
    </Section>
  )
}
