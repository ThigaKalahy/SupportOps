import type { Metadata } from "next"

import { CentralsSettings } from "@/components/settings/centrals-settings"
import { labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listCentralSettings } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.centrals} · ${labels.app.name}`,
}

/** Centrais de atendimento (P19): cadastro, desativação e importação por colagem. */
export default async function CentralsPage() {
  const user = await requireUser()
  return <CentralsSettings items={await listCentralSettings(user)} canWrite={canWrite(user)} />
}
