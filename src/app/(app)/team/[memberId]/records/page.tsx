import { notFound } from "next/navigation"

import { RecordsTable } from "@/components/records/records-table"
import { RecordsToolbar } from "@/components/records/records-toolbar"
import { ContextActions } from "@/components/shell/context-actions"
import { labels } from "@/lib/labels"
import { hasRecordFilters, parseRecordFilters } from "@/lib/records-filters"
import { canWrite } from "@/server/access"
import { listRecords } from "@/server/queries/records"

import { loadProfile } from "../data"

const R = labels.records

/** 1:1 e feedbacks da pessoa: o mesmo índice de /records, filtrado por ela. */
export default async function MemberRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { memberId } = await params
  const { user, profile } = await loadProfile(memberId)
  if (!profile) notFound()

  const query = await searchParams
  const open = typeof query.open === "string" ? query.open : null
  const filters = { ...parseRecordFilters(query), memberId: profile.id }
  const rows = await listRecords(user, filters)

  return (
    <>
      <ContextActions>
        <RecordsToolbar filters={filters} />
      </ContextActions>
      <RecordsTable
        rows={rows}
        initialOpen={open}
        showMember={false}
        canWrite={canWrite(user) && profile.status !== "INACTIVE"}
        empty={{ title: R.emptyTitle, direction: hasRecordFilters({ ...filters, memberId: null }) ? R.filteredDirection : R.emptyDirection }}
      />
    </>
  )
}
