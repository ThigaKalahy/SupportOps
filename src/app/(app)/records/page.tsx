import type { Metadata } from "next"

import { RecordsTable } from "@/components/records/records-table"
import { RecordsToolbar } from "@/components/records/records-toolbar"
import { ContextActions } from "@/components/shell/context-actions"
import { PageHeader } from "@/components/ui/page-header"
import { labels, plural } from "@/lib/labels"
import { hasRecordFilters, parseRecordFilters } from "@/lib/records-filters"
import { requireUser } from "@/server/access"
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
  const user = await requireUser()
  const filters = parseRecordFilters(await searchParams)
  const [rows, members] = await Promise.all([listRecords(user, filters), listAgreementMembers(user)])

  return (
    <div className="flex flex-col gap-6">
      <ContextActions>
        <RecordsToolbar filters={filters} members={members} />
      </ContextActions>
      <PageHeader title={R.title} subtitle={`${plural(R.count, rows.length)} · ${R.subtitle}`} />
      <RecordsTable
        rows={rows}
        empty={{ title: R.emptyTitle, direction: hasRecordFilters(filters) ? R.filteredDirection : R.emptyDirection }}
      />
    </div>
  )
}
