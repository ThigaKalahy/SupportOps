import type { Metadata } from "next"

import { ScoreList } from "@/components/settings/score-list"
import { labels } from "@/lib/labels"
import { canWrite, requireTeamContext } from "@/server/scope"
import { listScoreDefinitions } from "@/server/queries/score"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.score} · ${labels.app.name}`,
}

/** Definições de score e versões. Arquitetura apenas: nada é calculado (D5). */
export default async function ScorePage() {
  const ctx = await requireTeamContext()
  return <ScoreList definitions={await listScoreDefinitions(ctx)} canWrite={canWrite(ctx)} />
}
