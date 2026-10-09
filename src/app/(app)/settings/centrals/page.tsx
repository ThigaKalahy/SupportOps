import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CentralsSettings } from "@/components/settings/centrals-settings"
import { labels } from "@/lib/labels"
import { settingsTabEnabled, settingsTabFor } from "@/lib/settings-tabs"
import { canWrite, requireTeamContext } from "@/server/scope"
import { listCentralSettings } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.centrals} · ${labels.app.name}`,
}

/** Centrais de atendimento (P19): cadastro, desativação e importação por colagem. */
export default async function CentralsPage() {
  const ctx = await requireTeamContext()
  // Catálogo de módulo desligado no time (D32): a rota não existe.
  if (!settingsTabEnabled(settingsTabFor("/settings/centrals"), ctx.modules)) notFound()
  return <CentralsSettings items={await listCentralSettings(ctx)} canWrite={canWrite(ctx)} />
}
