/**
 * pnpm user:password — ÚNICA forma de definir ou trocar senha (não há
 * recuperação por e-mail). Gera uma senha aleatória para um e-mail existente,
 * mostra UMA vez, grava só o hash e desbloqueia a conta.
 */
import { isAllowedEmail, normalizeEmail } from "../src/server/allowlist.ts"
import { writeAudit } from "../src/server/audit.ts"
import { db } from "../src/server/db.ts"
import { generatePassword, hashPassword } from "../src/server/password.ts"

import { ask, fail, printPasswordOnce } from "./cli.ts"

async function main() {
  const [rawEmail = ""] = await ask(["E-mail da conta: "])
  const email = normalizeEmail(rawEmail)

  const user = await db.user.findUnique({ where: { email } })
  if (!user) fail("não existe usuário com este e-mail. Para criar, use `pnpm user:create`.")

  const password = generatePassword()
  const passwordHash = await hashPassword(password)

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordUpdatedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    })
    await writeAudit(
      {
        action: "user.password.reset",
        entity: "User",
        entityId: user.id,
        before: { hadPassword: user.passwordHash !== null, lockedUntil: user.lockedUntil?.toISOString() ?? null },
        after: { via: "cli", unlocked: true },
      },
      { organizationId: user.organizationId, userId: null, tx },
    )
  })

  console.log(`\nSenha redefinida para ${user.name}. Tentativas falhas zeradas e conta desbloqueada.`)
  if (!isAllowedEmail(email)) {
    console.log("Atenção: este e-mail não está no ALLOWED_EMAILS — a conta não consegue entrar até ser incluída.")
  }
  printPasswordOnce(email, password)
}

main()
  .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
  .finally(() => db.$disconnect())
