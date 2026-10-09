import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ReclassificationReasonsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { settingsTabEnabled, settingsTabFor } from "@/lib/settings-tabs"
import { canWrite, requireTeamContext } from "@/server/scope"
import { listReclassificationReasons } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.reclassificationReasons} · ${labels.app.name}`,
}

export default async function ReclassificationReasonsPage() {
  const ctx = await requireTeamContext()
  // Catálogo de módulo desligado no time (D32): a rota não existe.
  if (!settingsTabEnabled(settingsTabFor("/settings/reclassification-reasons"), ctx.modules)) notFound()
  return <ReclassificationReasonsSettings items={await listReclassificationReasons(ctx)} canWrite={canWrite(ctx)} />
}
