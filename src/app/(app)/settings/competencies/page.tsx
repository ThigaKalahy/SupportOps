import type { Metadata } from "next"

import { CompetenciesSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { canWrite, requireTeamContext } from "@/server/scope"
import { listCompetencies } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.competencies} · ${labels.app.name}`,
}

export default async function CompetenciesPage() {
  const ctx = await requireTeamContext()
  return <CompetenciesSettings items={await listCompetencies(ctx)} canWrite={canWrite(ctx)} />
}
