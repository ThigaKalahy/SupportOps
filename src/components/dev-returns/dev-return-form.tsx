"use client"

import * as React from "react"

import { createDevReturn, loadTicketContext, updateDevReturn } from "@/actions/dev-returns"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { CentralCombobox } from "@/components/ui/CentralCombobox"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDate, formatDayMonth, maskDateInput, todayBusinessDate } from "@/lib/dates"
import { DEV_RETURN_CATEGORIES } from "@/lib/dev-returns"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { extractTicketRef } from "@/lib/priority-validation"
import { fieldErrorsOf } from "@/lib/validators/fields"
import { devReturnSchema, type DevReturnInput } from "@/lib/validators/dev-return"
import type { DevReturnFormData, DevReturnRow, TicketContext } from "@/server/queries/dev-returns"

const L = labels.devReturns.form
const P = labels.priorityValidations.form

type Values = Required<Omit<DevReturnInput, "id">>

const today = () => formatDate(todayBusinessDate(), "business")

const empty = (): Values => ({
  ticketUrl: "",
  ticketRef: "",
  memberId: "",
  centralId: "",
  returnedAt: today(),
  reasonId: "",
  reasonOther: "",
  devContact: "",
  note: "",
})

function fromRow(row: DevReturnRow): Values {
  return {
    ticketUrl: row.ticketUrl,
    ticketRef: row.ticketRef,
    memberId: row.member.id,
    centralId: row.central?.id ?? "",
    returnedAt: formatDate(row.returnedAt, "business"),
    reasonId: row.reason.id,
    reasonOther: row.reasonOther ?? "",
    devContact: row.devContact ?? "",
    note: row.note ?? "",
  }
}

type RefSource = { kind: "pattern"; label: string } | { kind: "manual" } | null

/**
 * Formulário de devolução do desenvolvimento, sempre no topo de /dev-returns.
 * Feito para lançar dez devoluções seguidas sem mouse: colar a URL extrai o
 * ID pelos padrões de chamado (a mesma função da validação), busca a
 * validação de prioridade do chamado — mostrada numa linha somente leitura —
 * e pré-seleciona analista e central dela (sempre editáveis), com o foco no
 * analista. Ctrl/⌘+Enter salva de qualquer campo, limpa e volta à URL.
 */
export function DevReturnForm({
  data,
  editing,
  onDoneEditing,
}: {
  data: DevReturnFormData
  editing: DevReturnRow | null
  onDoneEditing: () => void
}) {
  const [values, setValues] = React.useState<Values>(empty)
  const [refSource, setRefSource] = React.useState<RefSource>(null)
  const [context, setContext] = React.useState<TicketContext | null>(null)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const urlRef = React.useRef<HTMLInputElement>(null)
  const refInput = React.useRef<HTMLInputElement>(null)
  const memberRef = React.useRef<HTMLButtonElement>(null)
  const formRef = React.useRef<HTMLFormElement>(null)
  const lookup = React.useRef(0)

  const centralOptions = React.useMemo(
    () => (editing?.central && !data.centrals.some((c) => c.id === editing.central!.id) ? [...data.centrals, editing.central] : data.centrals),
    [data.centrals, editing],
  )
  const reasonsByCategory = React.useMemo(
    () => DEV_RETURN_CATEGORIES.map((category) => ({ category, reasons: data.reasons.filter((r) => r.category === category) })),
    [data.reasons],
  )
  const reason = data.reasons.find((r) => r.id === values.reasonId)
  const needsDetail = reason?.requiresDetail === true

  /** Busca a validação do chamado; pré-preenche analista e central só se ainda estiverem vazios. */
  const fetchContext = React.useCallback(
    (ref: string, exceptId?: string) => {
      const id = ++lookup.current
      if (!ref.trim()) return setContext(null)
      void loadTicketContext(ref, exceptId).then((found) => {
        if (id !== lookup.current) return
        setContext(found)
        const v = found?.validation
        if (!v || exceptId) return
        setValues((current) => ({
          ...current,
          memberId: current.memberId || (data.members.some((m) => m.id === v.member.id) ? v.member.id : ""),
          centralId: current.centralId || v.central?.id || "",
        }))
      })
    },
    [data.members],
  )

  React.useEffect(() => {
    if (!editing) return
    setValues(fromRow(editing))
    setRefSource({ kind: "manual" })
    setErrors({})
    setFormError(null)
    setNotice(null)
    fetchContext(editing.ticketRef, editing.id)
    urlRef.current?.focus()
  }, [editing, fetchContext])

  function patch(change: Partial<Values>) {
    setValues((v) => ({ ...v, ...change }))
    setNotice(null)
    const keys = Object.keys(change)
    if (keys.some((k) => errors[k])) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))))
  }

  /** Extrai o ID da URL (mesma função da validação de prioridade). Devolve true se algum padrão reconheceu. */
  function extract(url: string): boolean {
    const found = extractTicketRef(url, data.patterns)
    if (found) {
      const pattern = data.patterns.find((p) => p.id === found.patternId)
      setValues((v) => ({ ...v, ticketUrl: url, ticketRef: found.ref }))
      setRefSource({ kind: "pattern", label: pattern?.label ?? "" })
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "ticketRef" && k !== "ticketUrl")))
      fetchContext(found.ref, editing?.id)
      return true
    }
    setValues((v) => ({ ...v, ticketUrl: url, ticketRef: refSource?.kind === "manual" ? v.ticketRef : "" }))
    setRefSource(url.trim() ? { kind: "manual" } : null)
    if (refSource?.kind !== "manual") setContext(null)
    return false
  }

  function onUrlChange(url: string) {
    setNotice(null)
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
    requestAnimationFrame(() => (recognized ? memberRef.current : refInput.current)?.focus())
  }

  function reset() {
    setValues(empty())
    setRefSource(null)
    setContext(null)
    setErrors({})
    setFormError(null)
    lookup.current++
  }

  const fieldOrder = ["ticketUrl", "ticketRef", "memberId", "centralId", "returnedAt", "reasonId", "reasonOther", "devContact", "note"]
  function focusFirstError(fieldErrors: Record<string, string>) {
    const first = fieldOrder.find((f) => fieldErrors[f])
    if (!first) return
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus())
  }

  function submit() {
    if (pending) return
    const input = { ...(editing ? { id: editing.id } : {}), ...values, reasonOther: needsDetail ? values.reasonOther : "" }
    const parsed = devReturnSchema({ reasons: data.reasons }).safeParse(input)
    if (!parsed.success) {
      const fieldErrors = fieldErrorsOf(parsed.error)
      setErrors(fieldErrors)
      focusFirstError(fieldErrors)
      return
    }
    setErrors({})
    setFormError(null)
    startTransition(async () => {
      const result = editing ? await updateDevReturn(parsed.data) : await createDevReturn(parsed.data)
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

  function cancelEdit() {
    reset()
    setNotice(null)
    onDoneEditing()
    requestAnimationFrame(() => urlRef.current?.focus())
  }

  const validation = context?.validation

  return (
    <form
      ref={formRef}
      aria-label={L.label}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      // Captura: Ctrl/⌘+Enter salva mesmo com o foco num select ou no combobox.
      onKeyDownCapture={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          e.stopPropagation()
          submit()
        } else if (e.key === "Escape" && editing && !(e.target as HTMLElement).closest("[role=listbox], [role=combobox]")) {
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
              ? fill(P.recognized, { pattern: refSource.label })
              : refSource?.kind === "manual" && !editing
                ? P.notRecognized
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
            placeholder={P.ticketRefPlaceholder}
            // Reconhecido pelo padrão, sai do Tab (o foco pula para o analista).
            tabIndex={refSource?.kind === "pattern" ? -1 : 0}
            className="font-mono"
            onChange={(e) => {
              patch({ ticketRef: e.target.value })
              setRefSource({ kind: "manual" })
            }}
            onBlur={(e) => {
              if (refSource?.kind === "manual") fetchContext(e.target.value, editing?.id)
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

        <FieldGroup label={L.returnedAt} required error={errors.returnedAt} className="w-32 shrink-0">
          <Input
            data-field="returnedAt"
            value={values.returnedAt}
            inputMode="numeric"
            autoComplete="off"
            placeholder={labels.forms.datePlaceholder}
            className="font-mono"
            onChange={(e) => patch({ returnedAt: maskDateInput(e.target.value) })}
          />
        </FieldGroup>

        <FieldGroup label={L.reason} required error={errors.reasonId} className="w-72 shrink-0">
          {(control) => (
            <Select value={values.reasonId} onValueChange={(v) => patch({ reasonId: v })}>
              <SelectTrigger data-field="reasonId" {...control} className="w-full min-w-0">
                <SelectValue placeholder={L.reasonPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {reasonsByCategory.map(({ category, reasons }, i) =>
                  reasons.length ? (
                    <React.Fragment key={category}>
                      {i > 0 ? <SelectSeparator /> : null}
                      <SelectGroup>
                        <SelectLabel>{enumLabel("devReturnCategory", category)}</SelectLabel>
                        {reasons.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </React.Fragment>
                  ) : null,
                )}
              </SelectContent>
            </Select>
          )}
        </FieldGroup>
      </div>

      {/* Contexto do chamado: a validação de prioridade, somente leitura (P20). */}
      {values.ticketRef && context ? (
        <p className="flex flex-wrap gap-x-2 text-xs text-ink-secondary" aria-live="polite">
          <span className={validation ? "text-ink" : undefined}>
            {validation
              ? validation.outcome === "RETURNED"
                ? fill(L.validationContextReturned, { date: formatDayMonth(validation.validatedAt), analyst: validation.analystPriority })
                : fill(L.validationContext, {
                    date: formatDayMonth(validation.validatedAt),
                    analyst: validation.analystPriority,
                    supervisor: validation.supervisorPriority ?? "—",
                    outcome: enumLabel("validationOutcome", validation.outcome).toLowerCase(),
                  })
              : L.noValidation}
          </span>
          {context.validations > 1 ? <span>{fill(L.validationMore, { count: context.validations })}</span> : null}
          {context.previousReturns > 0 ? <span className="text-attention">{plural(L.previousReturns, context.previousReturns)}</span> : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
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
        <FieldGroup label={L.devContact} optional error={errors.devContact} className="w-48 shrink-0">
          <Input
            data-field="devContact"
            value={values.devContact}
            maxLength={120}
            autoComplete="off"
            placeholder={L.devContactPlaceholder}
            onChange={(e) => patch({ devContact: e.target.value })}
          />
        </FieldGroup>
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
