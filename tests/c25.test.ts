/**
 * C25 — gestores recebem combinados (todos os times), sem virar pessoa do time (D1).
 * Estrutura (sem banco): o lugar de gestor some de toda leitura de pessoa por padrão e só
 * aparece onde se escolhe ou confere o responsável de um combinado.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import { firstName, onlyManagerSeats, withManagerSeats } from "../src/lib/manager-seats.ts"

const SRC = join(import.meta.dirname, "..", "src")
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8")

describe("C25 — lugar de gestor", () => {
  test("marcadores de leitura: incluir todos ou só os gestores", () => {
    assert.ok("managerUserId" in withManagerSeats, "a chave precisa existir para o cliente não esconder")
    assert.equal(withManagerSeats.managerUserId, undefined, "undefined não filtra nada no Prisma")
    assert.deepEqual(onlyManagerSeats, { managerUserId: { not: null } })
    assert.equal(firstName("  Thiago  Silva "), "Thiago")
  })

  test("o cliente db esconde o lugar de gestor de toda leitura de pessoa que não peça", () => {
    const db = read("server", "db.ts")
    assert.match(db, /model === "TeamMember" && !\(current\.where && "managerUserId" in current\.where\)/)
    assert.match(db, /managerUserId: null/)
  })

  test("SQL cru e leitura sem o filtro automático também deixam o gestor de fora", () => {
    assert.match(read("server", "queries", "members.ts"), /m\."managerUserId" IS NULL/, "Equipe")
    assert.match(read("server", "queries", "search.ts"), /m\."managerUserId" IS NULL/, "busca de pessoas")
    assert.match(read("server", "queries", "profile.ts"), /dbIncludingDeleted\.teamMember\.findFirst\(\{\s*where: \{[^}]*managerUserId: null/, "perfil")
  })

  test("alertas e painel da home não contam o gestor", () => {
    assert.match(read("server", "queries", "alerts.ts"), /const people = \{ status: \{ not: "INACTIVE" as const \}, managerUserId: null \}/)
    assert.match(read("server", "queries", "today.ts"), /const people = \{ status: \{ not: "INACTIVE" as const \}, managerUserId: null \}/)
  })

  test("o gestor aparece só onde se escolhe ou confere o responsável", () => {
    const layout = readFileSync(join(SRC, "app", "(app)", "layout.tsx"), "utf8")
    assert.match(layout, /listAgreementMembers\(ctx, \{ managers: true \}\)/)
    assert.match(layout, /const people = members\.filter\(\(m\) => !m\.isManager\)/, "paleta (1:1, feedback, perfil) só com pessoas")
    const agreements = read("server", "agreements.ts")
    assert.match(agreements, /\.\.\.teamScope\(ctx\), \.\.\.withManagerSeats, id: data\.memberId/, "criar para um gestor")
    assert.doesNotMatch(agreements.slice(agreements.indexOf("const all ="), agreements.indexOf(": { ...teamScope(ctx), ...withManagerSeats")), /withManagerSeats/, "\"Todos do time\" não inclui gestor")
    assert.match(agreements, /id: memberId, \.\.\.teamScope\(ctx\), \.\.\.withManagerSeats, status: \{ not: "INACTIVE" \}/, "transferir para um gestor")
    assert.equal(read("server", "dailies.ts").match(/withManagerSeats/g)?.length, 3, "daily: combinado novo e troca")
    assert.match(read("server", "queries", "dailies.ts"), /listManagerSeats\(ctx\.teamId\)/)
    assert.match(read("server", "member-daily.ts"), /onlyManagerSeats/, "scrum master")
    assert.match(read("server", "member-agreements.ts"), /onlyManagerSeats/, "portal")
  })

  test("toda escrita de acesso ao time sincroniza os lugares de gestor", () => {
    assert.equal(read("server", "teams.ts").match(/await syncManagerSeats\(/g)?.length, 2)
    assert.equal(read("server", "provisioning.ts").match(/await syncManagerSeats\(/g)?.length, 3)
    const seats = read("server", "manager-seats.ts")
    assert.match(seats, /level: "MANAGER", revokedAt: null/)
    assert.match(seats, /!asPerson\.has\(m\.userId\)/, "gestor que já é pessoa do time recebe como pessoa")
    assert.doesNotMatch(seats, /teamMember\.delete/, "lugar de gestor nunca é apagado")
  })

  test("o lugar de gestor nunca é login do portal (no banco)", () => {
    const sql = readFileSync(join(import.meta.dirname, "..", "prisma", "migrations", "20261111120000_manager_seats", "migration.sql"), "utf8")
    assert.match(sql, /CHECK \("managerUserId" IS NULL OR "userId" IS NULL\)/)
    assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE|INSERT)\b/m, "migration aditiva, sem tocar dado (D23)")
  })
})
