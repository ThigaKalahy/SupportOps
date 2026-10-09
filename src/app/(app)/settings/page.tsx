import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PriorityLevelsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { SETTINGS_TABS, settingsTabEnabled, settingsTabFor } from "@/lib/settings-tabs"
import { canWrite, requireTeamContext } from "@/server/scope"
import { listPriorityLevels } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.priorityLevels} · ${labels.app.name}`,
}

export default async function PriorityLevelsPage() {
  const ctx = await requireTeamContext()
  // Níveis de prioridade são do módulo de validação (D32): sem ele, /settings abre a primeira aba do time.
  if (!settingsTabEnabled(settingsTabFor("/settings"), ctx.modules)) {
    redirect(SETTINGS_TABS.find((tab) => settingsTabEnabled(tab, ctx.modules))!.href)
  }
  return <PriorityLevelsSettings items={await listPriorityLevels(ctx)} canWrite={canWrite(ctx)} />
}
