import type { Metadata } from "next"

import { DevReturnSummary } from "@/components/dev-returns/dev-return-summary"
import { DevReturnsWorkspace } from "@/components/dev-returns/dev-returns-workspace"
import { TriageTabs } from "@/components/priority-validations/triage-tabs"
import { ContextActions } from "@/components/shell/context-actions"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { StatusPill } from "@/components/ui/status-pill"
import { formatDate, formatDayMonth } from "@/lib/dates"
import { hasDevReturnFilters, parseDevReturnFilters } from "@/lib/dev-return-filters"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { OUTCOME_SEVERITY } from "@/lib/priority-validation"
import { canWrite, requireUser } from "@/server/access"
import { listCentralsForFilter } from "@/server/queries/centrals"
import { getDevReturnFormData, listDevReturns } from "@/server/queries/dev-returns"
import { activeWatchByLink } from "@/server/queries/watch"

import { DevReturnsToolbar } from "./_components/dev-returns-toolbar"

const D = labels.devReturns

export const metadata: Metadata = {
  title: `${D.title} · ${labels.app.name}`,
}

/**
 * Devoluções do desenvolvimento (P20, D21, D22): aba de "Validação de
 * prioridade". Formulário de registro rápido no topo, resumo do período com a
 * taxa sempre sobre os chamados validados (D19), tabela e a interseção com a
 * validação. Não escreve na timeline.
 */
export default async function DevReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const filters = parseDevReturnFilters(await searchParams)
  const writer = canWrite(user)
  const [formData, list, centrals] = await Promise.all([getDevReturnFormData(user), listDevReturns(user, filters), listCentralsForFilter(user)])

  const watching = writer ? await activeWatchByLink(user, "devReturnId", list.rows.map((r) => r.id)) : {}
  const isToday = filters.period === "today"
  const subtitle = isToday
    ? fill(D.subtitle.today, { date: formatDate(list.to, "business") })
    : fill(D.subtitle.range, { from: formatDate(list.from, "business"), to: formatDate(list.to, "business") })
  const periodEmpty = list.summary.total === 0
  const empty = {
    title: isToday ? D.empty.todayTitle : D.empty.periodTitle,
    direction: hasDevReturnFilters(filters)
      ? D.empty.filteredDirection
      : writer
        ? D.empty.todayDirection
        : D.empty.todayDirectionReadOnly,
  }

  return (
    <div className="flex flex-col gap-6">
      <ContextActions>
        <DevReturnsToolbar filters={filters} members={formData.members} reasons={formData.reasons} centrals={centrals} />
      </ContextActions>
      <PageHeader title={D.title} subtitle={subtitle} />
      <TriageTabs />
      {writer && formData.reasons.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink">{D.form.noReasons}</p>
      ) : null}
      <DevReturnsWorkspace
        form={writer && formData.reasons.length > 0 ? formData : null}
        rows={list.rows}
        canWrite={writer}
        empty={{ title: D.empty.filteredTitle, direction: D.empty.filteredDirection }}
        periodEmpty={periodEmpty}
        watching={watching}
        summary={
          periodEmpty ? (
            <div className="rounded-lg border border-line bg-surface">
              <EmptyState title={empty.title} direction={empty.direction} />
            </div>
          ) : (
            <DevReturnSummary stats={list.summary} />
          )
        }
        after={
          periodEmpty ? null : (
            <Section title={D.overlap.title} count={list.overlap.length}>
              <p className="-mt-2 max-w-3xl text-sm text-ink-secondary">{D.overlap.direction}</p>
              {list.overlap.length === 0 ? (
                <p className="text-sm text-ink-secondary">{D.overlap.empty}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
                  {list.overlap.map((o) => (
                    <li key={o.ticketRef} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="font-mono text-ink">{o.ticketRef}</span>
                      <span className="text-ink">{o.member.preferredName}</span>
                      <StatusPill severity={OUTCOME_SEVERITY[o.outcome]} label={enumLabel("validationOutcome", o.outcome)} />
                      <span className="text-xs text-ink-secondary">
                        {plural(D.overlap.returns, o.returns)} · {formatDayMonth(o.lastReturnedAt, "business")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )
        }
      />
    </div>
  )
}
