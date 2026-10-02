import type { Metadata } from "next"

import { LowConfidenceMark } from "@/components/adherence/adherence-parts"
import { AdherenceTable } from "@/components/adherence/adherence-table"
import { ContextActions } from "@/components/shell/context-actions"
import { PageHeader } from "@/components/ui/page-header"
import { ADHERENCE, percent } from "@/lib/adherence"
import { adherenceRange, parseAdherenceFilters } from "@/lib/adherence-filters"
import { formatDate } from "@/lib/dates"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { getTeamAdherence } from "@/server/queries/adherence"

import { AdherenceToolbar } from "./_components/adherence-toolbar"

const L = labels.adherence

export const metadata: Metadata = {
  title: `${L.title} · ${labels.app.name}`,
}

/**
 * Cumprimento do time: uma linha por pessoa, taxa bruta e ajustada com o
 * total, arrasto e a tendência de 30 dias. Não é ranking (D7): a ordem padrão
 * é alfabética, e amostra pequena é marcada e fica fora da taxa do time.
 * Nada daqui vai para feedback sozinho — "Registrar feedback" é ato do gestor.
 */
export default async function TeamAdherencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const filters = parseAdherenceFilters(await searchParams)
  const range = adherenceRange(filters)
  const team = await getTeamAdherence(user, range.from, range.to)
  const rate = percent(team.teamRate)

  return (
    <div className="flex flex-col gap-6">
      <ContextActions>
        <AdherenceToolbar filters={filters} />
      </ContextActions>
      <PageHeader
        title={L.title}
        subtitle={fill(L.teamSubtitle, { from: formatDate(team.from, "business"), to: formatDate(team.to, "business") })}
      />
      <AdherenceTable rows={team.members} sort={filters.sort} from={team.from} to={team.to} canWrite={canWrite(user)} />
      <div className="flex flex-col gap-1 border-t border-line pt-3 text-sm text-ink">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {fill(L.teamLine, {
            total: plural(L.agreements, team.totalDue),
            rate:
              rate === null
                ? L.teamRateNone
                : fill(L.teamRate, { rate, onTime: team.teamRate.numerator, total: team.teamRate.denominator }),
            blocker: team.topBlocker
              ? `${team.topBlocker.label ?? L.blockerNoReason}${team.topBlocker.category ? ` (${enumLabel("blockerCategory", team.topBlocker.category)})` : ""}, ${plural(L.blockersCount, team.topBlocker.count)}`
              : L.teamBlockerNone,
          })}
          {team.teamRate.lowConfidence && team.teamRate.denominator > 0 ? <LowConfidenceMark /> : null}
        </p>
        {team.excludedMembers > 0 ? (
          <p className="text-xs text-ink-secondary">
            {plural(L.teamExcluded, team.excludedMembers, { min: ADHERENCE.minSample })}
          </p>
        ) : null}
      </div>
    </div>
  )
}
