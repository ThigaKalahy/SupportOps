import type { Metadata } from "next"

import { MetricsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listMetrics } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.metrics} · ${labels.app.name}`,
}

export default async function MetricsPage() {
  const user = await requireUser()
  return <MetricsSettings items={await listMetrics(user)} canWrite={canWrite(user)} />
}
