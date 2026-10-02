"use client"

import * as React from "react"
import { EllipsisIcon } from "lucide-react"

import { DeactivateMemberDialog } from "@/components/member/deactivate-member-dialog"
import { MemberDialog } from "@/components/member/member-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { DateStamp } from "@/components/ui/date-stamp"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SeverityDot } from "@/components/ui/severity-dot"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { enumLabel, fill, labels } from "@/lib/labels"
import { avatarColors, initials } from "@/lib/people"
import type { MemberForEdit, MemberFormCatalogs, TeamListRow } from "@/server/queries/members"

const C = labels.team.columns

export type TeamTableRow = TeamListRow & { tenure: string }

function AttentionCell({ row }: { row: TeamTableRow }) {
  const attention = row.attention
  if (!attention) return <span className="sr-only">{labels.team.noAttention}</span>
  const summary = attention.reasons.map((r) => r.text).join(". ")
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Alvo focável: o motivo precisa ser alcançável por teclado, não só por mouse. */}
        <span tabIndex={0} aria-label={summary} className="inline-flex size-6 items-center justify-center rounded-sm">
          <SeverityDot severity={attention.severity} strong={attention.strong} label={summary} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">
        <ul className="flex flex-col gap-0.5">
          {attention.reasons.map((reason) => (
            <li key={reason.text}>{reason.text}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

function PersonCell({ row }: { row: TeamTableRow }) {
  return (
    <span className="flex min-w-0 items-center gap-2" title={`${row.fullName} · ${row.position}`}>
      <Avatar size="sm">
        <AvatarFallback style={avatarColors(row.id)}>{initials(row.fullName)}</AvatarFallback>
      </Avatar>
      <span className="truncate font-medium text-ink">{row.preferredName}</span>
      <span className="truncate text-xs text-ink-secondary">{row.position}</span>
    </span>
  )
}

export function TeamTable({
  rows,
  grouped,
  filtered,
  catalogs,
  editable,
}: {
  rows: TeamTableRow[]
  grouped: boolean
  /** Há filtro ativo: o estado vazio orienta a limpar filtros. */
  filtered: boolean
  catalogs: MemberFormCatalogs | null
  /** Cadastros para edição (só para quem escreve), por id. */
  editable: Record<string, MemberForEdit> | null
}) {
  const [editing, setEditing] = React.useState<MemberForEdit | null>(null)
  const [deactivating, setDeactivating] = React.useState<TeamTableRow | null>(null)

  const columns: DataTableColumn<TeamTableRow>[] = [
    { id: "person", header: C.person, cell: (r) => <PersonCell row={r} />, title: () => undefined, stacked: "primary" },
    { id: "seniority", header: C.seniority, cell: (r) => r.seniorityLabel, width: "104px" },
    { id: "tenure", header: C.tenure, cell: (r) => r.tenure, width: "152px", hideBelow: "xl" },
    {
      id: "status",
      header: C.status,
      cell: (r) =>
        r.status === "ACTIVE" ? (
          <span className="text-ink-secondary">{enumLabel("memberStatus", r.status)}</span>
        ) : (
          <Badge>{enumLabel("memberStatus", r.status)}</Badge>
        ),
      title: (r) => enumLabel("memberStatus", r.status),
      width: "136px",
      hideBelow: "xl",
    },
    {
      id: "lastOneOnOne",
      header: C.lastOneOnOne,
      cell: (r) =>
        r.lastOneOnOne ? (
          <DateStamp date={r.lastOneOnOne} kind="business" />
        ) : (
          <span className="text-ink-tertiary">{labels.team.noOneOnOne}</span>
        ),
      title: () => undefined,
      width: "112px",
    },
    {
      id: "openAgreements",
      header: C.openAgreements,
      cell: (r) => <span className="font-mono text-xs">{r.openAgreements}</span>,
      title: (r) => String(r.openAgreements),
      width: "168px",
      align: "right",
    },
    {
      id: "attention",
      header: C.attention,
      cell: (r) => <AttentionCell row={r} />,
      title: () => undefined,
      width: "88px",
      stacked: "aside",
    },
  ]

  if (editable && catalogs) {
    columns.push({
      id: "actions",
      header: C.actions,
      cell: (r) => {
        const member = editable[r.id]
        if (!member || r.status === "INACTIVE") return null
        return (
          // modal={false}: o dialog abre logo após o menu fechar, sem travar o foco da página.
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={fill(labels.team.rowActions, { name: r.preferredName })}>
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(member)}>{labels.team.edit}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(r)}>
                {labels.team.deactivate}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      title: () => undefined,
      width: "72px",
      align: "right",
      stacked: "aside",
    })
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        label={labels.team.tableLabel}
        groupBy={grouped ? (r) => ({ id: r.seniorityKey, label: r.seniorityLabel }) : undefined}
        empty={
          filtered
            ? { title: labels.team.empty.filteredTitle, direction: labels.team.empty.filteredDirection }
            : { title: labels.pages.team.emptyTitle, direction: labels.pages.team.emptyDirection }
        }
      />
      {catalogs && editing ? (
        <MemberDialog open onOpenChange={(open) => !open && setEditing(null)} catalogs={catalogs} member={editing} />
      ) : null}
      {deactivating ? (
        <DeactivateMemberDialog open onOpenChange={(open) => !open && setDeactivating(null)} member={deactivating} />
      ) : null}
    </>
  )
}
