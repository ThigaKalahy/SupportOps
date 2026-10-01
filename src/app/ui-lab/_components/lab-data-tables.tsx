"use client"

import * as React from "react"

import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { DateStamp } from "@/components/ui/date-stamp"
import { MetaLabel } from "@/components/ui/meta-label"
import { StatusPill } from "@/components/ui/status-pill"
import { fill, labels } from "@/lib/labels"
import { deadlineSeverity } from "@/lib/severity"

import { demo, type LabAgreement } from "../_fixtures"
import { Specimen } from "./specimen"

export function LabDataTables({ agreements, today }: { agreements: LabAgreement[]; today: Date }) {
  const [selectedId, setSelectedId] = React.useState<string | null>("a2")
  const few = agreements.slice(0, 3)

  const columns: DataTableColumn<LabAgreement>[] = [
    { id: "title", header: demo.colTitle, cell: (a) => a.title, stacked: "primary" },
    { id: "owner", header: demo.colOwner, cell: (a) => a.owner, width: "160px" },
    { id: "origin", header: demo.colOrigin, cell: (a) => <MetaLabel>{a.origin}</MetaLabel>, title: (a) => a.origin, width: "104px" },
    {
      id: "created",
      header: demo.colCreated,
      cell: (a) => <DateStamp date={a.createdAt} kind="business" className="text-ink-secondary" />,
      title: () => undefined,
      width: "112px",
      stacked: "hidden",
    },
    {
      id: "due",
      header: demo.colDue,
      cell: (a) =>
        a.dueDate ? <DateStamp date={a.dueDate} kind="business" /> : <span className="text-ink-tertiary">—</span>,
      title: () => undefined,
      width: "112px",
    },
    {
      id: "status",
      header: demo.colStatus,
      cell: (a) => {
        const s = deadlineSeverity(a.dueDate, { resolved: a.resolved, today })
        return <StatusPill severity={s.severity} label={s.label} />
      },
      title: (a) => deadlineSeverity(a.dueDate, { resolved: a.resolved, today }).label,
      width: "184px",
    },
    {
      id: "drag",
      header: demo.colDrag,
      cell: (a) =>
        a.reschedules > 1 ? (
          <span className="font-mono text-xs text-overdue">{fill(demo.dragged, { n: a.reschedules })}</span>
        ) : a.reschedules === 1 ? (
          <span className="font-mono text-xs text-ink-secondary">{fill(demo.dragged, { n: 1 })}</span>
        ) : (
          <span className="text-ink-tertiary">—</span>
        ),
      title: () => undefined,
      width: "112px",
      align: "right",
    },
  ]

  const base = {
    columns,
    getRowId: (a: LabAgreement) => a.id,
    label: demo.tableLabel,
    empty: { title: demo.tableEmptyTitle, direction: demo.tableEmptyDirection },
  }

  return (
    <div className="flex flex-col gap-6">
      <Specimen state={`${labels.uiLab.states.default} + ${labels.uiLab.states.selected}`}>
        <DataTable {...base} rows={agreements} selectedRowId={selectedId} onRowSelect={(a) => setSelectedId(a.id)} />
      </Specimen>
      <div className="grid gap-6 xl:grid-cols-2">
        <Specimen state={labels.uiLab.states.hover}>
          <DataTable {...base} rows={few} forcedRowState={{ rowId: "a2", state: "hover" }} onRowSelect={() => {}} />
        </Specimen>
        <Specimen state={labels.uiLab.states.focus}>
          <DataTable {...base} rows={few} forcedRowState={{ rowId: "a2", state: "focus" }} onRowSelect={() => {}} />
        </Specimen>
        <Specimen state={labels.uiLab.states.compact}>
          <DataTable {...base} rows={few} density="compact" />
        </Specimen>
        <Specimen state={labels.uiLab.states.loading}>
          <DataTable {...base} rows={[]} state="loading" />
        </Specimen>
        <Specimen state={labels.uiLab.states.empty}>
          <DataTable {...base} rows={[]} />
        </Specimen>
        <Specimen state={labels.uiLab.states.error}>
          <DataTable {...base} rows={[]} state="error" error={{ message: demo.tableError, onRetry: () => {} }} />
        </Specimen>
      </div>
    </div>
  )
}
