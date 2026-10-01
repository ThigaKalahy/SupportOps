/**
 * Critério de aceite do P5: seis senhas erradas bloqueiam a conta por 15
 * minutos e geram seis linhas no AuditLog. Também verifica que bcrypt.compare
 * roda mesmo para e-mail inexistente (sem retorno antecipado).
 *
 * Usa um usuário temporário, apagado ao final junto com as linhas de auditoria.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { db, dbIncludingDeleted } from "../src/server/db.ts"
import { LOCK_MINUTES, MAX_FAILED_ATTEMPTS, verifyCredentials } from "../src/server/credentials.ts"
import { comparePassword, DUMMY_HASH, hashPassword } from "../src/server/password.ts"

const EMAIL = "teste.bloqueio@prontuario.test"
const UNKNOWN = "teste.inexistente@prontuario.test"
const PASSWORD = "senha-correta-do-teste"

const auditRows = (email: string) =>
  dbIncludingDeleted.auditLog.count({ where: { after: { path: ["email"], equals: email } } })

async function cleanup() {
  await dbIncludingDeleted.auditLog.deleteMany({ where: { after: { path: ["email"], equals: EMAIL } } })
  await dbIncludingDeleted.auditLog.deleteMany({ where: { after: { path: ["email"], equals: UNKNOWN } } })
  await dbIncludingDeleted.user.deleteMany({ where: { email: EMAIL } })
}

describe("bloqueio progressivo e auditoria de login", () => {
  const originalAllowlist = process.env.ALLOWED_EMAILS

  before(async () => {
    process.env.ALLOWED_EMAILS = [originalAllowlist, EMAIL, UNKNOWN].filter(Boolean).join(",")
    await cleanup()
    const org = await dbIncludingDeleted.organization.findUniqueOrThrow({ where: { slug: process.env.DEFAULT_ORG_SLUG ?? "suporte" } })
    await dbIncludingDeleted.user.create({
      data: { email: EMAIL, name: "Teste de bloqueio", role: "VIEWER", organizationId: org.id, passwordHash: await hashPassword(PASSWORD) },
    })
  })

  after(async () => {
    await cleanup()
    process.env.ALLOWED_EMAILS = originalAllowlist
    await db.$disconnect()
    await dbIncludingDeleted.$disconnect()
  })

  test("seis senhas erradas: bloqueio de 15 minutos e seis linhas no AuditLog", async () => {
    const started = Date.now()
    for (let i = 1; i <= 6; i++) {
      assert.equal(await verifyCredentials(EMAIL, `errada-${i}`), null)
    }
    const user = await dbIncludingDeleted.user.findUniqueOrThrow({ where: { email: EMAIL } })
    assert.equal(user.failedLoginAttempts, MAX_FAILED_ATTEMPTS)
    assert.ok(user.lockedUntil, "a conta deveria estar bloqueada")
    const lockMs = user.lockedUntil.getTime() - started
    assert.ok(lockMs > (LOCK_MINUTES - 1) * 60_000 && lockMs <= LOCK_MINUTES * 60_000 + 60_000, `bloqueio de ${lockMs / 60_000} min`)
    assert.equal(await auditRows(EMAIL), 6)

    const actions = await dbIncludingDeleted.auditLog.findMany({
      where: { after: { path: ["email"], equals: EMAIL } },
      orderBy: { at: "asc" },
      select: { action: true },
    })
    assert.deepEqual(
      actions.map((a) => a.action),
      ["auth.login.failure", "auth.login.failure", "auth.login.failure", "auth.login.failure", "auth.login.failure", "auth.login.blocked"],
    )
  })

  test("bloqueada, recusa até a senha certa (e audita a tentativa)", async () => {
    assert.equal(await verifyCredentials(EMAIL, PASSWORD), null)
    assert.equal(await auditRows(EMAIL), 7)
  })

  test("depois de 15 minutos a senha certa entra, zera o contador e registra sucesso", async () => {
    const later = () => new Date(Date.now() + (LOCK_MINUTES + 1) * 60_000)
    const user = await verifyCredentials(EMAIL, PASSWORD, { compare: comparePassword, now: later })
    assert.equal(user?.email, EMAIL)
    const row = await dbIncludingDeleted.user.findUniqueOrThrow({ where: { email: EMAIL } })
    assert.equal(row.failedLoginAttempts, 0)
    assert.equal(row.lockedUntil, null)
    assert.ok(row.lastLoginAt)
    const last = await dbIncludingDeleted.auditLog.findFirst({ where: { entityId: row.id }, orderBy: { at: "desc" } })
    assert.equal(last?.action, "auth.login.success")
  })

  test("e-mail inexistente: bcrypt.compare roda mesmo assim, contra o hash descartável", async () => {
    const calls: string[] = []
    const result = await verifyCredentials(UNKNOWN, "qualquer", {
      compare: async (password, hash) => {
        calls.push(hash)
        return comparePassword(password, hash)
      },
      now: () => new Date(),
    })
    assert.equal(result, null)
    assert.deepEqual(calls, [DUMMY_HASH])
  })

  test("e-mail fora da allowlist: recusado antes do banco, ainda com compare", async () => {
    const calls: string[] = []
    const result = await verifyCredentials("fora.da.lista@prontuario.test", PASSWORD, {
      compare: async (password, hash) => {
        calls.push(hash)
        return comparePassword(password, hash)
      },
      now: () => new Date(),
    })
    assert.equal(result, null)
    assert.deepEqual(calls, [DUMMY_HASH])
    await dbIncludingDeleted.auditLog.deleteMany({ where: { after: { path: ["email"], equals: "fora.da.lista@prontuario.test" } } })
  })
})
