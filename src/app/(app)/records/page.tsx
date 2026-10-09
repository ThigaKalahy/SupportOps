import type { Metadata } from "next"

import { RecordsTable } from "@/components/records/records-table"
import { RecordsToolbar } from "@/components/records/records-toolbar"
import { ContextActions } from "@/components/shell/context-actions"
import { PageHeader } from "@/components/ui/page-header"
import { labels, plural } from "@/lib/labels"
import { hasRecordFilters, parseRecordFilters } from "@/lib/records-filters"
import { canWrite, requireTeamContext } from "@/server/scope"
import { listAgreementMembers } from "@/server/queries/agreements"
import { listRecords } from "@/server/queries/records"

const R = labels.records

export const metadata: Metadata = {
  title: `${labels.nav.records} · ${labels.app.name}`,
}

/** Índice cruzado de 1:1 e feedbacks do time, com o follow-up de cada um. */
export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTeamContext()
  const params = await searchParams
  const open = typeof params.open === "string" ? params.open : null
  const filters = parseRecordFilters(params)
  const [rows, members] = await Promise.all([listRecords(ctx, filters), listAgreementMembers(ctx)])

  return (
    <div className="flex flex-col gap-6">
      <ContextActions>
        <RecordsToolbar filters={filters} members={members} />
      </ContextActions>
      <PageHeader title={R.title} subtitle={`${plural(R.count, rows.length)} · ${R.subtitle}`} />
      <RecordsTable
        rows={rows}
        initialOpen={open}
        canWrite={canWrite(ctx)}
        empty={{ title: R.emptyTitle, direction: hasRecordFilters(filters) ? R.filteredDirection : canWrite(ctx) ? R.emptyDirection : R.emptyDirectionReadOnly }}
      />
    </div>
  )
}
