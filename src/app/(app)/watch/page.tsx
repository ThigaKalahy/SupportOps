import type { Metadata } from "next"

import { ContextActions } from "@/components/shell/context-actions"
import { PageHeader } from "@/components/ui/page-header"
import { RouteTabs } from "@/components/ui/route-tabs"
import { WatchList } from "@/components/watch/watch-list"
import { labels } from "@/lib/labels"
import { hasWatchFilters, parseWatchFilters, WATCH_PARAMS, WATCH_TABS, type WatchTab } from "@/lib/watch-filters"
import { canWrite, requireTeamContext } from "@/server/scope"
import { getThresholds } from "@/server/queries/thresholds"
import { listWatchItems, watchFilterOptions } from "@/server/queries/watch"

import { WatchToolbar } from "./_components/watch-toolbar"

const W = labels.watch

export const metadata: Metadata = {
  title: `${W.title} · ${labels.app.name}`,
}

const TAB_LABEL: Record<WatchTab, string> = {
  active: W.tabs.active,
  unreviewed: W.tabs.unreviewed,
  resolved: W.tabs.resolved,
  archived: W.tabs.archived,
  all: W.tabs.all,
}

const EMPTY: Record<WatchTab, { title: string; direction: string }> = {
  active: { title: W.empty.active, direction: W.empty.activeDirection },
  unreviewed: { title: W.empty.unreviewed, direction: W.empty.unreviewedDirection },
  resolved: { title: W.empty.resolved, direction: W.empty.activeDirection },
  archived: { title: W.empty.archived, direction: W.empty.activeDirection },
  all: { title: W.empty.active, direction: W.empty.activeDirection },
}

/**
 * Em observação (P21, D24–D27): o que o gestor acompanha de perto. Abas
 * (Ativas | Sem revisão | Resolvidas | Arquivadas | Todas) e filtros na URL;
 * por grau, o mais esquecido no topo; ações na própria linha.
 */
export default async function WatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTeamContext()
  const raw = await searchParams
  const filters = parseWatchFilters(raw)
  const thresholds = await getThresholds(ctx)
  const [{ rows, counts }, options] = await Promise.all([listWatchItems(ctx, filters, thresholds), watchFilterOptions(ctx)])
  const search = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" && k !== WATCH_PARAMS.open && k !== WATCH_PARAMS.new ? [[k, v]] : [])))
  const tabs = WATCH_TABS.map((tab) => {
    const params = new URLSearchParams(search)
    if (tab === "active") params.delete(WATCH_PARAMS.tab)
    else params.set(WATCH_PARAMS.tab, tab)
    const query = params.toString()
    return { href: query ? `/watch?${query}` : "/watch", label: TAB_LABEL[tab], count: counts[tab], exact: true }
  })
  const openId = typeof raw[WATCH_PARAMS.open] === "string" ? (raw[WATCH_PARAMS.open] as string) : null
  const empty = hasWatchFilters(filters) ? { title: W.empty.filtered, direction: W.empty.filteredDirection } : EMPTY[filters.tab]

  return (
    <div className="flex flex-col gap-6">
      <ContextActions>
        <WatchToolbar
          filters={filters}
          members={options.members}
          centrals={options.centrals}
          canWrite={canWrite(ctx)}
          openNew={raw[WATCH_PARAMS.new] === "1"}
        />
      </ContextActions>
      <PageHeader title={W.title} subtitle={W.subtitle} />
      <RouteTabs label={W.tabs.label} tabs={tabs} activeHref={tabs[WATCH_TABS.indexOf(filters.tab)]?.href} />
      <WatchList
        rows={rows}
        canWrite={canWrite(ctx)}
        grouped={filters.tab === "active" || filters.tab === "unreviewed"}
        empty={empty}
        openId={openId}
      />
    </div>
  )
}
