/**
 * Roteamento entre as duas superfícies (P25, D38): o portal do colaborador (/me) e
 * as telas do gestor. Regra pura, sem dependências — roda no middleware (Edge).
 *
 * É CONVENIÊNCIA de navegação, não autorização: cada rota revalida no servidor
 * (`requireTeamContext` manda o MEMBER para /me; `requireMemberContext` só aceita
 * MEMBER com pessoa ativa). O middleware não consulta o banco.
 *
 * - `memberOnly` (do token): conta cujo único nível é MEMBER. Vai sempre para /me.
 * - Conta com nível de gestor ou leitura só entra em /me quando o time ativo é um em
 *   que ela é colaboradora — o cookie `active-surface`, gravado ao escolher o time,
 *   diz isso. Sem ele, /me volta para a home do gestor.
 */

export const MEMBER_HOME = "/me"
export const MANAGER_HOME = "/"
export const LOGIN_PATH = "/login"
/** Preferência de superfície do time ativo ("member" | "manager"). Não é credencial. */
export const SURFACE_COOKIE = "active-surface"

/** Rotas que servem às duas superfícies. */
const SHARED_PATHS = ["/select-team"]

export function isMemberPath(pathname: string): boolean {
  return pathname === MEMBER_HOME || pathname.startsWith(`${MEMBER_HOME}/`)
}

export type RouteDecision = { kind: "allow" } | { kind: "login" } | { kind: "redirect"; to: string }

export function routeRequest(input: {
  pathname: string
  loggedIn: boolean
  memberOnly: boolean
  surface?: string | null
}): RouteDecision {
  const { pathname, loggedIn, memberOnly, surface } = input
  if (pathname === LOGIN_PATH) {
    return loggedIn ? { kind: "redirect", to: memberOnly ? MEMBER_HOME : MANAGER_HOME } : { kind: "allow" }
  }
  if (!loggedIn) return { kind: "login" }
  if (SHARED_PATHS.includes(pathname)) return { kind: "allow" }
  if (isMemberPath(pathname)) {
    return memberOnly || surface === "member" ? { kind: "allow" } : { kind: "redirect", to: MANAGER_HOME }
  }
  return memberOnly ? { kind: "redirect", to: MEMBER_HOME } : { kind: "allow" }
}
