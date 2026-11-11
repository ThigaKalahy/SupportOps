"use client"

import * as React from "react"

import { setOneOnOneSince, setThreshold } from "@/actions/settings"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { isScalarKey } from "@/lib/alert-thresholds"
import { formatDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import type { ThresholdSetting } from "@/server/queries/thresholds"

const T = labels.settings.thresholds

function describe(s: ThresholdSetting): { name: string; help: string; unit: string } {
  if (s.seniority) return { name: fill(T.oneOnOne, { seniority: s.seniority.label }), help: T.oneOnOneHelp, unit: T.days }
  return isScalarKey(s.key) ? T.items[s.key] : { name: s.key, help: "", unit: "" }
}

/**
 * Limiares do motor de alertas. Cada linha grava ao sair do campo ou com
 * Enter (auditado); "Voltar ao padrão" apaga o valor próprio. Fora da faixa,
 * o erro aparece na própria linha e nada é gravado.
 */
export function ThresholdSettings({ settings, canWrite, oneOnOneSince = null }: { settings: ThresholdSetting[]; canWrite: boolean; oneOnOneSince?: Date | null }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-secondary">{T.direction}</p>
      {canWrite ? null : <p className="text-xs text-ink-secondary">{labels.settings.readOnly}</p>}
      <OneOnOneClock since={oneOnOneSince} canWrite={canWrite} />
      <div className="rounded-lg border border-line bg-surface">
        {/* Abaixo de 640px, cada linha empilha o alerta e o valor (sem rolagem horizontal). */}
        <table className="w-full text-sm max-sm:block">
          <caption className="sr-only">{T.tableLabel}</caption>
          <thead className="max-sm:hidden">
            <tr className="border-b border-line bg-surface-sunken">
              <th scope="col" className="px-3 py-2 text-left font-mono text-2xs font-medium tracking-wide text-ink-secondary uppercase">
                {T.columns.alert}
              </th>
              <th scope="col" className="w-56 px-3 py-2 text-left font-mono text-2xs font-medium tracking-wide text-ink-secondary uppercase">
                {T.columns.value}
              </th>
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {settings.map((s) => (
              <ThresholdRow key={s.key} setting={s} canWrite={canWrite} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ThresholdRow({ setting, canWrite }: { setting: ThresholdSetting; canWrite: boolean }) {
  const toast = useToast()
  const { name, help, unit } = describe(setting)
  const [value, setValue] = React.useState(String(setting.value))
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const inputId = `threshold-${setting.key}`

  React.useEffect(() => setValue(String(setting.value)), [setting.value])

  function save(next: number | null) {
    setError(null)
    startTransition(async () => {
      const result = await setThreshold({ key: setting.key, value: next })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.show(T.saved)
    })
  }

  function commit() {
    const trimmed = value.trim()
    if (trimmed === String(setting.value)) return
    const number = Number(trimmed)
    if (!/^\d{1,3}$/.test(trimmed) || number < setting.min || number > setting.max) {
      setError(fill(T.outOfRange, { min: setting.min, max: setting.max }))
      return
    }
    save(number)
  }

  return (
    <tr className="border-b border-line align-top last:border-b-0 max-sm:block">
      <th scope="row" className="px-3 py-2 text-left font-normal max-sm:block max-sm:pb-0">
        <label htmlFor={inputId} className="text-sm text-ink">
          {name}
        </label>
        <p id={`${inputId}-help`} className="text-xs text-ink-secondary">
          {help}
        </p>
      </th>
      <td className="px-3 py-2 max-sm:block">
        {canWrite ? (
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <Input
                id={inputId}
                inputMode="numeric"
                autoComplete="off"
                value={value}
                disabled={pending}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${inputId}-help ${inputId}-meta`}
                className="w-20 font-mono"
                onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 3))}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    commit()
                  }
                  if (e.key === "Escape") setValue(String(setting.value))
                }}
              />
              <span className="text-xs text-ink-secondary">{unit}</span>
            </span>
            <span id={`${inputId}-meta`} className="flex flex-wrap items-center gap-x-2 text-xs text-ink-secondary">
              <span className={cn(setting.custom && "text-ink")}>
                {setting.custom ? T.custom : fill(T.defaultValue, { value: setting.defaultValue })}
              </span>
              {setting.custom ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  disabled={pending}
                  aria-label={fill(T.resetLabel, { name, value: setting.defaultValue })}
                  onClick={() => save(null)}
                >
                  {T.reset} ({setting.defaultValue})
                </Button>
              ) : null}
            </span>
            {error ? (
              <span role="alert" className="text-xs text-overdue">
                {error}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="font-mono text-ink">
            {setting.value} <span className="font-sans text-xs text-ink-secondary">{unit}</span>
          </span>
        )}
      </td>
    </tr>
  )
}

/**
 * C24 — de onde contam os dias sem 1:1. "Recomeçar hoje" zera a contagem do time sem apagar
 * nem inventar 1:1 (confirmação no app); "Contar pelo histórico" volta ao último 1:1 de cada um.
 */
function OneOnOneClock({ since, canWrite }: { since: Date | null; canWrite: boolean }) {
  const C = T.oneOnOneClock
  const toast = useToast()
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function run(restart: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await setOneOnOneSince({ restart })
      if (!result.ok) return setError(result.error)
      setConfirming(false)
      toast.show(restart ? C.restarted : C.cleared, { tone: "calm" })
    })
  }

  return (
    <div className="flex max-w-3xl flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-3">
      <p className="text-sm font-medium text-ink">{C.title}</p>
      <p className="text-sm text-ink-secondary">{since ? fill(C.since, { date: formatDate(since, "business") }) : C.history}</p>
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)}>
            {C.restart}
          </Button>
          {since ? (
            <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => run(false)}>
              {C.clear}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-xs text-overdue">{error}</p> : null}
      <Dialog open={confirming} onOpenChange={(open) => !pending && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{C.confirmTitle}</DialogTitle>
            <DialogDescription>{C.confirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              {C.cancel}
            </Button>
            <Button type="button" loading={pending} onClick={() => run(true)}>
              {C.restart}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
