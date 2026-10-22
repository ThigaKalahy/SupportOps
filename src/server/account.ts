import { labels } from "../lib/labels.ts"
import { changePasswordSchema } from "../lib/validators/auth.ts"

import { writeAudit } from "./audit.ts"
import { LOCK_MINUTES, MAX_FAILED_ATTEMPTS } from "./credentials.ts"
import { db } from "./db.ts"
import { comparePassword, hashPassword } from "./password.ts"

/**
 * C18 — a pessoa troca a própria senha (o colaborador recebe uma aleatória no convite).
 * Não é recuperação de senha: exige a sessão E a senha atual. Erro na atual conta como
 * tentativa falha do login (5 → bloqueio de 15 minutos), para a sessão aberta não virar
 * atalho de força bruta. Conta só de `User`, sem dado de time (D31).
 */

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<"current" | "next" | "confirm", string>> }

export async function changeOwnPassword(
  user: { id: string; organizationId: string },
  input: unknown,
  now: Date = new Date(),
): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Partial<Record<"current" | "next" | "confirm", string>> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (key === "current" || key === "next" || key === "confirm") fieldErrors[key] ??= issue.message
    }
    return { ok: false, error: labels.validation.generic, fieldErrors }
  }

  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, failedLoginAttempts: true, lockedUntil: true },
  })
  if (!row?.passwordHash) return { ok: false, error: labels.account.wrongCurrent, fieldErrors: { current: labels.account.wrongCurrent } }
  if (row.lockedUntil !== null && row.lockedUntil > now) return { ok: false, error: labels.account.locked }

  const audit = { organizationId: user.organizationId, userId: user.id }
  if (!(await comparePassword(parsed.data.current, row.passwordHash))) {
    const attempts = (row.lockedUntil !== null ? 0 : row.failedLoginAttempts) + 1
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null
    await db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts, lockedUntil } })
    await writeAudit({ action: "auth.password.change.failure", entity: "User", entityId: user.id, after: { attempts } }, audit)
    if (lockedUntil) return { ok: false, error: labels.account.locked }
    return { ok: false, error: labels.account.wrongCurrent, fieldErrors: { current: labels.account.wrongCurrent } }
  }

  const passwordHash = await hashPassword(parsed.data.next)
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordUpdatedAt: now, failedLoginAttempts: 0, lockedUntil: null },
    })
    // Nunca a senha nem o hash no log.
    await writeAudit({ action: "auth.password.change", entity: "User", entityId: user.id }, { ...audit, tx })
  })
  return { ok: true }
}
