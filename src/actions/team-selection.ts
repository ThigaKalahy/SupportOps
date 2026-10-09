"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { labels } from "@/lib/labels"
import { requireUser } from "@/server/access"
import { ACTIVE_TEAM_COOKIE, ACTIVE_TEAM_COOKIE_OPTIONS, TeamAccessError, teamContextFor } from "@/server/scope"

/**
 * Escolhe o time ativo (P23): na tela /select-team e no seletor da sidebar.
 *
 * É a única Server Action que não parte de `requireTeamContext` — ela ESTABELECE
 * o contexto. O time pedido é conferido contra TeamAccess (`teamContextFor`) antes
 * de virar cookie, e o cookie continua sendo só preferência: cada requisição
 * seguinte revalida de novo (D30).
 *
 * Sempre vai para a HOME do time novo, nunca para a rota equivalente: um id do time
 * anterior não existe no novo. `revalidatePath("/", "layout")` invalida o cache de
 * rota inteiro, para nenhuma tela guardar dado do time anterior.
 */
export async function selectTeam(teamId: unknown): Promise<{ ok: false; error: string }> {
  const user = await requireUser()
  if (typeof teamId !== "string" || teamId.length === 0 || teamId.length > 40) {
    return { ok: false, error: labels.teams.selectFailed }
  }
  try {
    await teamContextFor(user.id, teamId)
  } catch (error) {
    if (error instanceof TeamAccessError) return { ok: false, error: labels.access.noTeamAccess }
    throw error
  }
  const store = await cookies()
  store.set(ACTIVE_TEAM_COOKIE, teamId, ACTIVE_TEAM_COOKIE_OPTIONS)
  revalidatePath("/", "layout")
  redirect("/")
}
