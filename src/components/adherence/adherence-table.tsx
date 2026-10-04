"use client"

import * as React from "react"
import Link from "next/link"
import { MessageSquarePlusIcon } from "lucide-react"

import { FeedbackDialog } from "@/components/forms/feedback-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { percent } from "@/lib/adherence"
import type { AdherenceSort } from "@/lib/adherence-filters"
import { formatDate } from "@/lib/dates"
import { fill, labels, plural } from "@/lib/labels"
import { avatarColors, initials } from "@/lib/people"
import { cn } from "@/lib/utils"
import type { MemberAdherenceRow } from "@/server/queries/adherence"

import { formatRate, LowConfidenceMark, TrendIndicator } from "./adherence-parts"

const L = labels.adherence
const C = L.columns
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * Ordem padrão alfabética. Por taxa, a pedido do gestor: quem tem amostra
 * suficiente vem primeiro, da maior para a menor; amostra pequena fica no fim,
 * em ordem alfabética — não se compara 1 de 1 com 12 de 15.
 */
function sortRows(rows: MemberAdherenceRow[], sort: AdherenceSort): MemberAdherenceRow[] {
  const byName = (a: MemberAdherenceRow, b: MemberAdherenceRow) => a.member.preferredName.localeCompare(b.member.preferredName)
  if (sort === "name") return [...rows].sort(byName)
  return [...rows].sort((a, b) => {
    const la = a.adherence.adherenceRate.lowConfidence
    const lb = b.adherence.adherenceRate.lowConfidence
    if (la !== lb) return la ? 1 : -1
    if (la) return byName(a, b)
    return (b.adherence.adherenceRate.value ?? 0) - (a.adherence.adherenceRate.value ?? 0) || byName(a, b)
  })
}

/** Contexto sugerido para o feedback: os números, nunca um juízo. */
function suggestionFor(row: MemberAdherenceRow, from: Date, to: Date): string {
  const a = row.adherence
  const t = row.trend
  return fill(L.suggestion, {
    from: formatDate(from, "business"),
    to: formatDate(to, "business"),
    onTime: a.doneOnTime,
    total: a.totalDue,
    rate: formatRate(a.adherenceRate),
    adjusted: `${formatRate(a.adjustedRate)} ${plural(L.agreementsParen, a.adjustedRate.denominator)}`,
    trend:
      t.reliable && percent(t.previous) !== null && percent(t.current) !== null
        ? fill(L.suggestionTrend, { previous: percent(t.previous)!, current: percent(t.current)! })
        : "",
  })
}

export function AdherenceTable({
  rows,
  sort,
  from,
  to,
  canWrite,
}: {
  rows: MemberAdherenceRow[]
  sort: AdherenceSort
  from: Date
  to: Date
  canWrite: boolean
}) {
  const [feedback, setFeedback] = React.useState<MemberAdherenceRow | null>(null)

  const columns: DataTableColumn<MemberAdherenceRow>[] = [
    {
      id: "member",
      header: C.member,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar size="sm">
            <AvatarFallback style={avatarColors(r.member.id)}>{initials(r.member.fullName)}</AvatarFallback>
          </Avatar>
          <Link href={`/team/${r.member.id}/agreements`} className="block truncate font-medium text-ink hover:underline">
            {r.member.preferredName}
          </Link>
        </span>
      ),
      title: (r) => r.member.fullName,
      stacked: "primary",
    },
    { id: "seniority", header: C.seniority, cell: (r) => <span className="text-ink-secondary">{r.member.seniorityLabel}</span>, width: "104px", hideBelow: "lg" },
    {
      id: "total",
      stackedOrder: 1,
      header: C.total,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span className="font-mono text-ink">{r.adherence.totalDue}</span>
          {r.adherence.adherenceRate.lowConfidence && r.adherence.totalDue > 0 ? <LowConfidenceMark /> : null}
        </span>
      ),
      title: () => undefined,
      width: "160px",
    },
    { id: "onTime", header: C.onTime, cell: (r) => <span className="font-mono">{r.adherence.doneOnTime}</span>, width: "88px", hideBelow: "xl" },
    {
      id: "rate",
      stackedOrder: 2,
      header: C.rate,
      cell: (r) => (
        <span className={cn("font-mono", r.adherence.adherenceRate.lowConfidence ? "text-ink-secondary" : "text-ink")}>
          {formatRate(r.adherence.adherenceRate)}
        </span>
      ),
      title: (r) => plural(L.agreements, r.adherence.adherenceRate.denominator),
      width: "120px",
    },
    {
      id: "adjusted",
      header: C.adjusted,
      cell: (r) => (
        <span className="flex items-baseline gap-1.5">
          <span className={cn("font-mono", r.adherence.adjustedRate.lowConfidence ? "text-ink-secondary" : "text-ink")}>
            {formatRate(r.adherence.adjustedRate)}
          </span>
          <span className="text-xs text-ink-secondary">{plural(L.agreementsParen, r.adherence.adjustedRate.denominator)}</span>
        </span>
      ),
      title: () => L.adjusted,
      width: "168px",
      hideBelow: "lg",
    },
    {
      id: "drag",
      header: C.drag,
      cell: (r) =>
        r.adherence.avgReschedules === null ? (
          <span className="text-ink-secondary">—</span>
        ) : (
          <span className="font-mono text-ink-secondary">{fill(L.dragValue, { value: decimal.format(r.adherence.avgReschedules) })}</span>
        ),
      title: () => undefined,
      width: "136px",
      hideBelow: "xl",
    },
    { id: "trend", header: C.trend, cell: (r) => <TrendIndicator trend={r.trend} compact />, title: () => L.trendHelp, width: "112px" },
  ]
  if (canWrite) {
    columns.push({
      id: "actions",
      header: C.actions,
      cell: (r) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={fill(L.feedbackFor, { name: r.member.preferredName })}
          title={L.feedback}
          onClick={() => setFeedback(r)}
        >
          <MessageSquarePlusIcon />
        </Button>
      ),
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
        rows={sortRows(rows, sort)}
        getRowId={(r) => r.member.id}
        label={L.tableLabel}
        empty={{ title: L.emptyTitle, direction: L.emptyDirection }}
      />
      {feedback ? (
        <FeedbackDialog
          open
          onOpenChange={(open) => !open && setFeedback(null)}
          member={{ id: feedback.member.id, preferredName: feedback.member.preferredName }}
          suggestion={suggestionFor(feedback, from, to)}
        />
      ) : null}
    </>
  )
}
