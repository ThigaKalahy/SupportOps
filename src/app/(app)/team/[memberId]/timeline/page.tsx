import { notFound } from "next/navigation"

import { TimelineFeed } from "@/components/timeline/timeline-feed"
import { EmptyState } from "@/components/ui/empty-state"
import { fill, labels } from "@/lib/labels"
import { filtersKey, isFiltered, parseTimelineFilters, TIMELINE_PARAMS } from "@/lib/timeline-filters"
import { canWrite } from "@/server/access"
import { getTimelinePage } from "@/server/queries/timeline"

import { loadProfile } from "../data"

import { TimelineToolbar } from "./_components/timeline-toolbar"

/**
 * Timeline da pessoa: do mais recente para o mais antigo, agrupada por mês,
 * 40 por vez. Filtros na URL. Lida de cima a baixo, reconstrói a trajetória
 * sem abrir nada.
 */
export default async function MemberTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { memberId } = await params
  const { user, profile } = await loadProfile(memberId)
  if (!profile) notFound()

  const filters = parseTimelineFilters(await searchParams)
  const page = await getTimelinePage(user, profile.id, filters)
  const search = new URLSearchParams()
  if (filters.types.length) search.set(TIMELINE_PARAMS.types, filters.types.join(","))
  if (filters.period !== "all") search.set(TIMELINE_PARAMS.period, filters.period)
  if (filters.q) search.set(TIMELINE_PARAMS.q, filters.q)

  const T = labels.timeline
  const writer = canWrite(user) && profile.status !== "INACTIVE"

  return (
    <section className="flex flex-col gap-5" aria-label={fill(T.label, { name: profile.preferredName })}>
      <TimelineToolbar filters={filters} />
      {page.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line">
          <EmptyState
            title={isFiltered(filters) ? T.filteredTitle : T.emptyTitle}
            direction={isFiltered(filters) ? T.filteredDirection : T.emptyDirection}
          />
        </div>
      ) : (
        <TimelineFeed
          key={filtersKey(filters)}
          memberId={profile.id}
          memberName={profile.preferredName}
          initial={page}
          search={search.toString()}
          showVisibility={user.role !== "VIEWER"}
          canWrite={writer}
        />
      )}
    </section>
  )
}
