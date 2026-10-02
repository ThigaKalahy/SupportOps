import { notFound } from "next/navigation"

import { AdherenceSummary } from "@/components/adherence/adherence-summary"
import { SummaryEditor } from "@/components/member/summary-editor"
import { ProfileValidationBlock } from "@/components/priority-validations/profile-validation-block"
import { todayBusinessDate } from "@/lib/dates"
import { toUrlDate, VALIDATION_PARAMS } from "@/lib/validation-filters"
import { canWrite } from "@/server/access"
import { getMemberAdherenceProfile } from "@/server/queries/adherence"
import { memberValidationSummary } from "@/server/queries/priority-validations"
import { getMemberOverview } from "@/server/queries/profile"

import {
  ActivePlans,
  Mentorships,
  OpenAgreements,
  RecentEvents,
  Rhythm,
  Traits,
} from "./_components/overview-blocks"
import { loadProfile } from "./data"

/**
 * Visão geral: "o que está acontecendo com essa pessoa agora".
 * Coluna larga — resumo gerencial, últimos registros, pontos fortes e de
 * desenvolvimento. Coluna estreita — pendências e ritmo. Sem gráfico, sem
 * KPI em card, nada que o cabeçalho já mostre.
 */
export default async function MemberOverviewPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params
  const { user, profile } = await loadProfile(memberId)
  if (!profile) notFound()

  const today = todayBusinessDate()
  const [overview, validations, adherence] = await Promise.all([
    getMemberOverview(user, profile.id),
    memberValidationSummary(user, profile.id, today),
    getMemberAdherenceProfile(user, profile.id, today),
  ])
  const base = `/team/${profile.id}`
  const windowStart = new Date(today)
  windowStart.setUTCDate(windowStart.getUTCDate() - (validations.days - 1))
  const validationsHref = `/priority-validations?${new URLSearchParams({
    [VALIDATION_PARAMS.period]: "custom",
    [VALIDATION_PARAMS.from]: toUrlDate(windowStart),
    [VALIDATION_PARAMS.to]: toUrlDate(today),
    [VALIDATION_PARAMS.member]: profile.id,
  })}`

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-8">
        <SummaryEditor
          memberId={profile.id}
          summary={profile.managerSummary}
          canEdit={canWrite(user) && profile.status !== "INACTIVE"}
        />
        <RecentEvents events={overview.recentEvents} timelineHref={`${base}/timeline`} />
        <Traits overview={overview} />
      </div>

      <div className="flex min-w-0 flex-col gap-8 lg:border-l lg:border-line lg:pl-8">
        <OpenAgreements agreements={overview.agreements} href={`${base}/agreements`} />
        <AdherenceSummary
          adherence={adherence.adherence}
          trend={adherence.trend}
          series={adherence.series}
          days={adherence.days}
          href={`${base}/agreements`}
        />
        <ProfileValidationBlock
          data={{
            days: validations.days,
            total: validations.summary.total,
            changed: validations.summary.changed,
            changeRate: validations.summary.changeRate,
            topReason: validations.topReason,
          }}
          member={{ id: profile.id, preferredName: profile.preferredName }}
          canWrite={canWrite(user) && profile.status !== "INACTIVE"}
          href={validationsHref}
        />
        <ActivePlans plans={overview.plans} href={`${base}/development`} />
        <Mentorships overview={overview} />
        <Rhythm overview={overview} lastOneOnOne={profile.lastOneOnOne} seniorityKey={profile.seniorityKey} />
      </div>
    </div>
  )
}
