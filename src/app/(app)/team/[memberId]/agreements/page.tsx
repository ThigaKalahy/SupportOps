import { notFound } from "next/navigation"

import { AdherencePanel } from "@/components/adherence/adherence-panel"
import { AgreementsView } from "@/components/agreements/agreements-view"
import { parseAgreementFilters } from "@/lib/agreement-filters"
import { MODULES } from "@/lib/modules"
import { canWrite, hasModule } from "@/server/scope"
import { getMemberAdherenceProfile } from "@/server/queries/adherence"
import { listAgreements } from "@/server/queries/agreements"

import { loadProfile } from "../data"

/**
 * Combinados da pessoa: o cumprimento dos últimos 90 dias em cima e, abaixo,
 * as mesmas abas e tabela de /agreements, filtradas por ela.
 */
export default async function MemberAgreementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { memberId } = await params
  const { ctx, profile } = await loadProfile(memberId)
  if (!profile) notFound()

  const raw = await searchParams
  const view = parseAgreementFilters(raw).view
  const filters = { ...parseAgreementFilters({}), view, memberId: profile.id }
  const [{ rows, counts }, adherence] = await Promise.all([
    listAgreements(ctx, filters),
    getMemberAdherenceProfile(ctx, profile.id),
  ])
  const search = new URLSearchParams(typeof raw.view === "string" ? { view: raw.view } : {})

  return (
    <div className="flex flex-col gap-8">
      <AdherencePanel {...adherence} />
      <AgreementsView
        showCentral={hasModule(ctx, MODULES.CENTRALS)}
        basePath={`/team/${profile.id}/agreements`}
        search={search}
        filters={filters}
        rows={rows}
        counts={counts}
        canWrite={canWrite(ctx) && profile.status !== "INACTIVE"}
        showMember={false}
      />
    </div>
  )
}
