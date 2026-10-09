import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { TicketPatternsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { settingsTabEnabled, settingsTabFor } from "@/lib/settings-tabs"
import { canWrite, requireTeamContext } from "@/server/scope"
import { listTicketPatterns } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.ticketPatterns} · ${labels.app.name}`,
}

export default async function TicketPatternsPage() {
  const ctx = await requireTeamContext()
  // Catálogo de módulo desligado no time (D32): a rota não existe.
  if (!settingsTabEnabled(settingsTabFor("/settings/ticket-patterns"), ctx.modules)) notFound()
  return <TicketPatternsSettings items={await listTicketPatterns(ctx)} canWrite={canWrite(ctx)} />
}
