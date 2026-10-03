import type { Metadata } from "next"

import { ThresholdSettings } from "@/components/settings/threshold-settings"
import { labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listThresholdSettings } from "@/server/queries/thresholds"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.thresholds} · ${labels.app.name}`,
}

export default async function ThresholdsPage() {
  const user = await requireUser()
  return <ThresholdSettings settings={await listThresholdSettings(user)} canWrite={canWrite(user)} />
}
