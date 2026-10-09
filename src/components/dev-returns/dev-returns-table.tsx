"use client"

import * as React from "react"
import { EllipsisIcon } from "lucide-react"

import { deleteDevReturn, resolveDevReturn } from "@/actions/dev-returns"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { DateStamp } from "@/components/ui/date-stamp"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { StatusPill } from "@/components/ui/status-pill"
import { useToast } from "@/components/ui/toast"
import { WatchButton } from "@/components/watch/watch-button"
import { formatDate, maskDateInput, todayBusinessDate } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import { isHttpUrl } from "@/lib/priority-validation"
import type { WatchHeat } from "@/lib/watch"
import type { DevReturnRow } from "@/server/queries/dev-returns"

const T = labels.devReturns.table

/**
 * Devoluções do período, mais recente primeiro. O motivo vem com o
 * indicador de categoria (Analista em atenção, Processo neutro — D22);
 * "Marcar como reenviado" é a ação da linha; editar e excluir ficam
 * discretos no menu.
 */
export function DevReturnsTable({
  rows,
  canWrite,
  empty,
  onEdit,
  watching = {},
}: {
  rows: DevReturnRow[]
  /** P21: observação ativa por devolução. */
  watching?: Record<string, { id: string; heat: WatchHeat }>
  canWrite: boolean
  empty: { title: string; direction: string }
  onEdit: (row: DevReturnRow) => void
}) {
  const [resolving, setResolving] = React.useState<DevReturnRow | null>(null)
  const [deleting, setDeleting] = React.useState<DevReturnRow | null>(null)

  const columns: DataTableColumn<DevReturnRow>[] = [
    {
      id: "date",
      header: T.date,
      cell: (r) => <DateStamp date={r.returnedAt} kind="business" className="text-ink-secondary" />,
      title: () => undefined,
      width: "104px",
    },
    {
      id: "ticket",
      header: T.ticket,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-1.5">
          {isHttpUrl(r.ticketUrl) ? (
            <a
              href={r.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={fill(T.openTicket, { ref: r.ticketRef })}
              className="truncate font-mono text-ink underline-offset-2 hover:underline"
            >
              {r.ticketRef}
            </a>
          ) : (
            <span className="truncate font-mono text-ink">{r.ticketRef}</span>
          )}
          {r.validation ? (
            <span
              className="shrink-0 font-mono text-2xs text-ink-secondary"
              title={fill(T.validatedTitle, { outcome: enumLabel("validationOutcome", r.validation.outcome) })}
            >
              {T.validated}
            </span>
          ) : null}
        </span>
      ),
      title: (r) => r.ticketUrl,
      width: "160px",
      stacked: "primary",
    },
    { id: "member", header: T.member, cell: (r) => r.member.preferredName, width: "128px", stackedOrder: 1 },
    {
      id: "central",
      header: T.central,
      cell: (r) => (r.central ? <span className="truncate">{r.central.name}</span> : <span className="text-ink-secondary">{T.none}</span>),
      title: (r) => r.central?.name ?? labels.centrals.none,
      width: "136px",
      hideBelow: "xl",
    },
    {
      id: "reason",
      header: T.reason,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <StatusPill
            severity={r.reason.category === "ANALYST" ? "attention" : "neutral"}
            label={enumLabel("devReturnCategory", r.reason.category)}
          />
          <span className="truncate text-ink">
            {r.reason.label}
            {r.reasonOther ? `: ${r.reasonOther}` : ""}
          </span>
        </span>
      ),
      title: (r) => [r.reason.label, r.reasonOther, r.note].filter(Boolean).join(" · ") || undefined,
      stackedOrder: 2,
    },
    {
      id: "devContact",
      header: T.devContact,
      cell: (r) => <span className="truncate text-ink-secondary">{r.devContact ?? T.none}</span>,
      title: (r) => r.devContact ?? undefined,
      width: "136px",
      hideBelow: "2xl",
    },
    {
      id: "resolved",
      header: T.resolved,
      cell: (r) =>
        r.resolvedAt ? (
          <DateStamp date={r.resolvedAt} kind="business" className="text-calm" />
        ) : (
          <span className="text-xs text-ink-secondary">{T.notResolved}</span>
        ),
      title: (r) => r.resolutionNote ?? undefined,
      width: "112px",
      hideBelow: "lg",
    },
  ]
  if (canWrite) {
    columns.push({
      id: "actions",
      header: T.actions,
      cell: (r) => (
        <span className="flex items-center justify-end gap-1">
          {r.resolvedAt ? null : (
            <Button variant="ghost" size="sm" className="max-lg:hidden" onClick={() => setResolving(r)}>
              {T.resolve}
            </Button>
          )}
          <WatchButton
            origin="DEV_RETURN"
            defaults={{ title: fill(labels.watch.links.devReturn, { ref: r.ticketRef }), context: r.reason.label, heat: "MEDIUM" }}
            link={{ devReturnId: r.id }}
            existing={watching[r.id] ?? null}
          />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={fill(T.rowActions, { ref: r.ticketRef })}>
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {r.resolvedAt ? null : <DropdownMenuItem onSelect={() => setResolving(r)}>{T.resolve}</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => onEdit(r)}>{T.edit}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDeleting(r)} className="text-overdue focus:text-overdue">
                {T.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ),
      title: () => undefined,
      width: "264px",
      align: "right",
      stacked: "aside",
    })
  }

  return (
    <>
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} label={T.label} empty={empty} />
      <ResolveDialog row={resolving} onOpenChange={(open) => !open && setResolving(null)} />
      <DeleteDialog row={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </>
  )
}

/** Marcar como reenviado: data (hoje por padrão) e uma linha opcional de resolução. */
function ResolveDialog({ row, onOpenChange }: { row: DevReturnRow | null; onOpenChange: (open: boolean) => void }) {
  const R = labels.devReturns.resolveDialog
  const toast = useToast()
  const [date, setDate] = React.useState("")
  const [note, setNote] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const noteRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!row) return
    setDate(formatDate(todayBusinessDate(), "business"))
    setNote("")
    setErrors({})
    setError(null)
  }, [row])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!row) return
    startTransition(async () => {
      const result = await resolveDevReturn({ id: row.id, resolvedAt: date, resolutionNote: note })
      if (result.ok) {
        toast.show(fill(R.done, { ref: row.ticketRef }), { tone: "calm" })
        return onOpenChange(false)
      }
      setError(result.error)
      setErrors(result.fieldErrors ?? {})
    })
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          noteRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{R.title}</DialogTitle>
          <DialogDescription>{row ? fill(R.description, { ref: row.ticketRef }) : null}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <FieldGroup label={R.date} required error={errors.resolvedAt}>
              <Input
                value={date}
                inputMode="numeric"
                autoComplete="off"
                placeholder={labels.forms.datePlaceholder}
                className="font-mono"
                onChange={(e) => setDate(maskDateInput(e.target.value))}
              />
            </FieldGroup>
            <FieldGroup label={R.note} optional error={errors.resolutionNote}>
              <Input ref={noteRef} value={note} maxLength={300} autoComplete="off" placeholder={R.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
            </FieldGroup>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {R.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {R.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Confirmação da exclusão (soft delete). Botão em cor de perigo, nunca o padrão. */
function DeleteDialog({ row, onOpenChange }: { row: DevReturnRow | null; onOpenChange: (open: boolean) => void }) {
  const D = labels.devReturns.deleteDialog
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const keepRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (row) setError(null)
  }, [row])

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          keepRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{D.title}</DialogTitle>
          <DialogDescription>{row ? fill(D.description, { ref: row.ticketRef }) : null}</DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        <DialogFooter>
          <Button ref={keepRef} type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {D.keep}
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={pending}
            onClick={() =>
              row &&
              startTransition(async () => {
                const result = await deleteDevReturn({ id: row.id })
                if (result.ok) onOpenChange(false)
                else setError(result.error)
              })
            }
          >
            {D.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
