import type { Metadata } from "next"

import { ReclassificationReasonsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listReclassificationReasons } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.reclassificationReasons} · ${labels.app.name}`,
}

export default async function ReclassificationReasonsPage() {
  const user = await requireUser()
  return <ReclassificationReasonsSettings items={await listReclassificationReasons(user)} canWrite={canWrite(user)} />
}
