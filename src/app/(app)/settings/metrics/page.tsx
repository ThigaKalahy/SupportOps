import type { Metadata } from "next"

import { MetricsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { canWrite, requireTeamContext } from "@/server/scope"
import { listMetrics } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.metrics} · ${labels.app.name}`,
}

export default async function MetricsPage() {
  const ctx = await requireTeamContext()
  return <MetricsSettings items={await listMetrics(ctx)} canWrite={canWrite(ctx)} />
}
