import { redirect } from "next/navigation"

import { labels } from "@/lib/labels"

import { isAllowedEmail } from "./allowlist"
import { auth } from "./auth"
import { canWrite, type Viewer } from "./visibility"

/**
 * Controle de acesso no servidor. Papéis:
 * - OWNER: leitura e escrita completas.
 * - VIEWER: leitura apenas; nunca lê registro PRIVATE (visibilityFilter).
 * - MANAGER: reservado; comportamento de OWNER limitado ao próprio time
 *   (memberScope).
 *
 * Leituras de OneOnOne, Feedback, Note e TimelineEvent passam SEMPRE por
 * `visibilityFilter` — na prática, por src/server/queries.
 */

export { canWrite, memberScope, visibilityFilter, type Viewer } from "./visibility"

export interface SessionUser extends Viewer {
  email: string
  name: string
}

export class ForbiddenError extends Error {
  constructor() {
    super(labels.access.forbidden)
    this.name = "ForbiddenError"
  }
}

/** Usuário da sessão, ou null. Confere a allowlist a cada chamada (kill switch). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth()
  const user = session?.user
  if (!user?.id || !user.email || !user.role || !user.organizationId) return null
  if (!isAllowedEmail(user.email)) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? user.email,
    role: user.role,
    organizationId: user.organizationId,
  }
}

/** Exige sessão válida; sem ela, manda para /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

/** Exige papel com escrita. Toda Server Action de escrita começa por aqui. */
export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser()
  if (!canWrite(user)) throw new ForbiddenError()
  return user
}
