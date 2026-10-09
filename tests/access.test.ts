/** Níveis de acesso ao time e allowlist (sem banco). */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { isAllowedEmail } from "../src/server/allowlist.ts"
import { canWrite, requireManager, teamScope } from "../src/server/scope.ts"
import { visibilityFilter } from "../src/server/visibility.ts"

describe("níveis de acesso ao time (P22, D34)", () => {
  test("VIEWER só enxerga SHARED; MANAGER sem filtro de visibilidade", () => {
    assert.deepEqual(visibilityFilter({ level: "VIEWER" }), { visibility: "SHARED" })
    assert.deepEqual(visibilityFilter({ level: "MANAGER" }), {})
  })

  test("só MANAGER escreve; VIEWER recebe erro, não silêncio", () => {
    assert.equal(canWrite({ level: "MANAGER" }), true)
    assert.equal(canWrite({ level: "VIEWER" }), false)
    assert.doesNotThrow(() => requireManager({ level: "MANAGER" }))
    assert.throws(() => requireManager({ level: "VIEWER" }), { name: "ForbiddenError" })
  })

  test("o escopo é sempre o teamId do contexto, nunca a organização (D36)", () => {
    assert.deepEqual(teamScope({ teamId: "t1" }), { teamId: "t1" })
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
