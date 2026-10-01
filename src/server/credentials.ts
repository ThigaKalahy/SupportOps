import type { Role } from "@prisma/client"

import { isAllowedEmail, normalizeEmail } from "./allowlist.ts"
import { defaultOrganizationId, writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { comparePassword, DUMMY_HASH } from "./password.ts"

/**
 * Verificação de e-mail + senha (provider Credentials do Auth.js).
 *
 * Regras (CLAUDE.md, segurança):
 * 1. E-mail fora de ALLOWED_EMAILS é recusado antes de consultar o banco.
 * 2. bcrypt.compare roda SEMPRE — inclusive para e-mail inexistente, fora da
 *    allowlist ou conta bloqueada — contra um hash descartável. Retorno
 *    antecipado vazaria, por tempo de resposta, quais contas existem.
 * 3. Falha devolve sempre `null`; a interface mostra o mesmo texto genérico.
 * 4. 5 falhas seguidas bloqueiam a conta por 15 minutos, mesmo com a senha
 *    certa. Sucesso zera o contador e atualiza lastLoginAt.
 * 5. Toda tentativa, sucesso ou falha, gera uma linha no AuditLog.
 */

export const MAX_FAILED_ATTEMPTS = 5
export const LOCK_MINUTES = 15

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  role: Role
  organizationId: string
}

type FailureReason = "not_allowlisted" | "unknown_email" | "no_password" | "locked" | "wrong_password"

export interface CredentialDeps {
  compare: (password: string, hash: string) => Promise<boolean>
  now: () => Date
}

const defaultDeps: CredentialDeps = { compare: comparePassword, now: () => new Date() }

export async function verifyCredentials(
  rawEmail: string,
  password: string,
  deps: CredentialDeps = defaultDeps,
): Promise<AuthenticatedUser | null> {
  const email = normalizeEmail(rawEmail)
  const now = deps.now()

  const fail = async (reason: FailureReason, user?: { id: string; organizationId: string }, extra?: object) => {
    await writeAudit(
      {
        action: reason === "locked" ? "auth.login.blocked" : "auth.login.failure",
        entity: "User",
        entityId: user?.id ?? null,
        after: { email, reason, ...extra },
      },
      { organizationId: user?.organizationId ?? (await defaultOrganizationId()), userId: user?.id ?? null },
    )
    return null
  }

  if (!isAllowedEmail(email)) {
    await deps.compare(password, DUMMY_HASH)
    return fail("not_allowlisted")
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    await deps.compare(password, DUMMY_HASH)
    return fail("unknown_email")
  }
  if (!user.passwordHash) {
    await deps.compare(password, DUMMY_HASH)
    return fail("no_password", user)
  }

  const stillLocked = user.lockedUntil !== null && user.lockedUntil > now
  if (stillLocked) {
    await deps.compare(password, user.passwordHash)
    return fail("locked", user, { lockedUntil: user.lockedUntil?.toISOString() })
  }

  const valid = await deps.compare(password, user.passwordHash)
  if (!valid) {
    // Bloqueio vencido não carrega o contador antigo.
    const previous = user.lockedUntil !== null ? 0 : user.failedLoginAttempts
    const attempts = previous + 1
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null
    await db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts, lockedUntil } })
    return fail("wrong_password", user, { attempts, lockedUntil: lockedUntil?.toISOString() ?? null })
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
  })
  await writeAudit(
    { action: "auth.login.success", entity: "User", entityId: user.id, after: { email } },
    { organizationId: user.organizationId, userId: user.id },
  )
  return { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId }
}
