import type { Metadata } from "next"

import { PriorityLevelsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listPriorityLevels } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.priorityLevels} · ${labels.app.name}`,
}

export default async function PriorityLevelsPage() {
  const user = await requireUser()
  return <PriorityLevelsSettings items={await listPriorityLevels(user)} canWrite={canWrite(user)} />
}
