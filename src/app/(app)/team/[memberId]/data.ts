import { cache } from "react"

import { requireUser } from "@/server/access"
import { getMemberProfile } from "@/server/queries/profile"

/**
 * Perfil carregado uma vez por requisição: o layout (cabeçalho) e a página da
 * aba usam o mesmo resultado, sem repetir as consultas.
 */
export const loadProfile = cache(async (memberId: string) => {
  const user = await requireUser()
  const profile = await getMemberProfile(user, memberId)
  return { user, profile }
})
