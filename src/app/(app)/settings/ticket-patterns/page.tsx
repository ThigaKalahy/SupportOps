import type { Metadata } from "next"

import { TicketPatternsSettings } from "@/components/settings/catalogs"
import { labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listTicketPatterns } from "@/server/queries/settings"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.ticketPatterns} · ${labels.app.name}`,
}

export default async function TicketPatternsPage() {
  const user = await requireUser()
  return <TicketPatternsSettings items={await listTicketPatterns(user)} canWrite={canWrite(user)} />
}
