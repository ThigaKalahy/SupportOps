"use client"

import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { StatusPill } from "@/components/ui/status-pill"
import { fill, labels, plural } from "@/lib/labels"
import type { CentralMetricRow } from "@/server/queries/centrals"

const M = labels.centrals.metrics

/**
 * Volume por central (P19): combinados, validações, alteração de prioridade
 * (sempre com o total — D19) e dailies em que a central apareceu. Ordem por
 * volume total; "sem central informada" vem por último, com a contagem — é a
 * cobertura real do campo. A unidade é a central, nunca a pessoa (D7).
 */
export function CentralMetricsTable({ rows, none }: { rows: CentralMetricRow[]; none: CentralMetricRow }) {
  const all = rows.length || none.agreements + none.validations > 0 ? [...rows, none] : []
  const columns: DataTableColumn<CentralMetricRow>[] = [
    {
      id: "central",
      header: M.columns.central,
      cell: (r) =>
        r.id === null ? (
          <span className="text-ink-secondary">{labels.centrals.none}</span>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-ink">{r.name}</span>
            {r.isActive ? null : <StatusPill severity="neutral" label={M.inactive} />}
          </span>
        ),
      title: (r) => r.name ?? labels.centrals.none,
      stacked: "primary",
    },
    {
      id: "agreements",
      header: M.columns.agreements,
      cell: (r) => <span className="font-mono text-xs">{r.agreements}</span>,
      title: () => undefined,
      width: "112px",
      align: "right",
      stackedOrder: 1,
    },
    {
      id: "validations",
      header: M.columns.validations,
      cell: (r) => <span className="font-mono text-xs">{r.validations}</span>,
      title: () => undefined,
      width: "112px",
      align: "right",
      stackedOrder: 2,
    },
    {
      id: "dispute",
      header: M.columns.dispute,
      cell: (r) =>
        r.dispute && r.dispute.changeRate !== null ? (
          <span className="font-mono text-xs">
            {fill(M.disputeRate, { rate: `${r.dispute.changeRate}%`, changed: r.dispute.changed, total: r.dispute.total })}
          </span>
        ) : (
          <span className="text-xs text-ink-secondary">{M.noValidations}</span>
        ),
      title: () => undefined,
      width: "176px",
      align: "right",
    },
    {
      id: "dailies",
      header: M.columns.dailies,
      cell: (r) =>
        r.id === null ? (
          <span className="text-xs text-ink-secondary">—</span>
        ) : (
          <span className="font-mono text-xs">{plural(M.dailiesCount, r.dailies)}</span>
        ),
      title: () => undefined,
      width: "104px",
      align: "right",
      hideBelow: "lg",
    },
  ]
  return (
    <DataTable
      columns={columns}
      rows={all}
      getRowId={(r) => r.id ?? "none"}
      label={M.title}
      empty={{ title: M.empty, direction: M.emptyDirection }}
    />
  )
}
