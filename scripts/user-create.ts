/**
 * pnpm user:create — ÚNICA forma de criar usuário (não há cadastro público
 * nem convite). Pergunta e-mail, nome e papel; gera uma senha aleatória,
 * mostra UMA vez e grava só o hash (bcryptjs, cost 12).
 */
import { z } from "zod"

import { isAllowedEmail, normalizeEmail } from "../src/server/allowlist.ts"
import { defaultOrganizationId, writeAudit } from "../src/server/audit.ts"
import { db } from "../src/server/db.ts"
import { generatePassword, hashPassword } from "../src/server/password.ts"

import { ask, fail, printPasswordOnce } from "./cli.ts"

async function main() {
  const [rawEmail = "", name = "", rawRole = ""] = await ask([
    "E-mail: ",
    "Nome: ",
    "Papel (OWNER = gestor, escrita | VIEWER = leitura): ",
  ])

  const email = normalizeEmail(rawEmail)
  if (!z.string().email().safeParse(email).success) fail("e-mail inválido.")
  if (!name) fail("o nome é obrigatório.")
  const role = rawRole.toUpperCase()
  if (role !== "OWNER" && role !== "VIEWER") {
    fail("papel deve ser OWNER ou VIEWER. MANAGER está reservado e não é criado no MVP.")
  }
  if (!isAllowedEmail(email)) {
    fail("este e-mail não está no ALLOWED_EMAILS. Acrescente-o à variável (separado por vírgula) e rode de novo — sem isso a conta não consegue entrar.")
  }

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) fail("já existe usuário com este e-mail. Para definir ou trocar a senha, use `pnpm user:password`.")

  const organizationId = await defaultOrganizationId()
  const password = generatePassword()
  const passwordHash = await hashPassword(password)

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, name, role, organizationId, passwordHash, passwordUpdatedAt: new Date() },
    })
    await writeAudit(
      { action: "user.create", entity: "User", entityId: created.id, after: { email, name, role, via: "cli" } },
      { organizationId, userId: null, tx },
    )
    return created
  })

  console.log(`\nUsuário criado: ${user.name} (${role === "OWNER" ? "gestor" : "leitura"}).`)
  printPasswordOnce(email, password)
}

main()
  .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
  .finally(() => db.$disconnect())
