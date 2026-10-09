import { redirect } from "next/navigation"

import { isAllowedEmail } from "./allowlist"
import { auth } from "./auth"

/**
 * Sessão autenticada (quem é). O QUE a pessoa pode ver vem de dois gates
 * independentes (D29): escopo de time em src/server/scope.ts (TeamAccess,
 * revalidado a cada requisição) e visibilidade em src/server/visibility.ts.
 * `User.role` é obsoleto e não participa de autorização nenhuma.
 */

export { ForbiddenError } from "./scope"

export interface SessionUser {
  id: string
  email: string
  name: string
  organizationId: string
}

/** Usuário da sessão, ou null. Confere a allowlist a cada chamada (kill switch). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth()
  const user = session?.user
  if (!user?.id || !user.email || !user.organizationId) return null
  if (!isAllowedEmail(user.email)) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? user.email,
    organizationId: user.organizationId,
  }
}

/** Exige sessão válida; sem ela, manda para /login. Só para o que não é dado de time (o shell). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}
