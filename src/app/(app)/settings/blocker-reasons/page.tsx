import type { Metadata } from "next"

import { BlockerReasonsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listBlockerReasons } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.blockerReasons} · ${labels.app.name}`,
}

export default async function BlockerReasonsPage() {
  const user = await requireUser()
  return <BlockerReasonsSettings items={await listBlockerReasons(user)} canWrite={canWrite(user)} />
}
