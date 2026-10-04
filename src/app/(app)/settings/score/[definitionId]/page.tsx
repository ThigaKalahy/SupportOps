import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ScoreDetail } from "@/components/settings/score-detail"
import { CrumbLabel } from "@/components/shell/crumb-label"
import { fill, labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { getScoreDefinition } from "@/server/queries/score"

export const metadata: Metadata = {
  title: `${labels.settings.tabs.score} · ${labels.app.name}`,
}

export default async function ScoreDefinitionPage({ params }: { params: Promise<{ definitionId: string }> }) {
  const { definitionId } = await params
  const user = await requireUser()
  const data = await getScoreDefinition(user, definitionId)
  if (!data) notFound()
  return (
    <>
      <CrumbLabel
        segment={data.definition.id}
        label={`${data.definition.name} ${fill(labels.settings.score.versionLabel, { version: data.definition.version })}`}
      />
      <ScoreDetail definition={data.definition} versions={data.versions} metrics={data.metrics} canWrite={canWrite(user)} />
    </>
  )
}
