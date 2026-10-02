"use client"

import * as React from "react"
import { EllipsisIcon } from "lucide-react"

import { deleteValidation } from "@/actions/priority-validations"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { DateStamp } from "@/components/ui/date-stamp"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { StatusPill } from "@/components/ui/status-pill"
import { formatTime } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import { isHttpUrl, OUTCOME_SEVERITY } from "@/lib/priority-validation"
import type { ValidationRow } from "@/server/queries/priority-validations"

const T = labels.priorityValidations.table
const D = labels.priorityValidations.deleteDialog

/**
 * Validações do período, mais recente primeiro. Fora de "hoje" ganha a
 * coluna de data. Editar e excluir ficam no menu discreto da linha.
 */
export function ValidationsTable({
  rows,
  showDate,
  canWrite,
  empty,
  onEdit,
}: {
  rows: ValidationRow[]
  showDate: boolean
  canWrite: boolean
  empty: { title: string; direction: string }
  onEdit: (row: ValidationRow) => void
}) {
  const [deleting, setDeleting] = React.useState<ValidationRow | null>(null)

  const columns: DataTableColumn<ValidationRow>[] = []
  if (showDate) {
    columns.push({
      id: "date",
      header: T.date,
      cell: (r) => <DateStamp date={r.validatedAt} className="text-ink-secondary" />,
      title: () => undefined,
      width: "104px",
    })
  }
  columns.push(
    {
      id: "time",
      header: T.time,
      cell: (r) => <span className="font-mono text-xs text-ink-secondary">{formatTime(r.validatedAt)}</span>,
      title: () => undefined,
      width: "64px",
    },
    {
      id: "ticket",
      header: T.ticket,
      cell: (r) =>
        isHttpUrl(r.ticketUrl) ? (
          <a
            href={r.ticketUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={fill(T.openTicket, { ref: r.ticketRef })}
            className="font-mono text-ink hover:underline"
          >
            {r.ticketRef}
          </a>
        ) : (
          <span className="font-mono text-ink">{r.ticketRef}</span>
        ),
      title: (r) => r.ticketUrl,
      width: "112px",
      stacked: "primary",
    },
    { id: "member", header: T.member, cell: (r) => r.member.preferredName, width: "128px" },
    {
      id: "analyst",
      header: T.analyst,
      cell: (r) => <span className="text-ink-secondary">{r.analystPriority.label}</span>,
      width: "104px",
      hideBelow: "lg",
    },
    {
      id: "supervisor",
      header: T.supervisor,
      cell: (r) =>
        r.supervisorPriority ? (
          <span className="text-ink">{r.supervisorPriority.label}</span>
        ) : (
          <span className="text-ink-tertiary">{T.none}</span>
        ),
      title: (r) => r.supervisorPriority?.label,
      width: "104px",
      hideBelow: "lg",
    },
    {
      id: "outcome",
      header: T.outcome,
      cell: (r) => <StatusPill severity={OUTCOME_SEVERITY[r.outcome]} label={enumLabel("validationOutcome", r.outcome)} />,
      title: (r) => `${r.analystPriority.label} → ${r.supervisorPriority?.label ?? enumLabel("validationOutcome", r.outcome)}`,
      width: "112px",
    },
    {
      id: "reason",
      header: T.reason,
      cell: (r) =>
        r.reason ? (
          <span className="truncate text-ink-secondary">
            {r.reason.label}
            {r.reasonOther ? `: ${r.reasonOther}` : ""}
          </span>
        ) : (
          <span className="text-ink-tertiary">{T.none}</span>
        ),
      title: (r) => [r.reason?.label, r.reasonOther, r.note].filter(Boolean).join(" · ") || undefined,
      hideBelow: "xl",
    },
  )
  if (canWrite) {
    columns.push({
      id: "actions",
      header: T.actions,
      cell: (r) => (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={fill(T.rowActions, { ref: r.ticketRef })}>
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(r)}>{T.edit}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDeleting(r)} className="text-overdue focus:text-overdue">
              {T.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      title: () => undefined,
      width: "56px",
      align: "right",
      stacked: "aside",
    })
  }

  return (
    <>
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} label={T.label} empty={empty} />
      <DeleteValidationDialog row={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </>
  )
}

/** Confirmação da exclusão (soft delete). Botão em cor de perigo, nunca o padrão. */
function DeleteValidationDialog({ row, onOpenChange }: { row: ValidationRow | null; onOpenChange: (open: boolean) => void }) {
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const keepRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (row) setError(null)
  }, [row])

  function confirm() {
    if (!row) return
    startTransition(async () => {
      const result = await deleteValidation({ id: row.id })
      if (result.ok) onOpenChange(false)
      else setError(result.error)
    })
  }

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
          <Button type="button" variant="destructive" loading={pending} onClick={confirm}>
            {D.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
