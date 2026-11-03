"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { queueAudit, runAuditStep, stopAudit } from "@/actions/audit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusPill } from "@/components/ui/status-pill"
import { fill, labels } from "@/lib/labels"
import type { Severity } from "@/lib/severity"

const R = labels.audit.run

export interface AuditRunnerState {
  simulation: boolean
  model: string
  maxPerRun: number
  blocker: string | null
  eligible: number
  queued: number
  processing: number
  monthSpentUsd: number
  monthlyBudgetUsd: number
  batchSpentUsd: number
  batchBudgetUsd: number
}

type Outcome = "done" | "review" | "simulated" | "failed" | "retry"
const OUTCOME_SEVERITY: Record<Outcome, Severity> = { done: "calm", review: "attention", simulated: "neutral", failed: "overdue", retry: "attention" }

const usd = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * C23 Fase D — conduz a fila de avaliação pela tela: põe na fila (até o teto por execução) e
 * pede UM passo por vez ao servidor (uma conversa por chamada). Espera os limites por minuto,
 * para no bloqueio (chave, saldo, orçamento) e tem "Parar". Fechar a página não perde nada:
 * a fila fica no banco e esta tela oferece "Continuar". No modo real, confirma antes de enviar.
 */
export function AuditRunner({ batchId, conversationId, state }: { batchId: string; conversationId?: string; state: AuditRunnerState }) {
  const router = useRouter()
  const options = Math.max(1, Math.min(state.maxPerRun, state.eligible))
  const [count, setCount] = React.useState(1)
  const [running, setRunning] = React.useState(false)
  const [status, setStatus] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [log, setLog] = React.useState<{ id: string; label: string; outcome: Outcome; detail: string | null }[]>([])
  const [confirming, setConfirming] = React.useState(false)
  const stopRef = React.useRef(false)
  const pending = state.queued + state.processing

  async function loop() {
    setRunning(true)
    stopRef.current = false
    let done = 0
    try {
      for (;;) {
        if (stopRef.current) break
        setStatus(fill(R.running, { done }))
        const result = await runAuditStep({ batchId })
        if (!result.ok) {
          setError(result.error)
          break
        }
        if (result.state === "processed") {
          done++
          setLog((current) => [...current, { id: result.conversationId, label: result.label, outcome: result.outcome, detail: result.detail }])
          router.refresh()
          continue
        }
        if (result.state === "wait") {
          setStatus(fill(R.waiting, { seconds: result.seconds, reason: result.reason }))
          await sleep(result.seconds * 1000)
          continue
        }
        if (result.state === "blocked") setError(result.reason)
        setStatus(result.state === "stopped" ? R.stopped : result.state === "idle" ? R.finished : null)
        break
      }
    } finally {
      setRunning(false)
      router.refresh()
    }
  }

  async function start() {
    setConfirming(false)
    setError(null)
    setLog([])
    const queued = await queueAudit({ batchId, conversationIds: conversationId ? [conversationId] : undefined, count: conversationId ? 1 : count })
    if (!queued.ok) return setError(queued.error)
    await loop()
  }

  async function stop() {
    stopRef.current = true
    const result = await stopAudit({ batchId })
    if (!result.ok) setError(result.error)
    setStatus(R.stopped)
    router.refresh()
  }

  const n = conversationId ? 1 : count
  const label = conversationId ? (state.simulation ? R.simulateOne : R.evaluateOne) : fill(state.simulation ? R.simulate : R.evaluate, { count: n })

  return (
    <div className="flex max-w-4xl flex-col gap-3 rounded-lg border border-line bg-surface px-3 py-3">
      <p className="text-sm text-ink">{state.simulation ? R.modeSimulation : fill(R.modeReal, { model: state.model })}</p>
      {state.simulation ? null : (
        <p className="text-xs text-ink-secondary">
          {fill(R.spend, {
            month: usd.format(state.monthSpentUsd),
            budget: usd.format(state.monthlyBudgetUsd),
            batch: usd.format(state.batchSpentUsd),
            batchBudget: usd.format(state.batchBudgetUsd),
          })}
        </p>
      )}

      {state.blocker ? (
        <p className="text-sm text-attention">{state.blocker}</p>
      ) : running ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-secondary" aria-live="polite">
            {status}
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={stop}>
            {R.stop}
          </Button>
        </div>
      ) : pending > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-secondary">{fill(R.pending, { count: pending })}</span>
          <Button type="button" size="sm" onClick={loop}>
            {R.resume}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={stop}>
            {R.stop}
          </Button>
        </div>
      ) : state.eligible === 0 ? (
        conversationId ? null : <p className="text-sm text-ink-secondary">{R.noneEligible}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {conversationId ? null : (
            <>
              <span className="text-sm text-ink-secondary">{fill(R.eligible, { count: state.eligible })}</span>
              <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                <SelectTrigger className="w-24" aria-label={R.howMany}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: options }, (_, i) => i + 1).map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <Button type="button" size="sm" onClick={() => (state.simulation ? start() : setConfirming(true))}>
            {label}
          </Button>
        </div>
      )}

      {!running && status ? <p className="text-sm text-ink-secondary">{status}</p> : null}
      {error ? <p className="text-sm text-overdue">{error}</p> : null}

      {log.length ? (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {log.map((entry, i) => (
            <li key={`${entry.id}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
              <Link href={`/audit/conversations/${entry.id}`} className="font-mono text-xs text-ink hover:underline">
                {entry.label}
              </Link>
              <StatusPill severity={OUTCOME_SEVERITY[entry.outcome]} label={R.outcomes[entry.outcome]} />
              {entry.detail ? <span className="basis-full text-xs text-ink-secondary">{entry.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{R.confirmTitle}</DialogTitle>
            <DialogDescription>{fill(R.confirmDescription, { count: n, model: state.model })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              {R.cancel}
            </Button>
            <Button type="button" onClick={start}>
              {fill(R.confirm, { count: n })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
