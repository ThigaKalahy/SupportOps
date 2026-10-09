"use server"

import { requireTeamContext } from "@/server/scope"
import { recentAgreements, searchAll, type RecentAgreement, type SearchResults } from "@/server/queries/search"

/**
 * Leituras da paleta de comandos (⌘K). São leituras — passam pelas queries
 * com visibilidade aplicada; existem como Server Action só porque a paleta é
 * aberta no cliente. Sem rota de API (D8).
 */

/** Até 4 resultados por tipo; o resto fica em /search. */
export async function searchPalette(query: string): Promise<SearchResults> {
  return searchAll(await requireTeamContext(), query, { limit: 4 })
}

export async function loadRecentAgreements(): Promise<RecentAgreement[]> {
  return recentAgreements(await requireTeamContext())
}
