"use server"

import { parseTimelineFilters } from "@/lib/timeline-filters"
import { requireTeamContext } from "@/server/scope"
import { getTimelinePage, type TimelinePage } from "@/server/queries/timeline"

/**
 * "Carregar mais" da timeline: próxima página por cursor, com os mesmos
 * filtros da URL. É leitura — passa pela mesma query (e pelo mesmo
 * visibilityFilter) da página; existe como Server Action só porque o botão é
 * acionado no cliente. Sem rota de API (D8).
 */
export async function loadTimelinePage(memberId: string, search: string, cursor: string): Promise<TimelinePage> {
  const ctx = await requireTeamContext()
  return getTimelinePage(ctx, memberId, parseTimelineFilters(new URLSearchParams(search)), cursor)
}
