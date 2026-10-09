import type { Metadata } from "next"

import { BlockerReasonsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { canWrite, requireTeamContext } from "@/server/scope"
import { listBlockerReasons } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.blockerReasons} · ${labels.app.name}`,
}

export default async function BlockerReasonsPage() {
  const ctx = await requireTeamContext()
  return <BlockerReasonsSettings items={await listBlockerReasons(ctx)} canWrite={canWrite(ctx)} />
}
