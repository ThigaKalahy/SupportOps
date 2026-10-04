"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { XIcon } from "lucide-react"

import { createDaily } from "@/actions/dailies"
import { DisclosureToggle, FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { MetaLabel } from "@/components/ui/meta-label"
import { Section } from "@/components/ui/section"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DesktopHint } from "@/components/ui/desktop-hint"
import { formatDate, formatTime, maskDateInput, parseDisplayDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { fieldErrorsOf } from "@/lib/validators/fields"
import { dailySchema, type DailyInput } from "@/lib/validators/daily"
import type { DailyForm as DailyFormData } from "@/server/queries/dailies"
import type { WhatsAppDaily } from "@/server/whatsapp"

import { CopyWhatsAppButton } from "./copy-whatsapp-button"
import { ReviewRow, type ReviewState } from "./review-row"

const L = labels.dailies
const DRAFT_KEY = "prontuario.daily-draft"
const DRAFT_EVERY_MS = 10_000

interface ParticipantState {
  present: boolean
  note: string
  isBlocker: boolean
}

interface NewRow {
  key: string
  memberId: string
  title: string
  dueDate: string
}

interface FormState {
  reviews: Record<string, ReviewState>
  participants: Record<string, ParticipantState>
  rows: NewRow[]
  summary: string
  decisions: string
}

interface Draft extends FormState {
  version: 1
  date: string
  savedAt: string
}

let rowSeq = 0
const newRow = (dueDate: string): NewRow => ({ key: `row-${++rowSeq}`, memberId: "", title: "", dueDate })
const rowIsEmpty = (row: NewRow) => !row.memberId && !row.title.trim()

function initialState(form: DailyFormData, nextDaily: string): FormState {
  const reviews: Record<string, ReviewState> = {}
  for (const group of form.review) {
    for (const item of group.items) {
      reviews[item.id] = {
        outcome: null,
        blockerText: "",
        blockerReasonId: "",
        action: "reschedule",
        newDueDate: nextDaily,
        replacementTitle: "",
        replacementDueDate: nextDaily,
      }
    }
  }
  const participants: Record<string, ParticipantState> = {}
  for (const m of form.members) participants[m.id] = { present: true, note: "", isBlocker: false }
  return { reviews, participants, rows: [newRow(nextDaily)], summary: "", decisions: "" }
}

/** Rascunho só vale para a mesma daily e só para o que ainda existe na tela. */
function restore(base: FormState, draft: Draft): FormState {
  const reviews = { ...base.reviews }
  for (const [id, review] of Object.entries(draft.reviews ?? {})) if (id in reviews) reviews[id] = review
  const participants = { ...base.participants }
  for (const [id, p] of Object.entries(draft.participants ?? {})) if (id in participants) participants[id] = p
  const rows = (draft.rows ?? []).filter((r) => !rowIsEmpty(r) || r === draft.rows?.[draft.rows.length - 1])
  return {
    reviews,
    participants,
    rows: rows.length ? rows.map((r) => ({ ...r, key: `row-${++rowSeq}` })) : base.rows,
    summary: draft.summary ?? "",
    decisions: draft.decisions ?? "",
  }
}

function readDraft(date: string): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as Draft
    return draft.version === 1 && draft.date === date ? draft : null
  } catch {
    return null
  }
}

function writeDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // armazenamento indisponível (janela privada, cota): o formulário segue sem rascunho
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // idem
  }
}

/**
 * /dailies/new. Três seções em sequência: revisão dos combinados, participantes
 * e notas, combinados de hoje — mais resumo e decisões recolhidos. Pensado
 * para teclado: foco começa no primeiro combinado, F/P/N decidem, Tab anda
 * pessoa a pessoa, Enter acrescenta combinado, Ctrl/⌘+Enter salva tudo.
 * Rascunho no localStorage a cada 10 segundos (só neste navegador).
 */
export function DailyForm({ form }: { form: DailyFormData }) {
  const router = useRouter()
  const dateText = formatDate(form.date, "business")
  const nextDaily = formatDate(form.nextDaily, "business")
  const [state, setState] = React.useState<FormState>(() => initialState(form, nextDaily))
  const [restoredAt, setRestoredAt] = React.useState<string | null>(null)
  const [showExtra, setShowExtra] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const groups = React.useRef<(HTMLDivElement | null)[]>([])
  const noteRefs = React.useRef<Record<string, HTMLInputElement | null>>({})
  const rowMemberRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})
  const stateRef = React.useRef(state)
  stateRef.current = state

  const reviewOrder = React.useMemo(() => form.review.flatMap((g) => g.items.map((i) => i.id)), [form.review])
  const memberName = React.useMemo(() => new Map(form.members.map((m) => [m.id, m.preferredName])), [form.members])
  const reviewOwner = React.useMemo(() => {
    const map = new Map<string, { name: string; title: string }>()
    for (const g of form.review) for (const i of g.items) map.set(i.id, { name: g.member.preferredName, title: i.title })
    return map
  }, [form.review])

  // Restaura o rascunho depois de montar (localStorage não existe no servidor).
  React.useEffect(() => {
    const draft = readDraft(dateText)
    if (draft) {
      setState(restore(initialState(form, nextDaily), draft))
      setRestoredAt(formatTime(new Date(draft.savedAt)))
    }
    // Foco inicial: primeiro combinado a revisar; sem revisão, a primeira nota.
    const first = groups.current[0]?.querySelector<HTMLButtonElement>("button[tabindex='0']")
    if (first) first.focus()
    else noteRefs.current[form.members[0]?.id ?? ""]?.focus()
  }, [dateText, form, nextDaily])

  React.useEffect(() => {
    const timer = setInterval(() => {
      writeDraft({ ...stateRef.current, version: 1, date: dateText, savedAt: new Date().toISOString() })
    }, DRAFT_EVERY_MS)
    return () => clearInterval(timer)
  }, [dateText])

  const patchReview = (id: string, patch: Partial<ReviewState>) =>
    setState((s) => ({ ...s, reviews: { ...s.reviews, [id]: { ...s.reviews[id]!, ...patch } } }))
  const patchParticipant = (id: string, patch: Partial<ParticipantState>) =>
    setState((s) => ({ ...s, participants: { ...s.participants, [id]: { ...s.participants[id]!, ...patch } } }))
  const patchRow = (key: string, patch: Partial<NewRow>) =>
    setState((s) => ({ ...s, rows: s.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }))

  function focusAfterReview(index: number) {
    requestAnimationFrame(() => {
      const next = groups.current.slice(index + 1).find(Boolean)
      const target = next?.querySelector<HTMLButtonElement>("button[tabindex='0']") ?? noteRefs.current[form.members[0]?.id ?? ""]
      target?.focus()
    })
  }

  function addRowAfter(key: string) {
    const index = state.rows.findIndex((r) => r.key === key)
    const following = state.rows[index + 1]
    if (following) {
      rowMemberRefs.current[following.key]?.focus()
      return
    }
    const row = newRow(nextDaily)
    setState((s) => ({ ...s, rows: [...s.rows, row] }))
    requestAnimationFrame(() => rowMemberRefs.current[row.key]?.focus())
  }

  function buildInput(current: FormState): { input: DailyInput; reviewIds: string[]; rowKeys: string[] } {
    const reviewIds = reviewOrder.filter((id) => current.reviews[id]?.outcome)
    const rows = current.rows.filter((r) => !rowIsEmpty(r))
    return {
      reviewIds,
      rowKeys: rows.map((r) => r.key),
      input: {
        date: dateText,
        summary: current.summary,
        decisions: current.decisions,
        reviews: reviewIds.map((id) => {
          const r = current.reviews[id]!
          return {
            agreementId: id,
            outcome: r.outcome!,
            blockerText: r.blockerText,
            blockerReasonId: r.blockerReasonId,
            action: r.action,
            newDueDate: r.newDueDate,
            replacementTitle: r.replacementTitle,
            replacementDueDate: r.replacementDueDate,
          }
        }),
        participants: form.members.map((m) => ({ memberId: m.id, ...current.participants[m.id]! })),
        newAgreements: rows.map((r) => ({ memberId: r.memberId, title: r.title, dueDate: r.dueDate })),
      },
    }
  }

  /** Erros do schema ("reviews.2.blockerText") reescritos por id de combinado e chave de linha. */
  function keyedErrors(raw: Record<string, string>, reviewIds: string[], rowKeys: string[]) {
    const out: Record<string, string> = {}
    for (const [path, message] of Object.entries(raw)) {
      const [section, index, field] = path.split(".")
      if (section === "reviews") out[`review:${reviewIds[Number(index)]}:${field}`] = message
      else if (section === "newAgreements") out[`row:${rowKeys[Number(index)]}:${field}`] = message
      else out[path] = message
    }
    return out
  }

  function save() {
    if (pending) return
    setFormError(null)
    const { input, reviewIds, rowKeys } = buildInput(stateRef.current)
    const parsed = dailySchema.safeParse(input)
    if (!parsed.success) {
      setErrors(keyedErrors(fieldErrorsOf(parsed.error), reviewIds, rowKeys))
      setFormError(labels.validation.generic)
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus())
      return
    }
    setErrors({})
    startTransition(async () => {
      const result = await createDaily(parsed.data)
      if (result.ok) {
        clearDraft()
        router.push(`/dailies/${result.id}`)
        return
      }
      setFormError(result.error)
      if (result.fieldErrors) setErrors(keyedErrors(result.fieldErrors, reviewIds, rowKeys))
    })
  }

  // Ctrl/⌘+Enter salva de qualquer campo da página.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !document.querySelector("[role=dialog]")) {
        event.preventDefault()
        save()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  function whatsapp(): WhatsAppDaily {
    const { input } = buildInput(stateRef.current)
    return {
      date: parseDisplayDate(dateText)!,
      reviewed: input.reviews.map((r) => ({
        name: reviewOwner.get(r.agreementId)?.name ?? "",
        title: reviewOwner.get(r.agreementId)?.title ?? "",
        outcome: r.outcome,
        blockerText: r.outcome === "DONE" ? null : r.blockerText,
        newDueDate: r.outcome !== "DONE" && r.action === "reschedule" ? parseDisplayDate(r.newDueDate) : null,
        replacement:
          r.outcome !== "DONE" && r.action === "replace" && parseDisplayDate(r.replacementDueDate)
            ? { title: r.replacementTitle, dueDate: parseDisplayDate(r.replacementDueDate)! }
            : null,
      })),
      created: input.newAgreements.flatMap((a) => {
        const due = parseDisplayDate(a.dueDate)
        return a.memberId && a.title.trim() && due ? [{ name: memberName.get(a.memberId) ?? "", title: a.title, dueDate: due }] : []
      }),
      blockers: input.participants.flatMap((p) =>
        p.isBlocker && p.note.trim() ? [{ name: memberName.get(p.memberId) ?? "", text: p.note }] : [],
      ),
    }
  }

  const presentCount = form.members.filter((m) => state.participants[m.id]?.present).length
  let reviewIndex = -1

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="flex flex-col gap-8"
      noValidate
    >
      <DesktopHint />
      {restoredAt ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2">
          <p className="text-sm text-ink-secondary">{fill(L.draft.restored, { time: restoredAt })}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearDraft()
              setState(initialState(form, nextDaily))
              setRestoredAt(null)
            }}
          >
            {L.draft.discard}
          </Button>
        </div>
      ) : null}

      {/* SEÇÃO 1 — revisão */}
      <Section title={L.review.title} count={reviewOrder.length}>
        <p className="-mt-2 text-xs text-ink-secondary">
          {L.review.direction} <span id="review-key-hint" className="font-mono text-2xs">{L.review.keyHint}</span>
        </p>
        {form.review.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line">
            <EmptyState size="compact" title={L.review.emptyTitle} direction={L.review.emptyDirection} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {form.review.map((group) => (
              <div key={group.member.id} className="flex flex-col gap-1.5">
                <MetaLabel className="text-ink">{group.member.preferredName}</MetaLabel>
                <ul className="rounded-lg border border-line bg-surface">
                  {group.items.map((item) => {
                    reviewIndex++
                    const index = reviewIndex
                    return (
                      <ReviewRow
                        key={item.id}
                        item={item}
                        state={state.reviews[item.id]!}
                        reasons={form.reasons}
                        onChange={(patch) => patchReview(item.id, patch)}
                        errors={{
                          blockerText: errors[`review:${item.id}:blockerText`],
                          newDueDate: errors[`review:${item.id}:newDueDate`],
                          replacementTitle: errors[`review:${item.id}:replacementTitle`],
                          replacementDueDate: errors[`review:${item.id}:replacementDueDate`],
                        }}
                        groupRef={(el) => {
                          groups.current[index] = el
                        }}
                        onDone={() => focusAfterReview(index)}
                      />
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SEÇÃO 2 — participantes e notas */}
      <Section
        title={L.participants.title}
        action={
          <span className="font-mono text-xs text-ink-secondary">
            {fill(L.participants.count, { present: presentCount, total: form.members.length })}
          </span>
        }
      >
        <p className="-mt-2 text-xs text-ink-secondary">
          {L.participants.direction} <span className="font-mono text-2xs">{L.participants.keyHint}</span>
        </p>
        <ul className="rounded-lg border border-line bg-surface">
          {form.members.map((member) => {
            const p = state.participants[member.id]!
            const noteId = `note-${member.id}`
            return (
              <li
                key={member.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3 py-1.5 last:border-b-0 sm:flex-nowrap",
                  !p.present && "bg-surface-sunken",
                )}
              >
                {/* Presença e bloqueio fora do Tab (Alt+A / Alt+B na nota): Tab anda de pessoa em pessoa. */}
                <Checkbox
                  tabIndex={-1}
                  checked={p.present}
                  aria-label={`${L.participants.present}: ${member.preferredName}`}
                  onCheckedChange={(c) => patchParticipant(member.id, { present: c === true })}
                />
                <label
                  htmlFor={noteId}
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm sm:w-24 sm:flex-none sm:shrink-0",
                    p.present ? "text-ink" : "text-ink-secondary line-through",
                  )}
                >
                  {member.preferredName}
                </label>
                <Input
                  ref={(el) => {
                    noteRefs.current[member.id] = el
                  }}
                  id={noteId}
                  value={p.note}
                  maxLength={1000}
                  autoComplete="off"
                  placeholder={fill(L.participants.notePlaceholder, { name: member.preferredName })}
                  className={cn("order-last h-8 basis-full sm:order-none sm:basis-auto sm:flex-1", p.isBlocker && "border-overdue")}
                  onChange={(e) => patchParticipant(member.id, { note: e.target.value })}
                  onKeyDown={(e) => {
                    if (!e.altKey || e.ctrlKey || e.metaKey) return
                    if (e.key.toLowerCase() === "a") {
                      e.preventDefault()
                      patchParticipant(member.id, { present: !p.present })
                    }
                    if (e.key.toLowerCase() === "b") {
                      e.preventDefault()
                      patchParticipant(member.id, { isBlocker: !p.isBlocker })
                    }
                  }}
                />
                <Button
                  type="button"
                  tabIndex={-1}
                  variant="ghost"
                  size="sm"
                  aria-pressed={p.isBlocker}
                  title={p.isBlocker ? L.participants.unmarkBlocker : L.participants.markBlocker}
                  onClick={() => patchParticipant(member.id, { isBlocker: !p.isBlocker })}
                  className={cn("shrink-0", p.isBlocker && "bg-overdue-wash text-overdue hover:bg-overdue-wash hover:text-overdue")}
                >
                  {L.participants.blocker}
                </Button>
              </li>
            )
          })}
        </ul>
      </Section>

      {/* SEÇÃO 3 — combinados de hoje */}
      <Section title={L.newAgreements.title}>
        <p className="-mt-2 text-xs text-ink-secondary">{L.newAgreements.direction}</p>
        <ul className="rounded-lg border border-line bg-surface">
          {state.rows.map((row, i) => {
            const err = (field: string) => errors[`row:${row.key}:${field}`]
            const rowError = err("memberId") ?? err("title") ?? err("dueDate")
            const onEnter = (e: React.KeyboardEvent) => {
              if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                addRowAfter(row.key)
              }
            }
            return (
              <li key={row.key} className="flex flex-col gap-1 border-b border-line px-3 py-1.5 last:border-b-0">
                <div className="grid grid-cols-[132px_minmax(0,1fr)_112px_32px] items-center gap-2 max-sm:grid-cols-[1fr_120px_32px]">
                  <Select value={row.memberId} onValueChange={(v) => patchRow(row.key, { memberId: v })}>
                    <SelectTrigger
                      ref={(el) => {
                        rowMemberRefs.current[row.key] = el
                      }}
                      aria-label={`${L.newAgreements.member} ${i + 1}`}
                      aria-invalid={Boolean(err("memberId"))}
                      size="sm"
                      className="w-full max-sm:col-span-3"
                    >
                      <SelectValue placeholder={L.newAgreements.memberPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {form.members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.preferredName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`${L.newAgreements.agreementTitle} ${i + 1}`}
                    value={row.title}
                    maxLength={160}
                    autoComplete="off"
                    placeholder={L.newAgreements.agreementTitle}
                    className="h-8"
                    aria-invalid={Boolean(err("title"))}
                    onChange={(e) => patchRow(row.key, { title: e.target.value })}
                    onKeyDown={onEnter}
                  />
                  <Input
                    aria-label={`${L.newAgreements.dueDate} ${i + 1}`}
                    value={row.dueDate}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={labels.forms.datePlaceholder}
                    className="h-8 font-mono"
                    aria-invalid={Boolean(err("dueDate"))}
                    onChange={(e) => patchRow(row.key, { dueDate: maskDateInput(e.target.value) })}
                    onKeyDown={onEnter}
                  />
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={L.newAgreements.remove}
                    disabled={state.rows.length === 1 && rowIsEmpty(row)}
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        rows: s.rows.length === 1 ? [newRow(nextDaily)] : s.rows.filter((r) => r.key !== row.key),
                      }))
                    }
                  >
                    <XIcon />
                  </Button>
                </div>
                {rowError ? <p className="text-xs text-overdue">{rowError}</p> : null}
              </li>
            )
          })}
        </ul>
        <Button type="button" variant="ghost" size="sm" className="-ml-2 self-start" onClick={() => addRowAfter(state.rows.at(-1)!.key)}>
          {L.newAgreements.add}
        </Button>
      </Section>

      {/* Resumo e decisões, recolhidos */}
      <div className="flex flex-col gap-4">
        <DisclosureToggle open={showExtra} onToggle={() => setShowExtra((v) => !v)} closedLabel={L.extra.toggle} openLabel={L.extra.toggle} />
        {showExtra ? (
          <div className="grid gap-4 md:grid-cols-2">
            <FieldGroup label={L.extra.summary} error={errors.summary}>
              <Textarea rows={3} value={state.summary} onChange={(e) => setState((s) => ({ ...s, summary: e.target.value }))} />
            </FieldGroup>
            <FieldGroup label={L.extra.decisions} error={errors.decisions}>
              <Textarea rows={3} value={state.decisions} onChange={(e) => setState((s) => ({ ...s, decisions: e.target.value }))} />
            </FieldGroup>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <CopyWhatsAppButton daily={whatsapp} />
        <div className="flex flex-wrap items-center gap-3">
          <FormError message={formError} />
          <span className="font-mono text-2xs text-ink-secondary max-sm:hidden">{L.saveHint}</span>
          <Button type="submit" loading={pending}>
            {L.save}
          </Button>
        </div>
      </div>
    </form>
  )
}
