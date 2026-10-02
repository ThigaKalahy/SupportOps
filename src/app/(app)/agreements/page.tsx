import type { Metadata } from "next"

import { AgreementsView } from "@/components/agreements/agreements-view"
import { ContextActions } from "@/components/shell/context-actions"
import { PageHeader } from "@/components/ui/page-header"
import { parseAgreementFilters } from "@/lib/agreement-filters"
import { labels, plural } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listAgreementMembers, listAgreements } from "@/server/queries/agreements"
import { getMemberFormCatalogs } from "@/server/queries/members"

import { AgreementsToolbar } from "./_components/agreements-toolbar"

export const metadata: Metadata = {
  title: `${labels.nav.agreements} · ${labels.app.name}`,
}

/**
 * Central de combinados: abas com estado na URL, filtros no popover e a
 * tabela ordenada por urgência (vencidos, vencendo, depois por prazo).
 */
export default async function AgreementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const raw = await searchParams
  const filters = parseAgreementFilters(raw)
  const [{ rows, counts }, members, catalogs] = await Promise.all([
    listAgreements(user, filters),
    listAgreementMembers(user),
    getMemberFormCatalogs(user),
  ])
  const search = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
  )

  return (
    <div className="flex flex-col gap-6">
      <ContextActions>
        <AgreementsToolbar
          filters={filters}
          members={members}
          seniorities={catalogs.seniorities.map((s) => ({ key: s.key, label: s.label }))}
          canWrite={canWrite(user)}
        />
      </ContextActions>
      <PageHeader title={labels.nav.agreements} subtitle={plural(labels.agreements.count, rows.length)} />
      <AgreementsView
        basePath="/agreements"
        search={search}
        filters={filters}
        rows={rows}
        counts={counts}
        canWrite={canWrite(user)}
      />
    </div>
  )
}
