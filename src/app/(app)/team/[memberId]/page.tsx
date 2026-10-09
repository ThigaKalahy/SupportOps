import { notFound } from "next/navigation"

import { AdherenceSummary } from "@/components/adherence/adherence-summary"
import { SummaryEditor } from "@/components/member/summary-editor"
import { ProfileDevReturnBlock } from "@/components/dev-returns/profile-dev-return-block"
import { ProfileValidationBlock } from "@/components/priority-validations/profile-validation-block"
import { ProfileWatchBlock } from "@/components/watch/profile-watch-block"
import { todayBusinessDate } from "@/lib/dates"
import { DEV_RETURN_PARAMS } from "@/lib/dev-return-filters"
import { toUrlDate, VALIDATION_PARAMS } from "@/lib/validation-filters"
import { MODULES } from "@/lib/modules"
import { canWrite, hasModule } from "@/server/scope"
import { getMemberAdherenceProfile } from "@/server/queries/adherence"
import { getMemberDevReturnProfile } from "@/server/queries/dev-returns"
import { memberValidationSummary } from "@/server/queries/priority-validations"
import { getMemberOverview } from "@/server/queries/profile"
import { getThresholds } from "@/server/queries/thresholds"
import { memberWatchItems } from "@/server/queries/watch"

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
  const { ctx, profile } = await loadProfile(memberId)
  if (!profile) notFound()

  const today = todayBusinessDate()
  // Módulos opcionais desligados no time (D32): o bloco não existe e a query não roda.
  const withValidations = hasModule(ctx, MODULES.PRIORITY_VALIDATION)
  const withDevReturns = hasModule(ctx, MODULES.DEV_RETURNS)
  const [overview, validations, adherence, thresholds, devReturns] = await Promise.all([
    getMemberOverview(ctx, profile.id),
    withValidations ? memberValidationSummary(ctx, profile.id, today) : null,
    getMemberAdherenceProfile(ctx, profile.id, today),
    getThresholds(ctx),
    withDevReturns ? getMemberDevReturnProfile(ctx, profile.id, today) : null,
  ])
  const watching = await memberWatchItems(ctx, profile.id, thresholds)
  const base = `/team/${profile.id}`
  const windowStart = new Date(today)
  windowStart.setUTCDate(windowStart.getUTCDate() - ((validations?.days ?? 1) - 1))
  const validationsHref = `/priority-validations?${new URLSearchParams({
    [VALIDATION_PARAMS.period]: "custom",
    [VALIDATION_PARAMS.from]: toUrlDate(windowStart),
    [VALIDATION_PARAMS.to]: toUrlDate(today),
    [VALIDATION_PARAMS.member]: profile.id,
  })}`
  const devReturnsStart = new Date(today)
  devReturnsStart.setUTCDate(devReturnsStart.getUTCDate() - ((devReturns?.days ?? 1) - 1))
  const devReturnsHref = `/dev-returns?${new URLSearchParams({
    [DEV_RETURN_PARAMS.period]: "custom",
    [DEV_RETURN_PARAMS.from]: toUrlDate(devReturnsStart),
    [DEV_RETURN_PARAMS.to]: toUrlDate(today),
    [DEV_RETURN_PARAMS.member]: profile.id,
  })}`

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-8">
        <SummaryEditor
          memberId={profile.id}
          summary={profile.managerSummary}
          canEdit={canWrite(ctx) && profile.status !== "INACTIVE"}
        />
        <RecentEvents events={overview.recentEvents} timelineHref={`${base}/timeline`} />
        <Traits overview={overview} />
      </div>

      <div className="flex min-w-0 flex-col gap-8 lg:border-l lg:border-line lg:pl-8">
        <OpenAgreements agreements={overview.agreements} href={`${base}/agreements`} thresholds={thresholds} />
        <ProfileWatchBlock items={watching} member={{ id: profile.id, preferredName: profile.preferredName }} />
        <AdherenceSummary
          adherence={adherence.adherence}
          trend={adherence.trend}
          series={adherence.series}
          days={adherence.days}
          href={`${base}/agreements`}
        />
        {validations ? (
          <ProfileValidationBlock
            data={{
              days: validations.days,
              total: validations.summary.total,
              changed: validations.summary.changed,
              changeRate: validations.summary.changeRate,
              topReason: validations.topReason,
            }}
            member={{ id: profile.id, preferredName: profile.preferredName }}
            canWrite={canWrite(ctx) && profile.status !== "INACTIVE"}
            href={validationsHref}
          />
        ) : null}
        {devReturns ? (
          <ProfileDevReturnBlock
            data={{
              days: devReturns.days,
              total: devReturns.stats.total,
              attributable: devReturns.stats.attributable,
              ticketsValidated: devReturns.stats.ticketsValidated,
              lowConfidence: devReturns.stats.lowConfidence,
              topReason: devReturns.topReason,
              series: devReturns.series,
            }}
            member={{ id: profile.id, preferredName: profile.preferredName }}
            canWrite={canWrite(ctx) && profile.status !== "INACTIVE"}
            href={devReturnsHref}
          />
        ) : null}
        <ActivePlans plans={overview.plans} href={`${base}/development`} thresholds={thresholds} />
        <Mentorships overview={overview} />
        <Rhythm overview={overview} lastOneOnOne={profile.lastOneOnOne} seniorityKey={profile.seniorityKey} thresholds={thresholds} />
      </div>
    </div>
  )
}
