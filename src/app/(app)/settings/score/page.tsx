import type { Metadata } from "next"

import { ScoreList } from "@/components/settings/score-list"
import { labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listScoreDefinitions } from "@/server/queries/score"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.score} · ${labels.app.name}`,
}

/** Definições de score e versões. Arquitetura apenas: nada é calculado (D5). */
export default async function ScorePage() {
  const user = await requireUser()
  return <ScoreList definitions={await listScoreDefinitions(user)} canWrite={canWrite(user)} />
}
