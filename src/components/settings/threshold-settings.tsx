"use client"

import * as React from "react"

import { setThreshold } from "@/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { isScalarKey } from "@/lib/alert-thresholds"
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
export function ThresholdSettings({ settings, canWrite }: { settings: ThresholdSetting[]; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-secondary">{T.direction}</p>
      {canWrite ? null : <p className="text-xs text-ink-secondary">{labels.settings.readOnly}</p>}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">{T.tableLabel}</caption>
          <thead>
            <tr className="border-b border-line bg-surface-sunken">
              <th scope="col" className="px-3 py-2 text-left font-mono text-2xs font-medium tracking-wide text-ink-secondary uppercase">
                {T.columns.alert}
              </th>
              <th scope="col" className="w-56 px-3 py-2 text-left font-mono text-2xs font-medium tracking-wide text-ink-secondary uppercase">
                {T.columns.value}
              </th>
            </tr>
          </thead>
          <tbody>
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
    <tr className="border-b border-line align-top last:border-b-0">
      <th scope="row" className="px-3 py-2 text-left font-normal">
        <label htmlFor={inputId} className="text-sm text-ink">
          {name}
        </label>
        <p id={`${inputId}-help`} className="text-xs text-ink-secondary">
          {help}
        </p>
      </th>
      <td className="px-3 py-2">
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
