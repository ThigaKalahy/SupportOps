import type { Metadata } from "next"

import { DevReturnReasonsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listDevReturnReasons } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.devReturnReasons} · ${labels.app.name}`,
}

/** Motivos de devolução do desenvolvimento (P20): categoria e ordem. */
export default async function DevReturnReasonsPage() {
  const user = await requireUser()
  return <DevReturnReasonsSettings items={await listDevReturnReasons(user)} canWrite={canWrite(user)} />
}
