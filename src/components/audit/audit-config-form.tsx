"use client"

import * as React from "react"

import { updateAuditConfig } from "@/actions/audit"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { labels } from "@/lib/labels"
import type { AuditConfigView } from "@/server/audit/config"

const C = labels.audit.config

type Values = Record<
  | "model"
  | "maxPerRun"
  | "concurrency"
  | "requestsPerMinute"
  | "tokensPerMinute"
  | "maxInputTokens"
  | "maxOutputTokens"
  | "monthlyBudgetUsd"
  | "batchBudgetUsd"
  | "inputPricePerMTok"
  | "cachedInputPricePerMTok"
  | "outputPricePerMTok"
  | "retentionDays",
  string
>

const str = (n: number | null) => (n === null ? "" : String(n))

/**
 * C23 — configuração da auditoria. Interruptores (avaliações, simulação, mascaramento),
 * limites, orçamento e preços. Números com vírgula viram ponto ao enviar.
 */
export function AuditConfigForm({ config }: { config: AuditConfigView }) {
  const toast = useToast()
  const [enabled, setEnabled] = React.useState(config.enabled)
  const [simulation, setSimulation] = React.useState(config.simulation)
  const [mask, setMask] = React.useState(config.maskPersonalData)
  const [values, setValues] = React.useState<Values>({
    model: config.model,
    maxPerRun: str(config.maxPerRun),
    concurrency: str(config.concurrency),
    requestsPerMinute: str(config.requestsPerMinute),
    tokensPerMinute: str(config.tokensPerMinute),
    maxInputTokens: str(config.maxInputTokens),
    maxOutputTokens: str(config.maxOutputTokens),
    monthlyBudgetUsd: str(config.monthlyBudgetUsd).replace(".", ","),
    batchBudgetUsd: str(config.batchBudgetUsd).replace(".", ","),
    inputPricePerMTok: str(config.inputPricePerMTok).replace(".", ","),
    cachedInputPricePerMTok: str(config.cachedInputPricePerMTok).replace(".", ","),
    outputPricePerMTok: str(config.outputPricePerMTok).replace(".", ","),
    retentionDays: str(config.retentionDays),
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }))
  const dot = (value: string) => value.trim().replace(/\./g, "").replace(",", ".")

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setErrors({})
    startTransition(async () => {
      const result = await updateAuditConfig({
        enabled,
        simulation,
        maskPersonalData: mask,
        model: values.model,
        maxPerRun: values.maxPerRun,
        concurrency: values.concurrency,
        requestsPerMinute: values.requestsPerMinute,
        tokensPerMinute: values.tokensPerMinute,
        maxInputTokens: values.maxInputTokens,
        maxOutputTokens: values.maxOutputTokens,
        monthlyBudgetUsd: dot(values.monthlyBudgetUsd) || "0",
        batchBudgetUsd: dot(values.batchBudgetUsd) || "0",
        inputPricePerMTok: dot(values.inputPricePerMTok),
        cachedInputPricePerMTok: dot(values.cachedInputPricePerMTok),
        outputPricePerMTok: dot(values.outputPricePerMTok),
        retentionDays: values.retentionDays,
      })
      if (result.ok) return toast.show(C.saved, { tone: "calm" })
      setErrors(result.fieldErrors ?? {})
      setError(result.error)
    })
  }

  const field = (key: keyof Values, label: string, help?: string, mono = true) => (
    <FieldGroup label={label} help={help} error={errors[key]}>
      <Input value={values[key]} onChange={set(key)} inputMode={key === "model" ? "text" : "decimal"} className={mono ? "font-mono" : undefined} />
    </FieldGroup>
  )

  const toggle = (id: string, checked: boolean, onChange: (v: boolean) => void, label: string, help: string) => (
    <div className="flex items-start gap-2.5">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(c === true)} className="mt-0.5" />
      <label htmlFor={id} className="flex flex-col gap-0.5">
        <span className="text-sm text-ink">{label}</span>
        <span className="text-xs text-ink-secondary">{help}</span>
      </label>
    </div>
  )

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-5" noValidate>
      <p className="text-sm text-ink-secondary">{C.direction}</p>
      <div className="flex flex-col gap-3">
        {toggle("audit-enabled", enabled, setEnabled, C.enabled, C.enabledHelp)}
        {toggle("audit-simulation", simulation, setSimulation, C.simulation, C.simulationHelp)}
        {toggle("audit-mask", mask, setMask, C.maskPersonalData, C.maskHelp)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("model", C.model, C.modelHelp)}
        {field("maxPerRun", C.maxPerRun, C.maxPerRunHelp)}
        {field("concurrency", C.concurrency)}
        {field("requestsPerMinute", C.requestsPerMinute)}
        {field("tokensPerMinute", C.tokensPerMinute)}
        {field("maxInputTokens", C.maxInputTokens)}
        {field("maxOutputTokens", C.maxOutputTokens)}
        {field("retentionDays", C.retentionDays, C.retentionHelp)}
        {field("monthlyBudgetUsd", C.monthlyBudgetUsd, C.monthlyBudgetHelp)}
        {field("batchBudgetUsd", C.batchBudgetUsd)}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">{C.prices}</legend>
        <p className="text-xs text-ink-secondary">{C.pricesHelp}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("inputPricePerMTok", C.inputPrice)}
          {field("cachedInputPricePerMTok", C.cachedInputPrice)}
          {field("outputPricePerMTok", C.outputPrice)}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-overdue">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" loading={pending}>
          {C.save}
        </Button>
      </div>
    </form>
  )
}
