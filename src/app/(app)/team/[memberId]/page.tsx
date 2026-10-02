import { notFound } from "next/navigation"

import { SummaryEditor } from "@/components/member/summary-editor"
import { canWrite } from "@/server/access"
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

  const overview = await getMemberOverview(user, profile.id)
  const base = `/team/${profile.id}`

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
        {/* P12: bloco de cumprimento de combinados entra aqui. P11: bloco de validação de prioridade, logo abaixo. */}
        <ActivePlans plans={overview.plans} href={`${base}/development`} />
        <Mentorships overview={overview} />
        <Rhythm overview={overview} lastOneOnOne={profile.lastOneOnOne} seniorityKey={profile.seniorityKey} />
      </div>
    </div>
  )
}
