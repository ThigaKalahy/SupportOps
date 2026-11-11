import type { Metadata } from "next"

import { ThresholdSettings } from "@/components/settings/threshold-settings"
import { labels } from "@/lib/labels"
import { canWrite, requireTeamContext } from "@/server/scope"
import { getThresholds, listThresholdSettings } from "@/server/queries/thresholds"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.thresholds} · ${labels.app.name}`,
}

export default async function ThresholdsPage() {
  const ctx = await requireTeamContext()
  const [settings, thresholds] = await Promise.all([listThresholdSettings(ctx), getThresholds(ctx)])
  return <ThresholdSettings settings={settings} canWrite={canWrite(ctx)} oneOnOneSince={thresholds.oneOnOneSince} />
}
