"use client"

import * as React from "react"
import Link from "next/link"
import { EllipsisIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { DateStamp } from "@/components/ui/date-stamp"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { StatusPill } from "@/components/ui/status-pill"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { avatarColors, initials } from "@/lib/people"
import type { AgreementRow } from "@/server/queries/agreements"
import { ATTENTION_THRESHOLDS } from "@/server/alerts"

import { CancelAgreementDialog } from "./cancel-agreement-dialog"
import { CompleteAgreementDialog } from "./complete-agreement-dialog"

const A = labels.agreements
const C = A.columns

/** Linhas por vez: a central acumula meses de combinados; "Mostrar mais" acrescenta outra página. */
export const AGREEMENTS_PAGE_SIZE = 50

/** Arrasto: 1–2 reagendamentos em texto; 3 ou mais é sinal gerencial, em vermelho, sem depender de hover. */
export function DragIndicator({ reschedules }: { reschedules: number }) {
  if (reschedules === 0) return <span className="text-ink-tertiary">—</span>
  if (reschedules >= ATTENTION_THRESHOLDS.chronicReschedules) {
    return <StatusPill severity="overdue" label={fill(A.dragged, { count: reschedules })} />
  }
  return <span className="font-mono text-xs text-ink-secondary">{plural(A.drag, reschedules)}</span>
}

export function AgreementStatusCell({ status }: { status: AgreementRow["status"] }) {
  if (status === "DONE") return <StatusPill severity="calm" label={enumLabel("agreementStatus", status)} />
  if (status === "CANCELLED") return <StatusPill severity="neutral" label={enumLabel("agreementStatus", status)} />
  return <span className="text-ink-secondary">{enumLabel("agreementStatus", status)}</span>
}

/** Prazo com a severidade graduada; "em dia" não ganha selo (só ruído). */
export function DueCell({ row }: { row: Pick<AgreementRow, "dueDate" | "open" | "deadline"> }) {
  const showPill = row.open && row.deadline.stage !== "on-track"
  return (
    <span className="flex min-w-0 items-center gap-2">
      <DateStamp date={row.dueDate} kind="business" className={row.open ? "text-ink" : "text-ink-secondary"} />
      {showPill ? (
        <StatusPill severity={row.deadline.severity} strong={row.deadline.strong} label={row.deadline.label} />
      ) : null}
    </span>
  )
}

export function AgreementsTable({
  rows,
  canWrite,
  empty,
  showMember = true,
}: {
  rows: AgreementRow[]
  canWrite: boolean
  empty: { title: string; direction: string }
  /** Falso na aba de combinados do perfil (a pessoa já está no cabeçalho). */
  showMember?: boolean
}) {
  const [completing, setCompleting] = React.useState<AgreementRow | null>(null)
  const [cancelling, setCancelling] = React.useState<AgreementRow | null>(null)
  const [limit, setLimit] = React.useState(AGREEMENTS_PAGE_SIZE)
  // Outra aba ou outro filtro: volta para a primeira página.
  React.useEffect(() => setLimit(AGREEMENTS_PAGE_SIZE), [rows])
  const visible = rows.slice(0, limit)
  const remaining = rows.length - visible.length

  const columns: DataTableColumn<AgreementRow>[] = [
    {
      id: "title",
      header: C.title,
      cell: (r) => (
        <Link href={`/agreements/${r.id}`} className="truncate font-medium text-ink hover:underline">
          {r.title}
        </Link>
      ),
      title: (r) => r.title,
      stacked: "primary",
    },
  ]
  if (showMember) {
    columns.push({
      id: "member",
      header: C.member,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar size="sm">
            <AvatarFallback style={avatarColors(r.member.id)}>{initials(r.member.fullName)}</AvatarFallback>
          </Avatar>
          <span className="truncate">{r.member.preferredName}</span>
        </span>
      ),
      title: (r) => `${r.member.fullName} · ${r.member.seniorityLabel}`,
      width: "148px",
    })
  }
  columns.push(
    { id: "origin", header: C.origin, cell: (r) => enumLabel("agreementOrigin", r.origin), width: "96px", hideBelow: "2xl" },
    {
      id: "createdAt",
      header: C.createdAt,
      cell: (r) => <DateStamp date={r.createdAt} className="text-ink-secondary" />,
      title: () => undefined,
      width: "104px",
      hideBelow: "2xl",
    },
    { id: "dueDate", header: C.dueDate, cell: (r) => <DueCell row={r} />, title: (r) => r.deadline.label, width: "232px" },
    {
      id: "priority",
      header: C.priority,
      cell: (r) => (
        <span className={r.priority === "HIGH" ? "font-medium text-ink" : "text-ink-secondary"}>
          {enumLabel("agreementPriority", r.priority)}
        </span>
      ),
      title: (r) => enumLabel("agreementPriority", r.priority),
      width: "112px",
      hideBelow: "lg",
    },
    {
      id: "status",
      header: C.status,
      cell: (r) => <AgreementStatusCell status={r.status} />,
      title: (r) => enumLabel("agreementStatus", r.status),
      width: "120px",
      hideBelow: "lg",
    },
    {
      id: "drag",
      header: C.drag,
      cell: (r) => <DragIndicator reschedules={r.reschedules} />,
      title: () => undefined,
      width: "128px",
    },
  )
  if (canWrite) {
    columns.push({
      id: "actions",
      header: C.actions,
      cell: (r) =>
        r.open ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`${A.rowActions}: ${r.title}`}>
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setCompleting(r)}>{A.complete}</DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/agreements/${r.id}`}>{A.open}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCancelling(r)} className="text-overdue focus:text-overdue">
                {A.cancel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
      title: () => undefined,
      width: "64px",
      align: "right",
      stacked: "aside",
    })
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={visible}
        getRowId={(r) => r.id}
        rowHref={(r) => `/agreements/${r.id}`}
        label={A.tableLabel}
        empty={empty}
      />
      {remaining > 0 ? (
        <div className="flex items-center justify-center gap-3 pt-3">
          <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + AGREEMENTS_PAGE_SIZE)}>
            {fill(A.showMore, { count: Math.min(remaining, AGREEMENTS_PAGE_SIZE) })}
          </Button>
          <span className="font-mono text-xs text-ink-secondary">
            {fill(A.showing, { shown: visible.length, total: rows.length })}
          </span>
        </div>
      ) : null}
      <CompleteAgreementDialog agreement={completing} onOpenChange={(open) => !open && setCompleting(null)} />
      <CancelAgreementDialog agreement={cancelling} onOpenChange={(open) => !open && setCancelling(null)} />
    </>
  )
}
