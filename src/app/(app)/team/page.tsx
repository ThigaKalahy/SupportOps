import type { Metadata } from "next"

import { ContextActions } from "@/components/shell/context-actions"
import { PageHeader } from "@/components/ui/page-header"
import { formatTenure, todayBusinessDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { getMemberFormCatalogs, listMembersForEdit, listTeamMembers } from "@/server/queries/members"

import { TeamTable } from "./_components/team-table"
import { TeamToolbar } from "./_components/team-toolbar"
import { parseTeamView } from "./params"

export const metadata: Metadata = {
  title: `${labels.nav.team} · ${labels.app.name}`,
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const writer = canWrite(user)
  const catalogs = await getMemberFormCatalogs(user)
  const view = parseTeamView(await searchParams, catalogs.seniorities.map((s) => s.key))

  const rows = await listTeamMembers(user, {
    seniority: view.seniority ?? undefined,
    status: view.status,
    needsAttention: view.needsAttention,
  })
  const editable = writer ? await listMembersForEdit(user, rows.map((r) => r.id)) : null

  const today = todayBusinessDate()
  const tableRows = rows.map((r) => ({ ...r, tenure: formatTenure(r.joinedAt, today) }))
  const filtered = view.seniority !== null || view.status === "inactive" || view.needsAttention
  const subtitle =
    rows.length === 1 ? labels.team.personCount : fill(labels.team.peopleCount, { count: rows.length })

  return (
    <div className="flex flex-col gap-6">
      <ContextActions>
        <TeamToolbar
          view={view}
          seniorities={catalogs.seniorities.map((s) => ({ key: s.key, label: s.label }))}
          catalogs={writer ? catalogs : null}
        />
      </ContextActions>
      <PageHeader title={labels.nav.team} subtitle={subtitle} />
      <TeamTable
        rows={tableRows}
        grouped={view.grouped}
        filtered={filtered}
        catalogs={writer ? catalogs : null}
        editable={editable}
      />
    </div>
  )
}
