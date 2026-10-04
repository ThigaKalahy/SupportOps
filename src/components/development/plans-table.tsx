"use client"

import Link from "next/link"

import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { fill, labels } from "@/lib/labels"
import type { PlanView } from "@/server/queries/development"

import { PlanReviewAge, PlanStatusCell } from "./plan-block"

const O = labels.development.overview
const C = O.columns

/**
 * Todos os PDIs do time. Ordem: status (ativos primeiro) e nome da pessoa —
 * nunca por desempenho. Clicar abre a aba Desenvolvimento da pessoa.
 */
export function PlansTable({ plans }: { plans: PlanView[] }) {
  const columns: DataTableColumn<PlanView>[] = [
    {
      id: "member",
      stackedOrder: 1,
      header: C.member,
      cell: (p) => (
        <Link href={`/team/${p.member.id}/development`} className="block truncate font-medium text-ink hover:underline">
          {p.member.preferredName}
        </Link>
      ),
      width: "136px",
    },
    {
      id: "objective",
      header: C.objective,
      cell: (p) => <span className="truncate text-ink">{p.objective}</span>,
      title: (p) => p.objective,
      stacked: "primary",
    },
    {
      id: "competency",
      header: C.competency,
      cell: (p) => <span className="truncate text-ink-secondary">{p.competency?.name ?? "—"}</span>,
      width: "200px",
      hideBelow: "xl",
    },
    { id: "status", header: C.status, cell: (p) => <PlanStatusCell status={p.status} />, title: () => undefined, width: "112px" },
    {
      id: "progress",
      header: C.progress,
      cell: (p) =>
        p.progress.total ? (
          <span className="font-mono text-xs text-ink-secondary">{fill(labels.development.plans.progress, p.progress)}</span>
        ) : (
          <span className="text-ink-secondary">—</span>
        ),
      title: () => undefined,
      width: "200px",
      hideBelow: "lg",
    },
    { id: "review",
      stackedOrder: 2, header: C.review, cell: (p) => <PlanReviewAge plan={p} />, title: () => undefined, width: "264px" },
  ]
  return (
    <DataTable
      columns={columns}
      rows={plans}
      getRowId={(p) => p.id}
      rowHref={(p) => `/team/${p.member.id}/development`}
      label={O.tableLabel}
      empty={{ title: labels.development.plans.empty, direction: labels.development.plans.emptyDirection }}
    />
  )
}
