/** Regras de papel e allowlist (sem banco). */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { isAllowedEmail } from "../src/server/allowlist.ts"
import { canWrite, memberScope, visibilityFilter } from "../src/server/visibility.ts"

describe("papéis", () => {
  test("VIEWER só enxerga SHARED; OWNER e MANAGER sem filtro de visibilidade", () => {
    assert.deepEqual(visibilityFilter({ role: "VIEWER" }), { visibility: "SHARED" })
    assert.deepEqual(visibilityFilter({ role: "OWNER" }), {})
    assert.deepEqual(visibilityFilter({ role: "MANAGER" }), {})
  })

  test("só OWNER e MANAGER escrevem", () => {
    assert.equal(canWrite({ role: "OWNER" }), true)
    assert.equal(canWrite({ role: "MANAGER" }), true)
    assert.equal(canWrite({ role: "VIEWER" }), false)
  })

  test("MANAGER fica restrito ao próprio time; os demais à organização", () => {
    assert.deepEqual(memberScope({ id: "u1", role: "MANAGER", organizationId: "o1" }), {
      team: { organizationId: "o1", managerUserId: "u1" },
    })
    assert.deepEqual(memberScope({ id: "u1", role: "VIEWER", organizationId: "o1" }), { team: { organizationId: "o1" } })
  })
})

describe("allowlist (kill switch)", () => {
  test("lida a cada chamada: tirar o e-mail da variável revoga na hora", () => {
    const original = process.env.ALLOWED_EMAILS
    process.env.ALLOWED_EMAILS = " Gestor@Exemplo.com , diretoria@exemplo.com "
    assert.equal(isAllowedEmail("gestor@exemplo.com"), true)
    assert.equal(isAllowedEmail("DIRETORIA@exemplo.com"), true)
    process.env.ALLOWED_EMAILS = "diretoria@exemplo.com"
    assert.equal(isAllowedEmail("gestor@exemplo.com"), false)
    assert.equal(isAllowedEmail(null), false)
    process.env.ALLOWED_EMAILS = original
  })
})
