"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { XIcon } from "lucide-react"

import { createDaily, discardDaily, updateDaily } from "@/actions/dailies"
import { DisclosureToggle, FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { WatchButton } from "@/components/watch/watch-button"
import type { WatchHeat } from "@/lib/watch"
import { CentralCombobox, type CentralOption } from "@/components/ui/CentralCombobox"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { MetaLabel } from "@/components/ui/meta-label"
import { Section } from "@/components/ui/section"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DesktopHint } from "@/components/ui/desktop-hint"
import { formatDate, formatDayMonth, formatTime, maskDateInput, parseDisplayDate, todayBusinessDate } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { fieldErrorsOf } from "@/lib/validators/fields"
import { dailySchema, editDailySchema, type DailyInput } from "@/lib/validators/daily"
import type { DailyForm as DailyFormData } from "@/server/queries/dailies"
import type { WhatsAppDaily } from "@/server/whatsapp"

import { CopyWhatsAppButton } from "./copy-whatsapp-button"
import { ReviewRow, type ReviewState } from "./review-row"

const L = labels.dailies
/** Rascunho por time (multi-time). A chave antiga, única, ainda é lida uma vez para não perder o que já estava salvo. */
const LEGACY_DRAFT_KEY = "prontuario.daily-draft"
const draftKey = (teamId: string) => `${LEGACY_DRAFT_KEY}:${teamId}`
const editDraftKey = (dailyId: string) => `prontuario.daily-edit-draft:${dailyId}`
/** Grava pouco depois de cada alteração (antes: a cada 10 s, e os últimos segundos se perdiam). */
const DRAFT_DEBOUNCE_MS = 600

interface ParticipantState {
  present: boolean
  note: string
  isBlocker: boolean
  /** P21: observações criadas nesta nota (ligadas à daily ao salvar) e o grau da última. */
  watchIds?: string[]
  watchHeat?: WatchHeat
}

interface NewRow {
  key: string
  /** C11: combinado já criado nesta daily (edição). */
  id?: string
  /** Já revisado ou encerrado: aparece só para leitura. */
  locked?: boolean
  /** Marcado para remover ao salvar. */
  remove?: boolean
  memberId: string
  /** Central (P19): opcional, "" = sem. */
  centralId: string
  /** P21: observações criadas nesta linha (ligadas ao combinado ao salvar) e o grau da última. */
  watchIds?: string[]
  watchHeat?: WatchHeat
  title: string
  /** Por quê (opcional): o problema por trás do combinado. */
  why?: string
  dueDate: string
}

/** P26: decisão do gestor sobre uma proposta do time (nenhuma = continua pendente). */
interface ProposalState {
  action: "accept" | "discard" | null
  /** "Editar e aceitar": título e prazo abertos para ajuste. */
  editing: boolean
  title: string
  dueDate: string
  managerNote: string
}

interface FormState {
  reviews: Record<string, ReviewState>
  participants: Record<string, ParticipantState>
  rows: NewRow[]
  summary: string
  decisions: string
  proposals: Record<string, ProposalState>
}

interface Draft extends FormState {
  version: 1
  date: string
  savedAt: string
  /** C11: rascunho da edição de uma daily salva (um por daily). */
  dailyId?: string
}

let rowSeq = 0
const newRow = (dueDate: string): NewRow => ({ key: `row-${++rowSeq}`, memberId: "", centralId: "", title: "", dueDate })
const rowIsEmpty = (row: NewRow) => !row.id && !row.memberId && !row.title.trim()

type ReviewItemData = DailyFormData["review"][number]["items"][number]

/**
 * P26: a linha como a pessoa relatou — desfecho, impeditivo, motivo e o prazo sugerido
 * no reagendamento. É o estado inicial da linha e o "voltar ao relato".
 */
function reportPatch(item: ReviewItemData, dailyDate: string): Partial<ReviewState> | null {
  const r = item.selfReport
  if (!r) return null
  return {
    outcome: r.outcome,
    blockerText: r.blockerText ?? "",
    blockerReasonId: r.blockerReasonId ?? "",
    action: "reschedule",
    newDueDate: r.suggestedDueDate ? formatDate(r.suggestedDueDate, "business") : dailyDate,
  }
}

/** A linha ainda está como a pessoa relatou? (desfecho, impeditivo, motivo, reagendamento) */
function matchesReport(state: ReviewState, report: Partial<ReviewState>): boolean {
  return (Object.keys(report) as (keyof ReviewState)[]).every((k) => state[k] === report[k])
}

/** Prazos nascem com a data da própria daily, também na retroativa (D28): o combinado é o compromisso do dia. */
function initialState(form: DailyFormData, dailyDate: string): FormState {
  const reviews: Record<string, ReviewState> = {}
  const proposals: Record<string, ProposalState> = {}
  for (const p of form.proposals) proposals[p.id] = { action: null, editing: false, title: p.title, dueDate: dailyDate, managerNote: "" }
  for (const group of form.review) {
    for (const item of group.items) {
      reviews[item.id] = {
        outcome: null,
        blockerText: "",
        blockerReasonId: "",
        action: "reschedule",
        newDueDate: dailyDate,
        replacementTitle: "",
        replacementDueDate: dailyDate,
        nextOpen: false,
        nextTitle: "",
        nextNote: "",
        nextDueDate: dailyDate,
        nextCentralId: item.centralId ?? "",
        // P26: a linha com relato chega pronta — editável pelo gestor.
        ...reportPatch(item, dailyDate),
      }
    }
  }
  const participants: Record<string, ParticipantState> = {}
  for (const m of form.members) participants[m.id] = { present: true, note: "", isBlocker: false }
  const edit = form.edit
  if (!edit) return { reviews, participants, rows: [newRow(dailyDate)], summary: "", decisions: "", proposals }
  // C11: edição — o que a daily gravou, mais uma linha vazia para acrescentar.
  for (const p of edit.participants) participants[p.memberId] = { present: p.present, note: p.blocker ?? p.note ?? "", isBlocker: p.blocker !== null }
  const rows: NewRow[] = edit.rows.map((r) => ({
    key: `row-${r.id}`,
    id: r.id,
    locked: r.locked,
    memberId: r.memberId,
    centralId: r.centralId ?? "",
    title: r.title,
    why: r.why ?? "",
    dueDate: formatDate(r.dueDate, "business"),
  }))
  return { reviews, participants, rows: [...rows, newRow(dailyDate)], summary: edit.summary ?? "", decisions: edit.decisions ?? "", proposals }
}

/** Rascunho só vale para a mesma daily e só para o que ainda existe na tela. */
function restore(base: FormState, draft: Draft): FormState {
  const reviews = { ...base.reviews }
  // Rascunho de antes do "próximo passo" não tem os campos novos: completa com os da tela.
  for (const [id, review] of Object.entries(draft.reviews ?? {})) if (id in reviews) reviews[id] = { ...reviews[id]!, ...review }
  const participants = { ...base.participants }
  for (const [id, p] of Object.entries(draft.participants ?? {})) if (id in participants) participants[id] = p
  const rows = (draft.rows ?? []).filter((r) => !rowIsEmpty(r) || r === draft.rows?.[draft.rows.length - 1])
  // Na edição, linha travada vem sempre da tela (pode ter sido revisada depois do rascunho).
  const locked = new Map(base.rows.filter((r) => r.id).map((r) => [r.id!, r]))
  if (locked.size) {
    const kept = rows.filter((r) => !r.id || (locked.has(r.id) && !locked.get(r.id)!.locked))
    const missing = base.rows.filter((r) => r.id && (r.locked || !kept.some((k) => k.id === r.id)))
    rows.splice(0, rows.length, ...missing, ...kept)
  }
  return {
    reviews,
    participants,
    rows: rows.length ? rows.map((r) => ({ ...r, centralId: r.centralId ?? "", key: `row-${++rowSeq}` })) : base.rows,
    summary: draft.summary ?? "",
    decisions: draft.decisions ?? "",
    // Só as propostas que ainda estão na tela (resolvidas em outra aba somem).
    proposals: Object.fromEntries(
      Object.entries(base.proposals).map(([id, p]) => [id, draft.proposals?.[id] ? { ...p, ...draft.proposals[id] } : p]),
    ),
  }
}

function readDraft(teamId: string, date: string, dailyId?: string): Draft | null {
  try {
    if (dailyId) {
      const raw = localStorage.getItem(editDraftKey(dailyId))
      const draft = raw ? (JSON.parse(raw) as Draft) : null
      return draft?.version === 1 && draft.dailyId === dailyId ? draft : null
    }
    const raw = localStorage.getItem(draftKey(teamId)) ?? localStorage.getItem(LEGACY_DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as Draft
    if (draft.version !== 1) return null
    if (draft.date === date) return draft
    // C10: página aberta desde outro dia e recarregada — o rascunho vem para a daily de hoje,
    // com os prazos que eram "o dia da daily" trocados para o dia novo.
    const today = formatDate(todayBusinessDate(), "business")
    const older = parseDisplayDate(draft.date)
    if (date !== today || !older || older >= todayBusinessDate()) return null
    return retarget(draft, date)
  } catch {
    return null
  }
}

function retarget(draft: Draft, date: string): Draft {
  const swap = (value: string) => (value === draft.date ? date : value)
  const reviews: Record<string, ReviewState> = {}
  for (const [id, r] of Object.entries(draft.reviews ?? {})) {
    reviews[id] = {
      ...r,
      newDueDate: swap(r.newDueDate),
      replacementDueDate: swap(r.replacementDueDate),
      nextDueDate: swap(r.nextDueDate ?? date),
    }
  }
  return { ...draft, date, reviews, rows: (draft.rows ?? []).map((r) => ({ ...r, dueDate: swap(r.dueDate) })) }
}

function writeDraft(teamId: string, draft: Draft) {
  try {
    localStorage.setItem(draft.dailyId ? editDraftKey(draft.dailyId) : draftKey(teamId), JSON.stringify(draft))
  } catch {
    // armazenamento indisponível (janela privada, cota): o formulário segue sem rascunho
  }
}

function clearDraft(teamId: string, dailyId?: string) {
  try {
    if (dailyId) return localStorage.removeItem(editDraftKey(dailyId))
    localStorage.removeItem(draftKey(teamId))
    localStorage.removeItem(LEGACY_DRAFT_KEY)
  } catch {
    // idem
  }
}

/**
 * /dailies/new. Três seções em sequência: revisão dos combinados, participantes
 * e notas, combinados de hoje — mais resumo e decisões recolhidos. Pensado
 * para teclado: foco começa no primeiro combinado, F/P/N decidem, Tab anda
 * pessoa a pessoa, Enter acrescenta combinado, Ctrl/⌘+Enter salva tudo.
 * Rascunho no localStorage pouco depois de cada alteração e no instante de salvar
 * (só neste navegador, por time). Se a chamada ao servidor falhar — rede, ou um
 * deploy no meio do preenchimento —, o formulário avisa e nada se perde.
 */
export function DailyForm({ form }: { form: DailyFormData }) {
  const router = useRouter()
  const editId = form.edit?.dailyId
  const savedDate = formatDate(form.date, "business")
  // C11: na edição, a data é um campo; o que estava no "dia da daily" acompanha a troca.
  const [dateInput, setDateInput] = React.useState(savedDate)
  const [dateText, setDateText] = React.useState(savedDate)
  const [state, setState] = React.useState<FormState>(() => initialState(form, savedDate))
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

  // Na edição, as revisões já gravadas ficam fora (travadas).
  const reviewOrder = React.useMemo(
    () => form.review.flatMap((g) => g.items.filter((i) => !i.reviewed).map((i) => i.id)),
    [form.review],
  )
  const memberName = React.useMemo(() => new Map(form.members.map((m) => [m.id, m.preferredName])), [form.members])
  // Centrais ativas + as criadas nesta daily (o combobox de uma linha cria; as outras linhas já enxergam).
  const [centrals, setCentrals] = React.useState<CentralOption[]>(form.centrals)
  // P21: Alt+O na nota abre o "Colocar em observação" daquela pessoa.
  const [watchSignal, setWatchSignal] = React.useState<Record<string, number>>({})
  const centralName = React.useMemo(() => new Map(centrals.map((c) => [c.id, c.name])), [centrals])
  const addCentral = React.useCallback(
    (option: CentralOption) => setCentrals((list) => (list.some((c) => c.id === option.id) ? list : [...list, option])),
    [],
  )
  const reviewOwner = React.useMemo(() => {
    const map = new Map<string, { name: string; title: string; central: string | null }>()
    for (const g of form.review) for (const i of g.items) map.set(i.id, { name: g.member.preferredName, title: i.title, central: i.centralName })
    return map
  }, [form.review])

  // Restaura o rascunho depois de montar (localStorage não existe no servidor).
  React.useEffect(() => {
    const draft = readDraft(form.teamId, savedDate, editId)
    if (draft) {
      setState(restore(initialState(form, savedDate), draft))
      if (editId && draft.date !== savedDate) {
        setDateInput(draft.date)
        setDateText(draft.date)
      }
      setRestoredAt(formatTime(new Date(draft.savedAt)))
    }
    // Foco inicial: primeiro combinado a revisar; sem revisão, a primeira nota.
    const first = groups.current[0]?.querySelector<HTMLButtonElement>("button[tabindex='0']")
    if (first) first.focus()
    else noteRefs.current[form.members[0]?.id ?? ""]?.focus()
  }, [savedDate, form, editId])

  const persistDraft = React.useCallback(
    () =>
      writeDraft(form.teamId, {
        ...stateRef.current,
        version: 1,
        date: dateText,
        savedAt: new Date().toISOString(),
        ...(editId ? { dailyId: editId } : {}),
      }),
    [form.teamId, dateText, editId],
  )

  /** C11: trocar a data na edição leva junto os prazos que eram "o dia da daily". */
  function changeDate(value: string) {
    const masked = maskDateInput(value)
    setDateInput(masked)
    if (!parseDisplayDate(masked) || masked === dateText) return
    const from = dateText
    const swap = (v: string) => (v === from ? masked : v)
    setState((s) => ({
      ...s,
      rows: s.rows.map((r) => (r.locked ? r : { ...r, dueDate: swap(r.dueDate) })),
      reviews: Object.fromEntries(
        Object.entries(s.reviews).map(([id, r]) => [
          id,
          { ...r, newDueDate: swap(r.newDueDate), replacementDueDate: swap(r.replacementDueDate), nextDueDate: swap(r.nextDueDate) },
        ]),
      ),
    }))
    setDateText(masked)
  }
  // A cada alteração (com um respiro curto para não gravar a cada tecla).
  const touched = React.useRef(false)
  React.useEffect(() => {
    if (!touched.current) {
      touched.current = true
      return
    }
    const timer = setTimeout(persistDraft, DRAFT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state, persistDraft])

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
    const row = newRow(dateText)
    setState((s) => ({ ...s, rows: [...s.rows, row] }))
    requestAnimationFrame(() => rowMemberRefs.current[row.key]?.focus())
  }

  function buildInput(current: FormState): { input: DailyInput; reviewIds: string[]; rowKeys: string[] } {
    const reviewIds = reviewOrder.filter((id) => current.reviews[id]?.outcome)
    const rows = current.rows.filter((r) => !rowIsEmpty(r) && !r.locked)
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
            ...(r.outcome === "DONE" && r.nextOpen
              ? { nextTitle: r.nextTitle, nextNote: r.nextNote, nextDueDate: r.nextDueDate, nextCentralId: r.nextCentralId ?? "" }
              : { nextTitle: "", nextNote: "", nextDueDate: "", nextCentralId: "" }),
          }
        }),
        participants: form.members.map((m) => ({ memberId: m.id, ...current.participants[m.id]!, watchIds: current.participants[m.id]!.watchIds ?? [] })),
        draftId: form.draft?.id ?? "",
        proposals: Object.entries(current.proposals).flatMap(([id, p]) =>
          p.action ? [{ id, action: p.action, title: p.title, dueDate: p.dueDate, managerNote: p.managerNote }] : [],
        ),
        newAgreements: rows.map((r) => ({
          ...(editId ? { id: r.id ?? "", remove: r.remove ?? false } : {}),
          memberId: r.memberId,
          centralId: r.centralId,
          watchIds: r.watchIds ?? [],
          title: r.title,
          why: form.whyEnabled ? (r.why ?? "") : "",
          dueDate: r.dueDate,
        })),
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
    if (editId) return saveEdit(input, reviewIds, rowKeys)
    const parsed = dailySchema.safeParse(input)
    if (!parsed.success) {
      setErrors(keyedErrors(fieldErrorsOf(parsed.error), reviewIds, rowKeys))
      setFormError(labels.validation.generic)
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus())
      return
    }
    setErrors({})
    persistDraft()
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createDaily>>
      try {
        result = await createDaily(parsed.data)
      } catch {
        // Rede ou deploy no meio do caminho: a página não cai, o rascunho já está gravado.
        setFormError(L.saveFailed)
        return
      }
      if (result.ok) {
        clearDraft(form.teamId)
        router.push(`/dailies/${result.id}`)
        return
      }
      setFormError(result.error)
      if (result.fieldErrors) setErrors(keyedErrors(result.fieldErrors, reviewIds, rowKeys))
    })
  }

  // P26: descartar a daily aberta (relatos e propostas voltam a ficar pendentes).
  const [confirmDiscard, setConfirmDiscard] = React.useState(false)
  const [discardError, setDiscardError] = React.useState<string | null>(null)
  const [discarding, startDiscard] = React.useTransition()
  function discard() {
    if (!form.draft) return
    setDiscardError(null)
    startDiscard(async () => {
      const result = await discardDaily({ id: form.draft!.id })
      if (!result.ok) return setDiscardError(result.error)
      clearDraft(form.teamId)
      setConfirmDiscard(false)
      router.push("/dailies/new")
      router.refresh()
    })
  }

  function saveEdit(input: DailyInput, reviewIds: string[], rowKeys: string[]) {
    const parsed = editDailySchema.safeParse({ ...input, id: editId, date: dateInput })
    if (!parsed.success) {
      const raw = fieldErrorsOf(parsed.error)
      setErrors(keyedErrors(raw, reviewIds, rowKeys))
      setFormError(raw.date ?? labels.validation.generic)
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus())
      return
    }
    setErrors({})
    persistDraft()
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof updateDaily>>
      try {
        result = await updateDaily(parsed.data)
      } catch {
        setFormError(L.saveFailed)
        return
      }
      if (result.ok) {
        clearDraft(form.teamId, editId)
        router.push(`/dailies/${editId}`)
        router.refresh()
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
      teamName: form.teamName,
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
      created: [
        // Próximos passos de combinados feitos: nascem nesta daily, para a mesma pessoa e cliente.
        ...input.reviews.flatMap((r) => {
          const due = parseDisplayDate(r.nextDueDate)
          const owner = reviewOwner.get(r.agreementId)
          return r.outcome === "DONE" && r.nextTitle.trim() && due && owner
            ? [
                {
                  name: owner.name,
                  central: (r.nextCentralId ? centralName.get(r.nextCentralId) : null) ?? owner.central,
                  title: r.nextTitle,
                  dueDate: due,
                  why: form.whyEnabled ? r.nextNote || null : null,
                },
              ]
            : []
        }),
        ...input.newAgreements.flatMap((a) => {
          const due = parseDisplayDate(a.dueDate)
          return a.memberId && a.title.trim() && due
            ? [{ name: memberName.get(a.memberId) ?? "", central: centralName.get(a.centralId) ?? null, title: a.title, dueDate: due, why: form.whyEnabled ? a.why || null : null }]
            : []
        }),
        // P26: propostas aceitas viram combinados desta daily.
        ...input.proposals.flatMap((p) => {
          const due = parseDisplayDate(p.dueDate)
          const proposal = form.proposals.find((x) => x.id === p.id)
          return p.action === "accept" && due && proposal ? [{ name: proposal.memberName, central: null, title: p.title, dueDate: due }] : []
        }),
      ],
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
      {form.draft ? (
        <p
          role="status"
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            form.draft.locking ? "border-line bg-surface-sunken text-ink-secondary" : "border-attention bg-attention-wash text-attention",
          )}
        >
          {form.draft.locking ? fill(L.opening.openedAt, { time: formatTime(form.draft.openedAt!) }) : L.opening.expired}
        </p>
      ) : null}
      {restoredAt ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-2">
          <p className="text-sm text-ink-secondary">{fill(L.draft.restored, { time: restoredAt })}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearDraft(form.teamId, editId)
              setState(initialState(form, savedDate))
              setDateInput(savedDate)
              setDateText(savedDate)
              setRestoredAt(null)
            }}
          >
            {L.draft.discard}
          </Button>
        </div>
      ) : null}

      {editId ? (
        <div className="flex flex-col gap-1.5">
          <FieldGroup label={L.edit.date} error={errors.date} required>
            <Input
              value={dateInput}
              inputMode="numeric"
              autoComplete="off"
              placeholder={labels.forms.datePlaceholder}
              className="w-36 font-mono"
              aria-invalid={Boolean(errors.date)}
              onChange={(e) => changeDate(e.target.value)}
            />
          </FieldGroup>
          {dateInput !== savedDate ? <p className="text-xs text-ink-secondary">{L.edit.dateHint}</p> : null}
        </div>
      ) : null}

      {/* SEÇÃO 1 — revisão */}
      <Section
        title={L.review.title}
        count={reviewOrder.length}
        action={
          form.reportStats ? (
            <span className="font-mono text-xs text-ink-secondary">
              {fill(L.opening.reportedOf, { reported: form.reportStats.reported, total: form.reportStats.total })}
            </span>
          ) : undefined
        }
      >
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
                        centrals={form.centralsEnabled ? { options: centrals, onCreate: addCentral } : null}
                        showCase={form.whyEnabled}
                        onChange={(patch) => patchReview(item.id, patch)}
                        watch={(blockerText) => (
                          <WatchButton
                            origin="AGREEMENT"
                            defaults={{ title: item.title, context: blockerText, heat: "HIGH" }}
                            link={{ agreementId: item.id, ...(item.centralId ? { centralId: item.centralId } : {}) }}
                            existing={form.watching[item.id] ?? null}
                            skipTab
                          />
                        )}
                        errors={{
                          blockerText: errors[`review:${item.id}:blockerText`],
                          newDueDate: errors[`review:${item.id}:newDueDate`],
                          replacementTitle: errors[`review:${item.id}:replacementTitle`],
                          replacementDueDate: errors[`review:${item.id}:replacementDueDate`],
                          nextTitle: errors[`review:${item.id}:nextTitle`],
                          nextNote: errors[`review:${item.id}:nextNote`],
                          nextDueDate: errors[`review:${item.id}:nextDueDate`],
                        }}
                        groupRef={(el) => {
                          groups.current[index] = el
                        }}
                        onDone={() => focusAfterReview(index)}
                        report={(() => {
                          const original = reportPatch(item, dateText)
                          if (!original || !item.selfReport) return undefined
                          return {
                            line: [
                              fill(L.opening.memberReported, { name: group.member.preferredName, outcome: enumLabel("checkinOutcome", item.selfReport.outcome) }) +
                                (item.selfReport.blockerText ? ` — ${item.selfReport.blockerText}` : ""),
                              item.selfReport.suggestedDueDate
                                ? fill(L.opening.suggested, { date: formatDayMonth(item.selfReport.suggestedDueDate, "business") })
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · "),
                            changed: !matchesReport(state.reviews[item.id]!, original),
                            restoreLabel: fill(L.opening.restore, { name: group.member.preferredName }),
                            restore: () => patchReview(item.id, original),
                          }
                        })()}
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
                    if (e.key.toLowerCase() === "o") {
                      e.preventDefault()
                      setWatchSignal((s) => ({ ...s, [member.id]: (s[member.id] ?? 0) + 1 }))
                    }
                  }}
                />
                {/* P21: a pessoa fala, você já marca — sem sair da daily. Alt+O abre pelo teclado. */}
                <WatchButton
                  origin="DAILY"
                  defaults={{ title: p.note.split("\n")[0] ?? "", heat: "HIGH" }}
                  link={{ memberId: member.id }}
                  existing={p.watchIds?.length ? { id: p.watchIds.at(-1)!, heat: p.watchHeat ?? "HIGH" } : null}
                  pendingHint={labels.watch.button.pending}
                  onCreated={(id, heat) => patchParticipant(member.id, { watchIds: [...(p.watchIds ?? []), id], watchHeat: heat })}
                  skipTab
                  openSignal={watchSignal[member.id] ?? 0}
                  className="shrink-0"
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
        {form.proposals.length ? (
          <ProposalsBlock
            proposals={form.proposals}
            state={state.proposals}
            dailyDate={dateText}
            onChange={(id, patch) => setState((s) => ({ ...s, proposals: { ...s.proposals, [id]: { ...s.proposals[id]!, ...patch } } }))}
          />
        ) : null}
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
            if (row.locked) {
              return (
                <li key={row.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 text-sm last:border-b-0">
                  <span className="w-[132px] shrink-0 truncate text-ink">{memberName.get(row.memberId) ?? ""}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-secondary">{row.title}</span>
                  <span className="font-mono text-xs text-ink-secondary">{row.dueDate}</span>
                  <span className="basis-full text-xs text-ink-secondary">{L.edit.rowLocked}</span>
                </li>
              )
            }
            if (row.remove) {
              return (
                <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-sunken px-3 py-2 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary line-through">{fill(L.edit.removed, { title: row.title })}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => patchRow(row.key, { remove: false })}>
                    {L.edit.undoRemove}
                  </Button>
                </li>
              )
            }
            return (
              <li key={row.key} className="flex flex-col gap-1 border-b border-line px-3 py-1.5 last:border-b-0">
                <div
                  className={cn(
                    "grid items-center gap-2 max-sm:grid-cols-[1fr_120px_32px_32px]",
                    form.centralsEnabled
                      ? "grid-cols-[132px_160px_minmax(0,1fr)_112px_32px_32px]"
                      : "grid-cols-[132px_minmax(0,1fr)_112px_32px_32px]",
                  )}
                >
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
                  {/* Central (P19): opcional; Tab passa direto para o título. Só com o módulo ligado (D32). */}
                  {form.centralsEnabled ? (
                    <CentralCombobox
                      aria-label={`${labels.centrals.field} ${i + 1}`}
                      options={centrals}
                      value={row.centralId || null}
                      onValueChange={(id) => patchRow(row.key, { centralId: id ?? "" })}
                      onCreate={addCentral}
                      onKeyDown={onEnter}
                      className="max-sm:col-span-3"
                      inputClassName="h-8"
                    />
                  ) : null}
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
                  <WatchButton
                    origin="AGREEMENT"
                    defaults={{ title: row.title, heat: "MEDIUM" }}
                    link={{ ...(row.memberId ? { memberId: row.memberId } : {}), ...(row.centralId ? { centralId: row.centralId } : {}) }}
                    existing={row.watchIds?.length ? { id: row.watchIds.at(-1)!, heat: row.watchHeat ?? "MEDIUM" } : null}
                    pendingHint={labels.watch.button.pending}
                    onCreated={(id, heat) => patchRow(row.key, { watchIds: [...(row.watchIds ?? []), id], watchHeat: heat })}
                    skipTab
                  />
                  <Button
                    type="button"
                    tabIndex={-1}
                    variant="ghost"
                    size="icon-sm"
                    aria-label={row.id ? L.edit.removeRow : L.newAgreements.remove}
                    disabled={state.rows.length === 1 && rowIsEmpty(row)}
                    onClick={() =>
                      row.id
                        ? patchRow(row.key, { remove: true })
                        : setState((s) => ({
                            ...s,
                            rows: s.rows.filter((r) => !r.id).length === 1 ? [...s.rows.filter((r) => r.id), newRow(dateText)] : s.rows.filter((r) => r.key !== row.key),
                          }))
                    }
                  >
                    <XIcon />
                  </Button>
                </div>
                {form.whyEnabled && (row.memberId || row.title.trim() || row.why) ? (
                  <Input
                    aria-label={`${L.newAgreements.why} ${i + 1}`}
                    value={row.why ?? ""}
                    maxLength={300}
                    autoComplete="off"
                    placeholder={L.newAgreements.whyPlaceholder}
                    className="h-7 text-xs"
                    onChange={(e) => patchRow(row.key, { why: e.target.value })}
                    onKeyDown={onEnter}
                  />
                ) : null}
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
        {/* Na edição, o texto do WhatsApp sai do detalhe da daily, já com o que estava gravado. */}
        {editId ? <span /> : <CopyWhatsAppButton daily={whatsapp} />}
        <div className="flex flex-wrap items-center gap-3">
          <FormError message={formError} />
          <span className="font-mono text-2xs text-ink-secondary max-sm:hidden">{L.saveHint}</span>
          {editId ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => router.push(`/dailies/${editId}`)}>
              {L.edit.cancel}
            </Button>
          ) : null}
          {form.draft ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => setConfirmDiscard(true)}>
              {L.opening.discard}
            </Button>
          ) : null}
          <Button type="submit" loading={pending}>
            {editId ? L.edit.submit : L.save}
          </Button>
        </div>
      </div>
      {form.draft ? (
        <Dialog open={confirmDiscard} onOpenChange={(next) => !discarding && setConfirmDiscard(next)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{L.opening.discardTitle}</DialogTitle>
              <DialogDescription>{L.opening.discardBody}</DialogDescription>
            </DialogHeader>
            <FormError message={discardError} />
            <DialogFooter>
              <Button type="button" variant="secondary" disabled={discarding} onClick={() => setConfirmDiscard(false)}>
                {labels.common.cancel}
              </Button>
              <Button type="button" variant="destructive" loading={discarding} onClick={discard}>
                {L.opening.discardConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </form>
  )
}

/**
 * P26: propostas que o time fez no portal, capturadas por esta daily. Aceitar cria o
 * combinado da pessoa (prazo: a data da daily, ou o sugerido); descartar guarda uma nota
 * opcional. Sem decisão, a proposta continua pendente para a próxima daily.
 */
function ProposalsBlock({
  proposals,
  state,
  dailyDate,
  onChange,
}: {
  proposals: DailyFormData["proposals"]
  state: Record<string, ProposalState>
  dailyDate: string
  onChange: (id: string, patch: Partial<ProposalState>) => void
}) {
  const P = L.proposals
  return (
    <div className="flex flex-col gap-1.5">
      <MetaLabel className="text-ink">{P.title}</MetaLabel>
      <ul className="rounded-lg border border-line bg-surface">
        {proposals.map((p) => {
          const s = state[p.id]!
          const suggested = p.suggestedDueDate ? formatDate(p.suggestedDueDate, "business") : null
          return (
            <li key={p.id} className="flex flex-col gap-2 border-b border-line px-3 py-2 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xs text-ink-secondary">{fill(P.by, { name: p.memberName })}</span>
                <span className="text-sm font-medium text-ink">{p.title}</span>
                {suggested ? <span className="font-mono text-xs text-ink-secondary">{fill(P.suggestedDue, { date: suggested })}</span> : null}
              </div>
              {p.note ? <p className="text-xs text-ink-secondary">{p.note}</p> : null}
              {s.action === "accept" && !s.editing ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-calm">
                  {fill(P.accepted, { title: s.title, date: s.dueDate })}
                  <Button type="button" variant="ghost" size="sm" onClick={() => onChange(p.id, { action: null, editing: false, title: p.title, dueDate: dailyDate })}>
                    {P.undo}
                  </Button>
                </div>
              ) : s.action === "discard" ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
                    {P.discarded}
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange(p.id, { action: null, managerNote: "" })}>
                      {P.undo}
                    </Button>
                  </div>
                  <Input
                    aria-label={P.note}
                    placeholder={P.note}
                    value={s.managerNote}
                    maxLength={300}
                    autoComplete="off"
                    className="h-8"
                    onChange={(e) => onChange(p.id, { managerNote: e.target.value })}
                  />
                </div>
              ) : s.editing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={P.title_field}
                    value={s.title}
                    maxLength={160}
                    autoComplete="off"
                    className="h-8 min-w-48 flex-1"
                    onChange={(e) => onChange(p.id, { title: e.target.value })}
                  />
                  <Input
                    aria-label={P.due}
                    value={s.dueDate}
                    inputMode="numeric"
                    autoComplete="off"
                    className="h-8 w-32 font-mono"
                    onChange={(e) => onChange(p.id, { dueDate: maskDateInput(e.target.value) })}
                  />
                  {suggested && s.dueDate !== suggested ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange(p.id, { dueDate: suggested })}>
                      {fill(P.useSuggested, { date: suggested })}
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" disabled={s.title.trim().length < 3} onClick={() => onChange(p.id, { action: "accept", editing: false })}>
                    {P.confirm}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => onChange(p.id, { action: "accept" })}>
                    {P.accept}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => onChange(p.id, { editing: true })}>
                    {P.editAccept}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onChange(p.id, { action: "discard" })}>
                    {P.discard}
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
