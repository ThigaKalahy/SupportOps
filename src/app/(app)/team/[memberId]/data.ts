import { cache } from "react"

import { requireTeamContext } from "@/server/scope"
import { getMemberProfile } from "@/server/queries/profile"

/**
 * Perfil carregado uma vez por requisição: o layout (cabeçalho) e a página da
 * aba usam o mesmo resultado, sem repetir as consultas.
 */
export const loadProfile = cache(async (memberId: string) => {
  const ctx = await requireTeamContext()
  const profile = await getMemberProfile(ctx, memberId)
  return { ctx, profile }
})
