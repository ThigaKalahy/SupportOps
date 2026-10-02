import { notFound } from "next/navigation"

import { AgreementsView } from "@/components/agreements/agreements-view"
import { parseAgreementFilters } from "@/lib/agreement-filters"
import { canWrite } from "@/server/access"
import { listAgreements } from "@/server/queries/agreements"

import { loadProfile } from "../data"

/** Combinados da pessoa: as mesmas abas e tabela de /agreements, filtradas por ela. */
export default async function MemberAgreementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { memberId } = await params
  const { user, profile } = await loadProfile(memberId)
  if (!profile) notFound()

  const raw = await searchParams
  const view = parseAgreementFilters(raw).view
  const filters = { ...parseAgreementFilters({}), view, memberId: profile.id }
  const { rows, counts } = await listAgreements(user, filters)
  const search = new URLSearchParams(typeof raw.view === "string" ? { view: raw.view } : {})

  return (
    <AgreementsView
      basePath={`/team/${profile.id}/agreements`}
      search={search}
      filters={filters}
      rows={rows}
      counts={counts}
      canWrite={canWrite(user) && profile.status !== "INACTIVE"}
      showMember={false}
    />
  )
}
