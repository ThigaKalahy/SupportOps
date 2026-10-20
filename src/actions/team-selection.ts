"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { labels } from "@/lib/labels"
import { MANAGER_HOME, MEMBER_HOME, SURFACE_COOKIE } from "@/lib/portal-routing"
import { requireUser } from "@/server/access"
import { MemberAccessError, memberContextFor } from "@/server/member-scope"
import { ACTIVE_TEAM_COOKIE, ACTIVE_TEAM_COOKIE_OPTIONS, TeamAccessError, teamContextFor } from "@/server/scope"

/**
 * Escolhe o time ativo (P23): na tela /select-team e no seletor da sidebar.
 *
 * É a única Server Action que não parte de `requireTeamContext` — ela ESTABELECE
 * o contexto. O time pedido é conferido contra TeamAccess (`teamContextFor`) antes
 * de virar cookie, e o cookie continua sendo só preferência: cada requisição
 * seguinte revalida de novo (D30).
 *
 * Time em que a conta é colaboradora (P25): conferido pelo contexto do portal
 * (`memberContextFor`, que exige a pessoa ativa) e a home é /me.
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
  let surface: "manager" | "member" = "manager"
  try {
    await teamContextFor(user.id, teamId)
  } catch (error) {
    if (!(error instanceof TeamAccessError)) throw error
    try {
      await memberContextFor(user.id, teamId)
      surface = "member"
    } catch (memberError) {
      if (memberError instanceof MemberAccessError) return { ok: false, error: memberError.message }
      throw memberError
    }
  }
  const store = await cookies()
  store.set(ACTIVE_TEAM_COOKIE, teamId, ACTIVE_TEAM_COOKIE_OPTIONS)
  // Preferência de superfície para o middleware (não é credencial: cada rota revalida).
  store.set(SURFACE_COOKIE, surface, ACTIVE_TEAM_COOKIE_OPTIONS)
  revalidatePath("/", "layout")
  redirect(surface === "member" ? MEMBER_HOME : MANAGER_HOME)
}
