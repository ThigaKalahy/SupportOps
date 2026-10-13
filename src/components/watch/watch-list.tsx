"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, PencilIcon } from "lucide-react"

import { archiveWatch, changeWatchHeat, loadWatchItem, resolveWatch, reviewWatch, setWatchVisibility, updateWatch } from "@/actions/watch"
import { Button } from "@/components/ui/button"
import { DateStamp } from "@/components/ui/date-stamp"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { MetaLabel } from "@/components/ui/meta-label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SeverityDot } from "@/components/ui/severity-dot"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { StatusPill } from "@/components/ui/status-pill"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { WATCH_PARAMS } from "@/lib/watch-filters"
import { cooler, HEAT_SEVERITY, hotter, WATCH_HEATS, type WatchHeat } from "@/lib/watch"
import type { WatchDetail, WatchRow } from "@/server/queries/watch"

const W = labels.watch

/**
 * Lista de /watch (P21): agrupada por grau (fogo alto primeiro), com o mais
 * esquecido no topo de cada grupo. Todas as ações sem sair da página:
 * "Revisado hoje" em UM clique (sem dialog, sem campo), esfriar/esquentar,
 * resolver com texto obrigatório (D27) e arquivar. O título abre o painel com o
 * histórico completo de revisões.
 */
export function WatchList({
  rows,
  canWrite,
  grouped,
  empty,
  openId,
}: {
  rows: WatchRow[]
  canWrite: boolean
  /** Agrupar por grau (ativas, sem revisão). */
  grouped: boolean
  empty: { title: string; direction: string }
  /** Observação aberta pela URL (?open=). */
  openId: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // "Editar" no menu da linha abre o painel já no formulário (C4).
  const [editOnOpen, setEditOnOpen] = React.useState(false)

  function setOpen(id: string | null, edit = false) {
    setEditOnOpen(edit)
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set(WATCH_PARAMS.open, id)
    else params.delete(WATCH_PARAMS.open)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  if (rows.length === 0) {
    return (
      <>
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState title={empty.title} direction={empty.direction} />
        </div>
        <WatchDetailSheet id={openId} canWrite={canWrite} startEditing={editOnOpen} onClose={() => setOpen(null)} />
      </>
    )
  }

  const groups = grouped
    ? WATCH_HEATS.map((heat) => ({ heat, rows: rows.filter((r) => r.heat === heat) })).filter((g) => g.rows.length > 0)
    : [{ heat: null, rows }]

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.heat ?? "all"} aria-label={group.heat ? W.heat[group.heat] : W.title} className="flex flex-col gap-2">
          {group.heat ? (
            <h2 className="flex items-center gap-2">
              <MetaLabel>{plural(W.group, group.rows.length, { heat: W.heat[group.heat] })}</MetaLabel>
            </h2>
          ) : null}
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {group.rows.map((row) => (
              <WatchLine key={row.id} row={row} canWrite={canWrite} onOpen={() => setOpen(row.id)} onEdit={() => setOpen(row.id, true)} />
            ))}
          </ul>
        </section>
      ))}
      <WatchDetailSheet id={openId} canWrite={canWrite} startEditing={editOnOpen} onClose={() => setOpen(null)} />
    </div>
  )
}

function reviewLabel(row: WatchRow): string {
  return row.review.status === "late" ? W.review.late : row.review.status === "due" ? W.review.due : W.review.ok
}

function daysText(days: number): string {
  return days === 0 ? W.review.today : plural(W.review.daysSince, days)
}

function WatchLinks({ row }: { row: WatchRow }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
      {row.member ? (
        <Link href={`/team/${row.member.id}`} className="hover:text-ink">
          <MetaLabel className="hover:text-ink">{row.member.preferredName}</MetaLabel>
        </Link>
      ) : null}
      {row.central ? <MetaLabel>{row.central.name}</MetaLabel> : null}
      {row.link ? (
        <Link href={row.link.href} className="min-w-0 truncate">
          <MetaLabel className="hover:text-ink">
            {W.origin[row.origin]} · {row.link.label}
          </MetaLabel>
        </Link>
      ) : (
        <MetaLabel>{W.origin[row.origin]}</MetaLabel>
      )}
    </span>
  )
}

function WatchLine({ row, canWrite, onOpen, onEdit }: { row: WatchRow; canWrite: boolean; onOpen: () => void; onEdit: () => void }) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const active = row.status === "ACTIVE"

  function run(action: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) toast.show(message, { tone: "calm" })
      else setError(result.error ?? labels.validation.generic)
    })
  }

  const up = hotter(row.heat)
  const down = cooler(row.heat)

  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="mt-1.5 shrink-0">
          {active ? (
            <SeverityDot severity={row.review.severity} label={reviewLabel(row)} />
          ) : (
            <SeverityDot severity="calm" label={row.status === "RESOLVED" ? W.tabs.resolved : W.tabs.archived} />
          )}
        </span>
        <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1">
          <button type="button" onClick={onOpen} className="min-w-0 truncate text-left text-sm font-medium text-ink hover:underline">
            {row.title}
          </button>
          <WatchLinks row={row} />
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-ink-secondary">
          {active ? null : <StatusPill severity={HEAT_SEVERITY[row.heat]} label={W.heat[row.heat]} />}
          <span className="font-mono" title={reviewLabel(row)}>
            {daysText(row.review.daysSinceReview)}
          </span>
          <span className="font-mono">{row.reviewCount === 0 ? W.review.none : plural(W.review.count, row.reviewCount)}</span>
        </div>
        {canWrite && active ? (
          <div className="flex shrink-0 items-center gap-1">
            <NotePopover
              trigger={W.actions.reviewed}
              triggerVariant="secondary"
              texts={W.reviewForm}
              submitNote={(note) => reviewWatch({ id: row.id, note })}
              done={W.reviewedToast}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={!down || pending}
              aria-label={W.actions.cool}
              title={W.actions.cool}
              onClick={() => down && run(() => changeWatchHeat({ id: row.id, direction: "down" }), fill(W.heatToast, { heat: W.heat[down].toLowerCase() }))}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={!up || pending}
              aria-label={W.actions.heat}
              title={W.actions.heat}
              onClick={() => up && run(() => changeWatchHeat({ id: row.id, direction: "up" }), fill(W.heatToast, { heat: W.heat[up].toLowerCase() }))}
            >
              <ArrowUpIcon />
            </Button>
            <NotePopover
              trigger={W.actions.resolve}
              triggerVariant="ghost"
              texts={W.resolveForm}
              submitNote={(note) => resolveWatch({ id: row.id, note })}
              done={W.resolveForm.done}
            />
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={fill(W.actions.rowActions, { title: row.title })}>
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onOpen}>{W.actions.open}</DropdownMenuItem>
                <DropdownMenuItem onSelect={onEdit}>{W.edit.action}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run(() => archiveWatch({ id: row.id }), W.archivedToast)}>{W.actions.archive}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
      {row.coldHighDays !== null ? (
        <p className="pl-5 text-xs text-overdue">{fill(W.coldHigh, { days: row.coldHighDays })}</p>
      ) : null}
      {!active && row.resolutionNote ? <p className="pl-5 text-xs text-ink-secondary">{row.resolutionNote}</p> : null}
      {error ? (
        <p role="alert" className="pl-5 text-xs text-overdue">
          {error}
        </p>
      ) : null}
    </li>
  )
}

/** Resolver: popover com o texto OBRIGATÓRIO (D27). */
/** Ação com texto obrigatório num popover (Revisado hoje e Resolver): Ctrl/⌘+Enter salva. */
function NotePopover({
  trigger,
  triggerVariant,
  texts,
  submitNote,
  done,
}: {
  trigger: string
  triggerVariant: "secondary" | "ghost"
  texts: { note: string; placeholder: string; required: string; confirm: string; cancel: string }
  submitNote: (note: string) => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>
  done: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function submit() {
    if (note.trim().length < 3) return setError(texts.required)
    startTransition(async () => {
      const result = await submitNote(note)
      if (!result.ok) return setError(result.fieldErrors?.note ?? result.error ?? labels.validation.generic)
      setOpen(false)
      setNote("")
      toast.show(done, { tone: "calm" })
    })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setError(null)
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant={triggerVariant}>
          {trigger}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              submit()
            }
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            {texts.note}
            <Textarea autoFocus rows={3} value={note} maxLength={1000} placeholder={texts.placeholder} aria-invalid={Boolean(error) || undefined} onChange={(e) => setNote(e.target.value)} />
          </label>
          {error ? (
            <p role="alert" className="text-xs text-overdue">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {texts.cancel}
            </Button>
            <Button type="submit" size="sm" loading={pending}>
              {texts.confirm}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** Painel da observação: contexto, vínculos, visibilidade e o histórico completo de revisões, em ordem cronológica. */
function WatchDetailSheet({
  id,
  canWrite,
  startEditing = false,
  onClose,
}: {
  id: string | null
  canWrite: boolean
  /** Abrir já no formulário de edição (menu "Editar" da linha). */
  startEditing?: boolean
  onClose: () => void
}) {
  const D = W.detail
  const [detail, setDetail] = React.useState<WatchDetail | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const editable = canWrite && detail?.status === "ACTIVE"

  React.useEffect(() => {
    setEditing(startEditing)
    if (!id) return setDetail(null)
    let cancelled = false
    void loadWatchItem(id).then((d) => {
      if (!cancelled) setDetail(d)
    })
    return () => {
      cancelled = true
    }
  }, [id, startEditing])

  function toggleVisibility() {
    if (!detail) return
    const visibility = detail.visibility === "PRIVATE" ? "SHARED" : "PRIVATE"
    startTransition(async () => {
      const result = await setWatchVisibility({ id: detail.id, visibility })
      if (result.ok) setDetail({ ...detail, visibility })
    })
  }

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-dialog">
        {detail ? (
          <div className="flex flex-col gap-6 p-4">
            <SheetHeader className="p-0">
              <SheetTitle className="flex flex-wrap items-center gap-2">
                <StatusPill severity={HEAT_SEVERITY[detail.heat]} label={W.heat[detail.heat]} />
                {editable && !editing ? (
                  // Clicar no título edita (C4): título e contexto, no próprio painel.
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    title={W.edit.titleHint}
                    className="group inline-flex min-w-0 items-center gap-1.5 rounded-sm text-left hover:underline"
                  >
                    <span>{detail.title}</span>
                    <PencilIcon className="size-3.5 shrink-0 text-ink-tertiary group-hover:text-ink-secondary" aria-hidden />
                    <span className="sr-only">{W.edit.titleHint}</span>
                  </button>
                ) : (
                  <span>{detail.title}</span>
                )}
              </SheetTitle>
              <SheetDescription>{fill(D.created, { date: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(detail.createdAt) })} · {detail.createdBy}</SheetDescription>
            </SheetHeader>
            <WatchLinks row={detail} />
            {detail.coldHighDays !== null ? <p className="text-sm text-overdue">{fill(W.coldHigh, { days: detail.coldHighDays })}</p> : null}
            {editing && editable ? (
              <WatchEditForm
                detail={detail}
                onCancel={() => setEditing(false)}
                onSaved={(title, context) => {
                  setDetail({ ...detail, title, context })
                  setEditing(false)
                }}
              />
            ) : detail.context ? (
              <div className="flex flex-col gap-1">
                <MetaLabel>{D.context}</MetaLabel>
                <p className="text-sm whitespace-pre-line text-ink">{detail.context}</p>
              </div>
            ) : null}
            {detail.resolutionNote ? (
              <div className="flex flex-col gap-1">
                <MetaLabel>{D.resolution}</MetaLabel>
                <p className="text-sm whitespace-pre-line text-ink">{detail.resolutionNote}</p>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <MetaLabel>{D.history}</MetaLabel>
              {detail.reviews.length === 0 ? (
                <p className="text-sm text-ink-secondary">{D.historyEmpty}</p>
              ) : (
                <ol className="flex flex-col divide-y divide-line">
                  {detail.reviews.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                      <DateStamp date={r.reviewedAt} display="datetime" className="text-ink-secondary" />
                      {r.heatBefore !== r.heatAfter ? (
                        <span className={cn("font-medium", r.heatAfter === "HIGH" ? "text-overdue" : r.heatAfter === "MEDIUM" ? "text-attention" : "text-ink")}>
                          {fill(D.heatChange, { before: W.heat[r.heatBefore as WatchHeat], after: W.heat[r.heatAfter as WatchHeat] })}
                        </span>
                      ) : (
                        <span className="text-ink-secondary">{D.reviewed}</span>
                      )}
                      <span className="text-xs text-ink-secondary">{r.author}</span>
                      {r.note ? <p className="w-full text-ink">{r.note}</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {canWrite ? (
              <div className="flex flex-col gap-1 border-t border-line pt-4">
                <MetaLabel>{D.visibility}</MetaLabel>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill severity="neutral" label={enumLabel("visibility", detail.visibility)} />
                  <Button size="sm" variant="ghost" loading={pending} onClick={toggleVisibility}>
                    {detail.visibility === "PRIVATE" ? W.actions.share : W.actions.unshare}
                  </Button>
                </div>
                <p className="text-xs text-ink-secondary">{D.neverWhatsApp}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

/** Formulário de edição da observação (C4): título e contexto. Ctrl/⌘+Enter salva, Esc cancela. */
function WatchEditForm({
  detail,
  onCancel,
  onSaved,
}: {
  detail: WatchDetail
  onCancel: () => void
  onSaved: (title: string, context: string | null) => void
}) {
  const E = W.edit
  const toast = useToast()
  const [title, setTitle] = React.useState(detail.title)
  const [context, setContext] = React.useState(detail.context ?? "")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function submit(event?: React.FormEvent) {
    event?.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await updateWatch({ id: detail.id, title, context })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        return setError(result.error)
      }
      toast.show(E.saved, { tone: "calm" })
      onSaved(title.trim(), context.trim() || null)
    })
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) submit(event)
        if (event.key === "Escape") {
          event.stopPropagation()
          onCancel()
        }
      }}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3"
      noValidate
    >
      <FieldGroup label={E.titleField} required error={errors.title}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} autoFocus />
      </FieldGroup>
      <FieldGroup label={E.contextField} optional error={errors.context}>
        <Textarea value={context} onChange={(e) => setContext(e.target.value)} rows={4} maxLength={1000} />
      </FieldGroup>
      {error ? (
        <p role="alert" className="text-sm text-overdue">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
          {labels.common.cancel}
        </Button>
        <Button type="submit" size="sm" loading={pending}>
          {labels.common.save}
        </Button>
      </div>
    </form>
  )
}
