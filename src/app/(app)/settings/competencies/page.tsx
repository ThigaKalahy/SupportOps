import type { Metadata } from "next"

import { CompetenciesSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listCompetencies } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.competencies} · ${labels.app.name}`,
}

export default async function CompetenciesPage() {
  const user = await requireUser()
  return <CompetenciesSettings items={await listCompetencies(user)} canWrite={canWrite(user)} />
}
