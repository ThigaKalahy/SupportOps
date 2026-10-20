import { redirect } from "next/navigation"
import { cache } from "react"

import { accountTier } from "./account-tier"
import { isAllowedEmail } from "./allowlist"
import { auth } from "./auth"
import { db } from "./db"

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

/**
 * Usuário da sessão, ou null. A cada requisição: conta ativa (`isActive`) e a
 * allowlist em dois níveis (P25) — fora de ALLOWED_EMAILS só passa a conta cujo
 * único nível é MEMBER. Tirar o e-mail da lista continua derrubando gestor e leitor.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth()
  const user = session?.user
  if (!user?.id || !user.email || !user.organizationId) return null
  const row = await db.user.findUnique({ where: { id: user.id }, select: { isActive: true, isPlatformAdmin: true } })
  if (!row?.isActive) return null
  if (!isAllowedEmail(user.email) && (await accountTier(user.id, row.isPlatformAdmin)) !== "member") return null
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? user.email,
    organizationId: user.organizationId,
  }
})

/** Exige sessão válida; sem ela, manda para /login. Só para o que não é dado de time (o shell). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}
