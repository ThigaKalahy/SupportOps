"use client"

import * as React from "react"
import Link from "next/link"

import { DragIndicator, DueCell } from "@/components/agreements/agreements-table"
import { Button } from "@/components/ui/button"
import { CentralCombobox, type CentralOption } from "@/components/ui/CentralCombobox"
import { Input } from "@/components/ui/input"
import { MetaLabel } from "@/components/ui/meta-label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusPill } from "@/components/ui/status-pill"
import { formatDayMonth, maskDateInput } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import type { ReviewItem } from "@/server/queries/dailies"

const R = labels.dailies.review
const NO_REASON = "none"

export type Outcome = "DONE" | "PARTIAL" | "NOT_DONE"

export interface ReviewState {
  outcome: Outcome | null
  blockerText: string
  blockerReasonId: string
  action: "reschedule" | "replace"
  newDueDate: string
  replacementTitle: string
  replacementDueDate: string
  /** Feito + próximo passo (o caso seguiu por outro caminho). */
  nextOpen: boolean
  nextTitle: string
  nextNote: string
  nextDueDate: string
  /** Central do próximo passo (C12): começa com a do combinado feito. */
  nextCentralId: string
}

/** Porquê e caso por trás do combinado, abaixo do título. */
function Context({ item }: { item: ReviewItem }) {
  if (!item.why && !item.watch) return null
  return (
    <span className="flex flex-col gap-0.5 text-xs text-ink-secondary">
      {item.why ? <span>{fill(R.why, { text: item.why })}</span> : null}
      {item.watch ? (
        <Link href={`/watch?open=${item.watch.id}`} target="_blank" rel="noopener" className="w-fit hover:text-ink hover:underline">
          {fill(R.watching, { title: item.watch.title })}
        </Link>
      ) : null}
    </span>
  )
}

const OUTCOMES: { value: Outcome; label: string; key: string }[] = [
  { value: "DONE", label: R.done, key: "f" },
  { value: "PARTIAL", label: R.partial, key: "p" },
  { value: "NOT_DONE", label: R.notDone, key: "n" },
]

const SELECTED: Record<Outcome, string> = {
  DONE: "border-calm bg-calm-wash text-calm",
  PARTIAL: "border-attention bg-attention-wash text-attention",
  NOT_DONE: "border-overdue bg-overdue-wash text-overdue",
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-xs text-overdue">
      {message}
    </p>
  ) : null
}

/**
 * Revisão de um combinado na daily. Os três desfechos são um grupo com uma
 * só parada de Tab: setas movem, Enter/Espaço escolhe, e F / P / N escolhem
 * direto. "Feito" recolhe a linha e leva o foco ao próximo combinado.
 * "Parcial" e "Não feito" abrem, na própria linha, impeditivo (obrigatório),
 * motivo e a escolha entre reagendar (padrão: a data desta daily, D28) e substituir.
 */
export function ReviewRow({
  item,
  state,
  onChange,
  reasons,
  errors,
  groupRef,
  onDone,
  watch,
  centrals,
}: {
  /** C12: centrais do time para o próximo passo; null com o módulo desligado. */
  centrals?: { options: CentralOption[]; onCreate: (option: CentralOption) => void } | null
  item: ReviewItem
  state: ReviewState
  onChange: (patch: Partial<ReviewState>) => void
  reasons: { id: string; label: string }[]
  /** Erros por campo (blockerText, newDueDate, replacementTitle, replacementDueDate, next*). */
  errors: Record<string, string | undefined>
  /** Grupo de desfechos, para o formulário mover o foco entre linhas. */
  groupRef: (el: HTMLDivElement | null) => void
  /** Chamado depois de "Feito", para o foco seguir para a próxima linha. */
  onDone: () => void
  /** P21: "Colocar em observação", mostrado só em Parcial / Não feito (o momento de maior valor). */
  watch?: (blockerText: string) => React.ReactNode
}) {
  const blockerRef = React.useRef<HTMLInputElement>(null)
  const nextRef = React.useRef<HTMLInputElement>(null)
  const [focusIndex, setFocusIndex] = React.useState(0)
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([])
  const idBase = `review-${item.id}`

  function choose(outcome: Outcome) {
    onChange({ outcome })
    if (outcome === "DONE") onDone()
    else requestAnimationFrame(() => blockerRef.current?.focus())
  }

  function onGroupKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const shortcut = OUTCOMES.find((o) => o.key === event.key.toLowerCase())
    if (shortcut) {
      event.preventDefault()
      choose(shortcut.value)
      return
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault()
      const next = (focusIndex + (event.key === "ArrowRight" ? 1 : 2)) % 3
      setFocusIndex(next)
      buttons.current[next]?.focus()
    }
  }

  if (item.reviewed) {
    const r = item.reviewed
    const detail = [
      r.blockerText,
      r.newDueDate ? fill(labels.dailies.edit.newDue, { date: formatDayMonth(r.newDueDate, "business") }) : null,
      r.replacement ? fill(labels.dailies.edit.replacedBy, { title: r.replacement }) : null,
    ].filter(Boolean)
    return (
      <li className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1.5 last:border-b-0">
        <StatusPill severity={r.outcome === "DONE" ? "calm" : r.outcome === "PARTIAL" ? "attention" : "overdue"} label={OUTCOMES.find((o) => o.value === r.outcome)!.label} />
        <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary">{item.title}</span>
        {detail.length ? <span className="text-xs text-ink-secondary">{detail.join(" · ")}</span> : null}
        <MetaLabel>{labels.dailies.edit.reviewedHere}</MetaLabel>
      </li>
    )
  }

  if (state.outcome === "DONE") {
    return (
      <li className={cn("flex flex-col gap-2 border-b border-line px-3 py-1.5 last:border-b-0", state.nextOpen && "bg-surface-sunken/60 pb-3")}>
        <div className="flex min-h-10 items-center gap-3">
          <StatusPill severity="calm" label={R.done} />
          <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary line-through decoration-line-strong">
            {item.title}
          </span>
          {state.nextOpen ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange({ nextOpen: true })
                requestAnimationFrame(() => nextRef.current?.focus())
              }}
            >
              {R.nextStep}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ outcome: null, nextOpen: false })}>
            {R.undo}
          </Button>
        </div>
        {state.nextOpen ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <div className="flex min-w-48 flex-1 flex-col gap-1">
                <Input
                  ref={nextRef}
                  aria-label={R.nextTitle}
                  value={state.nextTitle}
                  maxLength={160}
                  autoComplete="off"
                  placeholder={R.nextTitle}
                  className="h-8"
                  aria-invalid={Boolean(errors.nextTitle)}
                  onChange={(e) => onChange({ nextTitle: e.target.value })}
                />
                <FieldError id={`${idBase}-ntitle-error`} message={errors.nextTitle} />
              </div>
              {centrals ? (
                <div className="flex w-full flex-col gap-1 sm:w-48">
                  <CentralCombobox
                    aria-label={labels.centrals.field}
                    options={centrals.options}
                    value={state.nextCentralId || null}
                    onValueChange={(id) => onChange({ nextCentralId: id ?? "" })}
                    onCreate={centrals.onCreate}
                    inputClassName="h-8"
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-1">
                <Input
                  aria-label={R.nextDueDate}
                  value={state.nextDueDate}
                  inputMode="numeric"
                  placeholder={labels.forms.datePlaceholder}
                  autoComplete="off"
                  className="h-8 w-32 font-mono"
                  aria-invalid={Boolean(errors.nextDueDate)}
                  onChange={(e) => onChange({ nextDueDate: maskDateInput(e.target.value) })}
                />
                <FieldError id={`${idBase}-ndue-error`} message={errors.nextDueDate} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Input
                aria-label={R.nextNote}
                value={state.nextNote}
                maxLength={300}
                autoComplete="off"
                placeholder={R.nextNotePlaceholder}
                className="h-8"
                aria-invalid={Boolean(errors.nextNote)}
                onChange={(e) => onChange({ nextNote: e.target.value })}
              />
              <FieldError id={`${idBase}-nnote-error`} message={errors.nextNote} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ink-secondary">{item.watch ? fill(R.nextNoteWatch, { title: item.watch.title }) : null}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange({ nextOpen: false, nextTitle: "", nextNote: "" })}
              >
                {R.nextStepRemove}
              </Button>
            </div>
          </div>
        ) : null}
      </li>
    )
  }

  const open = state.outcome === "PARTIAL" || state.outcome === "NOT_DONE"

  return (
    <li className={cn("flex flex-col gap-3 border-b border-line px-3 py-3 last:border-b-0", open && "bg-surface-sunken/60")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-1">
            <span className="text-sm font-medium text-ink">{item.title}</span>
            {open && watch ? watch(state.blockerText) : null}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {item.centralName ? <span className="text-xs text-ink-secondary">{item.centralName}</span> : null}
            <DueCell row={{ dueDate: item.dueDate, open: true, deadline: item.deadline }} />
            {/* Arrasto visível na linha, sem depender de hover: 3+ vira selo vermelho "arrastado Nx". */}
            {item.reschedules > 0 ? <DragIndicator reschedules={item.reschedules} /> : null}
            {item.fromPreviousDaily ? <MetaLabel>{R.fromPreviousDaily}</MetaLabel> : null}
          </span>
          <Context item={item} />
        </div>
        <div
          ref={groupRef}
          role="group"
          aria-label={`${R.outcomes}: ${item.title}`}
          aria-describedby="review-key-hint"
          onKeyDown={onGroupKeyDown}
          className="flex shrink-0 gap-1.5"
        >
          {OUTCOMES.map((o, i) => (
            <button
              key={o.value}
              ref={(el) => {
                buttons.current[i] = el
              }}
              type="button"
              tabIndex={i === focusIndex ? 0 : -1}
              aria-pressed={state.outcome === o.value}
              onFocus={() => setFocusIndex(i)}
              onClick={() => choose(o.value)}
              className={cn(
                "inline-flex h-9 min-w-24 items-center justify-center rounded-sm border px-4 text-sm font-medium transition-colors",
                state.outcome === o.value ? SELECTED[o.value] : "border-line bg-surface text-ink hover:bg-surface-sunken",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {open ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idBase}-blocker`} className="sr-only">
                {R.blocker}
              </label>
              <Input
                ref={blockerRef}
                id={`${idBase}-blocker`}
                value={state.blockerText}
                maxLength={300}
                autoComplete="off"
                placeholder={R.blockerPlaceholder}
                aria-invalid={Boolean(errors.blockerText)}
                aria-describedby={errors.blockerText ? `${idBase}-blocker-error` : undefined}
                aria-required
                onChange={(e) => onChange({ blockerText: e.target.value })}
              />
              <FieldError id={`${idBase}-blocker-error`} message={errors.blockerText} />
            </div>
            <Select
              value={state.blockerReasonId || NO_REASON}
              onValueChange={(v) => onChange({ blockerReasonId: v === NO_REASON ? "" : v })}
            >
              <SelectTrigger aria-label={R.reason} className="w-full">
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
          </div>

          <fieldset className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <legend className="sr-only">{R.action}</legend>
            {(["reschedule", "replace"] as const).map((action) => (
              <label key={action} className="flex h-8 items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name={`${idBase}-action`}
                  value={action}
                  checked={state.action === action}
                  onChange={() => onChange({ action })}
                  className="size-4 accent-[var(--accent)]"
                />
                {action === "reschedule" ? R.reschedule : R.replace}
              </label>
            ))}
            {state.action === "reschedule" ? (
              <div className="flex flex-col gap-1">
                <Input
                  aria-label={R.newDueDate}
                  value={state.newDueDate}
                  inputMode="numeric"
                  placeholder={labels.forms.datePlaceholder}
                  autoComplete="off"
                  className="h-8 w-32 font-mono"
                  aria-invalid={Boolean(errors.newDueDate)}
                  onChange={(e) => onChange({ newDueDate: maskDateInput(e.target.value) })}
                />
                <FieldError id={`${idBase}-due-error`} message={errors.newDueDate} />
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                <div className="flex min-w-48 flex-1 flex-col gap-1">
                  <Input
                    aria-label={R.replacementTitle}
                    value={state.replacementTitle}
                    maxLength={160}
                    autoComplete="off"
                    placeholder={R.replacementTitle}
                    className="h-8"
                    aria-invalid={Boolean(errors.replacementTitle)}
                    onChange={(e) => onChange({ replacementTitle: e.target.value })}
                  />
                  <FieldError id={`${idBase}-rtitle-error`} message={errors.replacementTitle} />
                </div>
                <div className="flex flex-col gap-1">
                  <Input
                    aria-label={R.replacementDueDate}
                    value={state.replacementDueDate}
                    inputMode="numeric"
                    placeholder={labels.forms.datePlaceholder}
                    autoComplete="off"
                    className="h-8 w-32 font-mono"
                    aria-invalid={Boolean(errors.replacementDueDate)}
                    onChange={(e) => onChange({ replacementDueDate: maskDateInput(e.target.value) })}
                  />
                  <FieldError id={`${idBase}-rdue-error`} message={errors.replacementDueDate} />
                </div>
              </div>
            )}
          </fieldset>
        </div>
      ) : null}
    </li>
  )
}
