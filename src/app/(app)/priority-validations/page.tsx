import type { Metadata } from "next"

import { TriageTabs } from "@/components/priority-validations/triage-tabs"
import { ValidationsWorkspace } from "@/components/priority-validations/validations-workspace"
import { ContextActions } from "@/components/shell/context-actions"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatStrip } from "@/components/ui/stat-strip"
import { formatDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { hasValidationFilters, parseValidationFilters } from "@/lib/validation-filters"
import { canWrite, requireUser } from "@/server/access"
import { listCentralsForFilter } from "@/server/queries/centrals"
import { activeWatchByLink } from "@/server/queries/watch"
import { getValidationFormData, listValidations, type ValidationSummary } from "@/server/queries/priority-validations"

import { ValidationsToolbar } from "./_components/validations-toolbar"

const P = labels.priorityValidations
const S = P.summary

export const metadata: Metadata = {
  title: `${labels.nav.priorityValidations} · ${labels.app.name}`,
}

/** Resumo do período em uma faixa (não seis cards). A taxa vem sempre com o total (D19). */
function Summary({ summary }: { summary: ValidationSummary }) {
  return (
    <StatStrip
      aria-label={S.label}
      items={[
        { id: "evaluated", label: S.evaluated, value: summary.total },
        { id: "maintained", label: S.maintained, value: summary.maintained },
        {
          id: "changed",
          label: S.changed,
          value: summary.changed,
          coverage: summary.changeRate === null ? undefined : fill(S.changeRate, { rate: summary.changeRate, total: summary.total }),
        },
        { id: "raised", label: S.raised, value: summary.raised },
        { id: "lowered", label: S.lowered, value: summary.lowered },
        { id: "returned", label: S.returned, value: summary.returned },
      ]}
    />
  )
}

/**
 * Validação de prioridade: formulário de registro rápido sempre no topo,
 * resumo do período e a tabela. Período e filtros na barra de contexto, com
 * estado na URL. Não escreve na timeline (D15).
 */
export default async function PriorityValidationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const filters = parseValidationFilters(await searchParams)
  const writer = canWrite(user)
  const [formData, list, centrals] = await Promise.all([
    getValidationFormData(user),
    listValidations(user, filters),
    listCentralsForFilter(user),
  ])

  const watching = writer ? await activeWatchByLink(user, "priorityValidationId", list.rows.map((r) => r.id)) : {}
  const isToday = filters.period === "today"
  const subtitle = isToday
    ? fill(P.subtitle.today, { date: formatDate(list.to, "business") })
    : fill(P.subtitle.range, { from: formatDate(list.from, "business"), to: formatDate(list.to, "business") })
  const empty = {
    title: isToday ? P.empty.todayTitle : P.empty.periodTitle,
    direction: hasValidationFilters(filters)
      ? P.empty.filteredDirection
      : isToday
        ? writer
          ? P.empty.todayDirection
          : P.empty.todayDirectionReadOnly
        : P.empty.periodDirection,
  }

  return (
    <div className="flex flex-col gap-6">
      <ContextActions>
        <ValidationsToolbar filters={filters} members={formData.members} reasons={formData.reasons} centrals={centrals} />
      </ContextActions>
      <PageHeader title={P.title} subtitle={subtitle} />
      <TriageTabs />
      {writer && formData.levels.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink">{P.form.noLevels}</p>
      ) : null}
      <ValidationsWorkspace
        form={writer && formData.levels.length > 0 ? formData : null}
        rows={list.rows}
        showDate={!isToday}
        canWrite={writer}
        empty={{ title: P.empty.filteredTitle, direction: P.empty.filteredDirection }}
        periodEmpty={list.total === 0}
        watching={watching}
        summary={
          // Sem registro no período: estado vazio no lugar da faixa zerada.
          list.total === 0 ? (
            <div className="rounded-lg border border-line bg-surface">
              <EmptyState title={empty.title} direction={empty.direction} />
            </div>
          ) : (
            <Summary summary={list.summary} />
          )
        }
      />
    </div>
  )
}
