import type { Metadata } from "next"

import { CompetencyMatrix } from "@/components/settings/competency-matrix"
import { labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { getExpectationMatrix } from "@/server/queries/development"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.competencyMatrix} · ${labels.app.name}`,
}

export default async function CompetencyMatrixPage() {
  const user = await requireUser()
  return <CompetencyMatrix matrix={await getExpectationMatrix(user)} canWrite={canWrite(user)} />
}
