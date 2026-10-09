import type { Metadata } from "next"

import { CompetencyMatrix } from "@/components/settings/competency-matrix"
import { labels } from "@/lib/labels"
import { canWrite, requireTeamContext } from "@/server/scope"
import { getExpectationMatrix } from "@/server/queries/development"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.competencyMatrix} · ${labels.app.name}`,
}

export default async function CompetencyMatrixPage() {
  const ctx = await requireTeamContext()
  return <CompetencyMatrix matrix={await getExpectationMatrix(ctx)} canWrite={canWrite(ctx)} />
}
