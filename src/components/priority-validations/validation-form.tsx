"use client"

import * as React from "react"

import { createValidation, updateValidation } from "@/actions/priority-validations"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { CentralCombobox } from "@/components/ui/CentralCombobox"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusPill } from "@/components/ui/status-pill"
import { enumLabel, fill, labels } from "@/lib/labels"
import { computeOutcome, extractTicketRef, OUTCOME_SEVERITY, type ValidationOutcome } from "@/lib/priority-validation"
import { fieldErrorsOf } from "@/lib/validators/fields"
import {
  priorityValidationSchema,
  type PriorityValidationInput,
  type ValidationCatalog,
} from "@/lib/validators/priority-validation"
import type { ValidationFormData, ValidationRow } from "@/server/queries/priority-validations"

const L = labels.priorityValidations.form

type Values = Required<Omit<PriorityValidationInput, "id">>

const EMPTY: Values = {
  ticketUrl: "",
  ticketRef: "",
  memberId: "",
  centralId: "",
  analystPriorityId: "",
  supervisorPriorityId: "",
  returned: false,
  reasonId: "",
  reasonOther: "",
  note: "",
}

function fromRow(row: ValidationRow): Values {
  return {
    ticketUrl: row.ticketUrl,
    ticketRef: row.ticketRef,
    memberId: row.member.id,
    centralId: row.central?.id ?? "",
    analystPriorityId: row.analystPriority.id,
    supervisorPriorityId: row.supervisorPriority?.id ?? "",
    returned: row.returned,
    reasonId: row.reason?.id ?? "",
    reasonOther: row.reasonOther ?? "",
    note: row.note ?? "",
  }
}

/** De onde veio o ID: padrão reconhecido (com o nome) ou digitado. */
type RefSource = { kind: "pattern"; label: string } | { kind: "manual" } | null

/**
 * Formulário de validação de prioridade, sempre no topo de
 * /priority-validations. Otimizado para validar chamados em sequência:
 *
 * colar a URL → o ID é extraído pelos padrões ativos (em ordem) e o foco
 * pula para Responsável → inicial da pessoa, Tab → letra da prioridade do
 * analista, Tab → letra da validada → (motivo, se mudou) → Ctrl/⌘+Enter.
 * Ao salvar, limpa tudo e o foco volta à URL.
 *
 * O resultado não é campo: é calculado ao vivo dos ranks (ou "Devolvida").
 * Em edição, sem trocar as prioridades, valem os ranks gravados (D14).
 */
export function ValidationForm({
  data,
  editing,
  onDoneEditing,
}: {
  data: ValidationFormData
  editing: ValidationRow | null
  onDoneEditing: () => void
}) {
  const [values, setValues] = React.useState<Values>(EMPTY)
  // Na edição, a central gravada entra na lista mesmo se tiver sido desativada depois.
  const centralOptions = React.useMemo(
    () =>
      editing?.central && !data.centrals.some((c) => c.id === editing.central!.id) ? [...data.centrals, editing.central] : data.centrals,
    [data.centrals, editing],
  )
  const [refSource, setRefSource] = React.useState<RefSource>(null)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const urlRef = React.useRef<HTMLInputElement>(null)
  const refInput = React.useRef<HTMLInputElement>(null)
  const memberRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (!editing) return
    setValues(fromRow(editing))
    setRefSource({ kind: "manual" })
    setErrors({})
    setFormError(null)
    setNotice(null)
    urlRef.current?.focus()
  }, [editing])

  // Em edição sem trocar prioridades, valem os ranks do momento da validação (D14).
  const samePriorities =
    editing !== null &&
    values.analystPriorityId === editing.analystPriority.id &&
    values.returned === editing.returned &&
    (values.returned || values.supervisorPriorityId === (editing.supervisorPriority?.id ?? ""))
  const catalog: ValidationCatalog = React.useMemo(() => {
    const levels = data.levels.map((l) => ({ id: l.id, rank: l.rank }))
    if (editing && samePriorities) {
      const override = new Map<string, number>([[editing.analystPriority.id, editing.analystRankSnapshot]])
      if (editing.supervisorPriority && editing.supervisorRankSnapshot !== null) {
        override.set(editing.supervisorPriority.id, editing.supervisorRankSnapshot)
      }
      for (const [id, rank] of override) {
        const found = levels.find((l) => l.id === id)
        if (found) found.rank = rank
        else levels.push({ id, rank })
      }
    }
    return { levels, reasons: data.reasons }
  }, [data.levels, data.reasons, editing, samePriorities])

  const rankOf = (id: string) => catalog.levels.find((l) => l.id === id)?.rank ?? null
  const outcome: ValidationOutcome | null = computeOutcome({
    analystRank: rankOf(values.analystPriorityId),
    supervisorRank: rankOf(values.supervisorPriorityId),
    returned: values.returned,
  })
  const needsReason = outcome !== null && outcome !== "MAINTAINED"
  const reason = data.reasons.find((r) => r.id === values.reasonId)
  const needsDetail = needsReason && reason?.requiresDetail === true

  function patch(change: Partial<Values>) {
    setValues((v) => ({ ...v, ...change }))
    setNotice(null)
    const keys = Object.keys(change)
    if (keys.some((k) => errors[k])) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))))
  }

  /** Extrai o ID da URL. Devolve true se algum padrão reconheceu. */
  function extract(url: string): boolean {
    const found = extractTicketRef(url, data.patterns)
    if (found) {
      const pattern = data.patterns.find((p) => p.id === found.patternId)
      setValues((v) => ({ ...v, ticketUrl: url, ticketRef: found.ref }))
      setRefSource({ kind: "pattern", label: pattern?.label ?? "" })
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "ticketRef" && k !== "ticketUrl")))
      return true
    }
    // Sem padrão: o ID fica para digitar (não apaga um ID já digitado à mão).
    setValues((v) => ({ ...v, ticketUrl: url, ticketRef: refSource?.kind === "manual" ? v.ticketRef : "" }))
    setRefSource(url.trim() ? { kind: "manual" } : null)
    return false
  }

  function onUrlChange(url: string) {
    setNotice(null)
    // Enquanto o ID vier de padrão, acompanha a URL; digitado à mão, fica.
    if (refSource?.kind === "manual" && values.ticketRef) return patch({ ticketUrl: url })
    extract(url)
  }

  function onUrlPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").trim()
    if (!pasted) return
    event.preventDefault()
    const input = event.currentTarget
    const url = `${input.value.slice(0, input.selectionStart ?? 0)}${pasted}${input.value.slice(input.selectionEnd ?? input.value.length)}`.trim()
    const recognized = extract(url)
    // Colou e reconheceu: segue direto para o responsável; senão, para o ID.
    requestAnimationFrame(() => (recognized ? memberRef.current : refInput.current)?.focus())
  }

  function reset() {
    setValues(EMPTY)
    setRefSource(null)
    setErrors({})
    setFormError(null)
  }

  function submit() {
    if (pending) return
    const input = {
      ...(editing ? { id: editing.id } : {}),
      ...values,
      supervisorPriorityId: values.returned ? "" : values.supervisorPriorityId,
      reasonId: needsReason ? values.reasonId : "",
      reasonOther: needsDetail ? values.reasonOther : "",
    }
    const parsed = priorityValidationSchema(catalog).safeParse(input)
    if (!parsed.success) {
      const fieldErrors = fieldErrorsOf(parsed.error)
      setErrors(fieldErrors)
      focusFirstError(fieldErrors)
      return
    }
    setErrors({})
    setFormError(null)
    startTransition(async () => {
      const result = editing ? await updateValidation(parsed.data) : await createValidation(parsed.data)
      if (!result.ok) {
        setFormError(result.error)
        if (result.fieldErrors) {
          setErrors(result.fieldErrors)
          focusFirstError(result.fieldErrors)
        }
        return
      }
      reset()
      setNotice(fill(editing ? L.updated : L.saved, { ref: result.ticketRef }))
      if (editing) onDoneEditing()
      requestAnimationFrame(() => urlRef.current?.focus())
    })
  }

  const fieldOrder = ["ticketUrl", "ticketRef", "memberId", "centralId", "analystPriorityId", "supervisorPriorityId", "reasonId", "reasonOther", "note"]
  const formRef = React.useRef<HTMLFormElement>(null)
  function focusFirstError(fieldErrors: Record<string, string>) {
    const first = fieldOrder.find((f) => fieldErrors[f])
    if (!first) return
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus())
  }

  function cancelEdit() {
    reset()
    setNotice(null)
    onDoneEditing()
    requestAnimationFrame(() => urlRef.current?.focus())
  }

  const levelItems = data.levels.map((l) => (
    <SelectItem key={l.id} value={l.id}>
      {l.label}
    </SelectItem>
  ))

  return (
    <form
      ref={formRef}
      aria-label={L.label}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      // Captura: Ctrl/⌘+Enter salva mesmo com o foco num select (o Radix abriria a lista).
      onKeyDownCapture={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          e.stopPropagation()
          submit()
        } else if (e.key === "Escape" && editing && !(e.target as HTMLElement).closest("[role=listbox]")) {
          cancelEdit()
        }
      }}
      className="flex flex-col gap-3"
    >
      {editing ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-line bg-surface-sunken px-3 py-1.5 text-sm text-ink">
          <span>{fill(L.editing, { ref: editing.ticketRef })}</span>
          <Button type="button" variant="link" size="sm" onClick={cancelEdit}>
            {L.cancelEdit}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
        <FieldGroup label={L.ticketUrl} error={errors.ticketUrl} required className="min-w-0 flex-[2_1_16rem]">
          <Input
            ref={urlRef}
            data-field="ticketUrl"
            value={values.ticketUrl}
            autoComplete="off"
            spellCheck={false}
            placeholder={L.ticketUrlPlaceholder}
            onChange={(e) => onUrlChange(e.target.value)}
            onPaste={onUrlPaste}
            onBlur={(e) => {
              if (!values.ticketRef || refSource?.kind === "pattern") extract(e.target.value)
            }}
          />
        </FieldGroup>

        <FieldGroup
          label={L.ticketRef}
          required
          error={errors.ticketRef}
          help={
            refSource?.kind === "pattern"
              ? fill(L.recognized, { pattern: refSource.label })
              : refSource?.kind === "manual" && !editing
                ? L.notRecognized
                : undefined
          }
          className="w-28 shrink-0"
        >
          <Input
            ref={refInput}
            data-field="ticketRef"
            value={values.ticketRef}
            autoComplete="off"
            spellCheck={false}
            placeholder={L.ticketRefPlaceholder}
            // Reconhecido pelo padrão, sai do Tab (o foco pula para o responsável).
            tabIndex={refSource?.kind === "pattern" ? -1 : 0}
            className="font-mono"
            onChange={(e) => {
              patch({ ticketRef: e.target.value })
              setRefSource({ kind: "manual" })
            }}
          />
        </FieldGroup>

        <FieldGroup label={L.member} required error={errors.memberId} className="w-36 shrink-0">
          {(control) => (
            <Select value={values.memberId} onValueChange={(v) => patch({ memberId: v })}>
              <SelectTrigger ref={memberRef} data-field="memberId" {...control} className="w-full min-w-0">
                <SelectValue placeholder={L.memberPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {data.members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.preferredName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FieldGroup>

        {/* Central (P19): opcional. Só com o módulo ligado no time (D32). */}
        {data.centralsEnabled ? (
          <FieldGroup label={labels.centrals.field} error={errors.centralId} className="w-44 shrink-0">
            {(control) => (
              <CentralCombobox
                {...control}
                data-field="centralId"
                options={centralOptions}
                value={values.centralId || null}
                onValueChange={(id) => patch({ centralId: id ?? "" })}
              />
            )}
          </FieldGroup>
        ) : null}

        <FieldGroup label={L.analystPriority} required error={errors.analystPriorityId} className="w-36 shrink-0">
          {(control) => (
            <Select value={values.analystPriorityId} onValueChange={(v) => patch({ analystPriorityId: v })}>
              <SelectTrigger data-field="analystPriorityId" {...control} className="w-full min-w-0">
                <SelectValue placeholder={L.priorityPlaceholder} />
              </SelectTrigger>
              <SelectContent>{levelItems}</SelectContent>
            </Select>
          )}
        </FieldGroup>

        <FieldGroup
          label={L.supervisorPriority}
          required={!values.returned}
          error={values.returned ? undefined : errors.supervisorPriorityId}
          className="w-36 shrink-0"
        >
          {(control) => (
            <Select
              value={values.returned ? "" : values.supervisorPriorityId}
              onValueChange={(v) => patch({ supervisorPriorityId: v })}
              disabled={values.returned}
            >
              <SelectTrigger data-field="supervisorPriorityId" {...control} className="w-full min-w-0">
                <SelectValue placeholder={values.returned ? labels.priorityValidations.table.none : L.priorityPlaceholder} />
              </SelectTrigger>
              <SelectContent>{levelItems}</SelectContent>
            </Select>
          )}
        </FieldGroup>

        <div className="flex shrink-0 flex-col gap-1.5">
          {/* Espaço da altura de um rótulo, para alinhar com os campos ao lado. */}
          <span aria-hidden className="h-3.25" />
          <div className="flex h-9 items-center gap-2">
            <Checkbox
              id="validation-returned"
              checked={values.returned}
              onCheckedChange={(c) => patch({ returned: c === true })}
            />
            <Label htmlFor="validation-returned" className="font-normal">
              {L.returned}
            </Label>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="text-sm leading-none font-medium text-ink">{L.outcome}</span>
          <div className="flex h-9 items-center" aria-live="polite">
            {outcome ? (
              <StatusPill severity={OUTCOME_SEVERITY[outcome]} label={enumLabel("validationOutcome", outcome)} />
            ) : (
              <span className="text-sm text-ink-secondary">
                <span aria-hidden>{labels.priorityValidations.table.none}</span>
                <span className="sr-only">{L.outcomePending}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
        {needsReason ? (
          <FieldGroup label={L.reason} required error={errors.reasonId} className="w-64 shrink-0">
            {(control) => (
              <Select value={values.reasonId} onValueChange={(v) => patch({ reasonId: v })}>
                <SelectTrigger data-field="reasonId" {...control} className="w-full min-w-0">
                  <SelectValue placeholder={L.reasonPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {data.reasons.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldGroup>
        ) : null}
        {needsDetail ? (
          <FieldGroup label={L.reasonOther} required error={errors.reasonOther} className="min-w-0 flex-[1_1_14rem]">
            <Input
              data-field="reasonOther"
              value={values.reasonOther}
              maxLength={300}
              autoComplete="off"
              placeholder={L.reasonOtherPlaceholder}
              onChange={(e) => patch({ reasonOther: e.target.value })}
            />
          </FieldGroup>
        ) : null}
        <FieldGroup label={L.note} optional error={errors.note} className="min-w-0 flex-[2_1_16rem]">
          <Input
            data-field="note"
            value={values.note}
            maxLength={300}
            autoComplete="off"
            placeholder={L.notePlaceholder}
            onChange={(e) => patch({ note: e.target.value })}
          />
        </FieldGroup>
        <div className="flex shrink-0 flex-col gap-1.5">
          <span aria-hidden className="h-3.25" />
          <div className="flex items-center gap-2">
            {editing ? (
              <Button type="button" variant="secondary" onClick={cancelEdit} disabled={pending}>
                {L.cancelEdit}
              </Button>
            ) : null}
            <Button type="submit" loading={pending}>
              {editing ? L.saveEdit : L.submit}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-4 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p role="status" className="min-h-4 text-xs text-calm">
          {notice}
        </p>
        <p className="font-mono text-2xs text-ink-secondary max-sm:hidden">{L.shortcut}</p>
      </div>
      <FormError message={formError} />
    </form>
  )
}
