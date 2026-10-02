import { RouteTabs } from "@/components/ui/route-tabs"
import { labels } from "@/lib/labels"
import {
  AGREEMENT_PARAMS,
  AGREEMENT_VIEWS,
  hasAgreementFilters,
  type AgreementFilters,
  type AgreementView,
} from "@/lib/agreement-filters"
import type { AgreementCounts, AgreementRow } from "@/server/queries/agreements"

import { AgreementsTable } from "./agreements-table"

const A = labels.agreements
const VIEW_LABEL: Record<AgreementView, string> = {
  overdue: A.views.overdue,
  "due-soon": A.views.dueSoon,
  open: A.views.open,
  done: A.views.done,
  all: A.views.all,
}
const EMPTY_TITLE: Record<AgreementView, string> = {
  overdue: A.emptyByView.overdue,
  "due-soon": A.emptyByView.dueSoon,
  open: A.emptyByView.open,
  done: A.emptyByView.done,
  all: A.emptyByView.all,
}

/** Link de uma aba preservando os demais filtros da URL. */
function viewHref(basePath: string, search: URLSearchParams, view: AgreementView): string {
  const params = new URLSearchParams(search)
  if (view === "open") params.delete(AGREEMENT_PARAMS.view)
  else params.set(AGREEMENT_PARAMS.view, view)
  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

/**
 * Abas (Atrasados | Vencendo | Em aberto | Concluídos | Todos) com contagem,
 * estado na URL, e a tabela. Usada em /agreements e na aba Combinados do perfil.
 */
export function AgreementsView({
  basePath,
  search,
  filters,
  rows,
  counts,
  canWrite,
  showMember = true,
}: {
  basePath: string
  /** Query atual (para as abas preservarem os filtros). */
  search: URLSearchParams
  filters: AgreementFilters
  rows: AgreementRow[]
  counts: AgreementCounts
  canWrite: boolean
  showMember?: boolean
}) {
  const tabs = AGREEMENT_VIEWS.map((view) => ({
    href: viewHref(basePath, search, view),
    label: VIEW_LABEL[view],
    count: counts[view],
    exact: true,
  }))
  const active = tabs[AGREEMENT_VIEWS.indexOf(filters.view)]?.href

  return (
    <div className="flex flex-col gap-4">
      <RouteTabs label={A.views.label} tabs={tabs} activeHref={active} />
      <AgreementsTable
        rows={rows}
        canWrite={canWrite}
        showMember={showMember}
        empty={{
          title: EMPTY_TITLE[filters.view],
          direction: hasAgreementFilters(filters) ? A.filteredDirection : A.emptyDirection,
        }}
      />
    </div>
  )
}
