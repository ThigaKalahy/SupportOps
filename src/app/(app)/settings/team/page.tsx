import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { TeamAdmin } from "@/components/settings/team-admin"
import { labels } from "@/lib/labels"
import { listTeamsForAdmin } from "@/server/queries/teams"
import { requireTeamContext } from "@/server/scope"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.team} · ${labels.app.name}`,
}

/** Times, módulos e acessos (P23). Só existe para quem administra a plataforma. */
export default async function TeamSettingsPage() {
  const ctx = await requireTeamContext()
  if (!ctx.isPlatformAdmin) notFound()
  const { teams, users } = await listTeamsForAdmin(ctx)
  return <TeamAdmin teams={teams} users={users} currentUserId={ctx.userId} />
}
