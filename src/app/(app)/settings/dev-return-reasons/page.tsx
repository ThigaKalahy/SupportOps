import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DevReturnReasonsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { settingsTabEnabled, settingsTabFor } from "@/lib/settings-tabs"
import { canWrite, requireTeamContext } from "@/server/scope"
import { listDevReturnReasons } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.devReturnReasons} · ${labels.app.name}`,
}

/** Motivos de devolução do desenvolvimento (P20): categoria e ordem. */
export default async function DevReturnReasonsPage() {
  const ctx = await requireTeamContext()
  // Catálogo de módulo desligado no time (D32): a rota não existe.
  if (!settingsTabEnabled(settingsTabFor("/settings/dev-return-reasons"), ctx.modules)) notFound()
  return <DevReturnReasonsSettings items={await listDevReturnReasons(ctx)} canWrite={canWrite(ctx)} />
}
