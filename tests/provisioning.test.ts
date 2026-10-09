/**
 * P24 — abrir um time novo (D33, D30). Organização própria (`prov_`), criada e
 * apagada pelo teste, no banco de TESTE.
 *
 * Cenário: Suporte e Extra já existem; Thiago é MANAGER do Suporte; Jean é
 * VIEWER dos dois (vê todos); Ana é VIEWER só do Suporte.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { DEFAULT_BLOCKER_REASONS, DEFAULT_SENIORITIES } from "../src/lib/team-defaults.ts"
import { getAlerts } from "../src/server/alerts.ts"
import { comparePassword } from "../src/server/password.ts"
import { dbIncludingDeleted as d } from "../src/server/db.ts"
import { createTeam, grantAccess, parseModuleList, revokeAccess } from "../src/server/provisioning.ts"
import { listAccessibleTeams, teamContextFor } from "../src/server/scope.ts"

const P = "prov_"
const ORG = `${P}org`
const SUPORTE = `${P}suporte`
const EXTRA = `${P}extra`
const U = { admin: `${P}admin`, thiago: `${P}thiago`, jean: `${P}jean`, ana: `${P}ana` }
const email = (key: string) => `${P}${key}@teste.local`
const actor = { organizationId: ORG, adminUserId: U.admin }

async function cleanup() {
  const teams = (await d.team.findMany({ where: { organizationId: ORG }, select: { id: true } })).map((t) => t.id)
  const inTeams = { teamId: { in: teams } }
  await d.auditLog.deleteMany({ where: { organizationId: ORG } })
  await d.teamMember.deleteMany({ where: inTeams })
  await d.alertThreshold.deleteMany({ where: inTeams })
  await d.blockerReason.deleteMany({ where: inTeams })
  await d.seniority.deleteMany({ where: inTeams })
  await d.teamModule.deleteMany({ where: inTeams })
  await d.teamAccess.deleteMany({ where: inTeams })
  await d.team.deleteMany({ where: { organizationId: ORG } })
  await d.user.deleteMany({ where: { organizationId: ORG } })
  await d.organization.deleteMany({ where: { id: ORG } })
}

/** Linhas do time em todas as tabelas que o provisionamento poderia tocar. */
async function teamFootprint(teamId: string) {
  const w = { where: { teamId } }
  return {
    members: await d.teamMember.count(w),
    seniorities: await d.seniority.count(w),
    blockers: await d.blockerReason.count(w),
    thresholds: await d.alertThreshold.count(w),
    modules: await d.teamModule.count(w),
    access: await d.teamAccess.count(w),
    competencies: await d.competency.count(w),
    responsibilities: await d.responsibility.count(w),
    dailies: await d.daily.count(w),
    agreements: await d.agreement.count(w),
    centrals: await d.central.count(w),
    priorityLevels: await d.priorityLevel.count(w),
  }
}

before(async () => {
  await cleanup()
  await d.organization.create({ data: { id: ORG, name: "Provisionamento (teste)", slug: "prov-org" } })
  for (const [key, id] of Object.entries(U)) {
    await d.user.create({ data: { id, email: email(key), name: key, role: "MANAGER", isPlatformAdmin: key === "admin", organizationId: ORG } })
  }
  for (const [id, slug] of [[SUPORTE, "suporte"], [EXTRA, "extra"]] as const) {
    await d.team.create({ data: { id, organizationId: ORG, name: slug, slug, managerUserId: U.thiago } })
  }
  await d.teamModule.createMany({ data: ["PRIORITY_VALIDATION", "DEV_RETURNS", "CENTRALS"].map((moduleKey) => ({ teamId: SUPORTE, moduleKey })) })
  await d.seniority.create({ data: { teamId: SUPORTE, organizationId: ORG, key: "PLENO", label: "Pleno", order: 1 } })
  await d.teamMember.create({
    data: { teamId: SUPORTE, fullName: "Pessoa do Suporte", preferredName: "Pessoa", position: "Analista", seniorityId: (await d.seniority.findFirstOrThrow({ where: { teamId: SUPORTE } })).id, joinedAt: new Date(Date.UTC(2024, 0, 1)), avatarSeed: "x" },
  })
  await d.teamAccess.createMany({
    data: [
      { userId: U.thiago, teamId: SUPORTE, level: "MANAGER" },
      { userId: U.jean, teamId: SUPORTE, level: "VIEWER" },
      { userId: U.jean, teamId: EXTRA, level: "VIEWER" },
      { userId: U.ana, teamId: SUPORTE, level: "VIEWER" },
    ],
  })
})

after(async () => {
  await cleanup()
  await d.$disconnect()
})

describe("team:create", () => {
  let treinamento = ""
  let jeff = ""

  test("abre o time numa transação, com só o mínimo e o VIEWER de quem vê todos", async () => {
    const suporteBefore = await teamFootprint(SUPORTE)
    const result = await createTeam(
      { name: "Treinamento", slug: "treinamento", managerEmail: ` ${email("jeff").toUpperCase()} `, managerName: "Jeff", modules: [] },
      actor,
    )
    treinamento = result.teamId
    jeff = result.managerUserId

    // Gestor novo: conta criada com senha que confere com o hash gravado (mostrada uma vez).
    assert.ok(result.managerPassword)
    const user = await d.user.findUniqueOrThrow({ where: { id: jeff } })
    assert.equal(user.email, email("jeff"))
    assert.ok(await comparePassword(result.managerPassword, user.passwordHash!))
    assert.equal(user.isPlatformAdmin, false)

    const team = await d.team.findUniqueOrThrow({ where: { id: treinamento } })
    assert.equal(team.isActive, true)
    assert.equal(team.createdByUserId, U.admin)

    // Acesso: Jeff MANAGER; Jean (VIEWER em todos) VIEWER; Ana (VIEWER de um só) e Thiago, nada.
    const access = await d.teamAccess.findMany({ where: { teamId: treinamento }, select: { userId: true, level: true } })
    assert.deepEqual(
      access.map((a) => [a.userId, a.level]).sort(),
      [[jeff, "MANAGER"], [U.jean, "VIEWER"]].sort(),
    )
    assert.deepEqual(result.viewers.map((v) => v.id), [U.jean])

    // D33: só senioridades, motivos de impeditivo e cadências. Nenhum módulo.
    const footprint = await teamFootprint(treinamento)
    assert.deepEqual(footprint, {
      members: 0, seniorities: 3, blockers: 9, thresholds: 4, modules: 0, access: 2,
      competencies: 0, responsibilities: 0, dailies: 0, agreements: 0, centrals: 0, priorityLevels: 0,
    })
    assert.deepEqual(
      (await d.seniority.findMany({ where: { teamId: treinamento }, orderBy: { order: "asc" }, select: { key: true, order: true } })).map((s) => [s.key, s.order]),
      DEFAULT_SENIORITIES.map((s) => [s.key, s.order]),
    )
    assert.deepEqual(
      (await d.blockerReason.findMany({ where: { teamId: treinamento }, orderBy: { order: "asc" }, select: { label: true, category: true } })),
      DEFAULT_BLOCKER_REASONS.map((b) => ({ label: b.label, category: b.category })),
    )
    assert.deepEqual(
      Object.fromEntries((await d.alertThreshold.findMany({ where: { teamId: treinamento } })).map((t) => [t.key, t.value])),
      { watchHighCadenceDays: 2, watchMediumCadenceDays: 7, watchLowCadenceDays: 21, watchStaleHighDays: 30 },
    )

    // Auditoria da criação (e da conta nova), no time novo, pelo administrador.
    const audit = await d.auditLog.findMany({ where: { teamId: treinamento, userId: U.admin }, select: { action: true } })
    assert.deepEqual(audit.map((a) => a.action).sort(), ["team.create", "user.create"])

    // O Suporte não muda nada.
    assert.deepEqual(await teamFootprint(SUPORTE), suporteBefore)

    // E pelo gate de escopo: Jeff entra no Treinamento sem nenhum módulo; Jean vê três times.
    const ctx = await teamContextFor(jeff, treinamento)
    assert.equal(ctx.level, "MANAGER")
    assert.equal(ctx.modules.size, 0)
    // Time vazio: a home não acusa nada (a direção "Cadastre seu time" é que aparece).
    const home = await getAlerts(ctx)
    assert.deepEqual(home.alerts, [])
    await assert.rejects(teamContextFor(jeff, SUPORTE), { name: "TeamAccessError" })
    assert.equal((await listAccessibleTeams(U.jean)).length, 3)
    assert.deepEqual((await listAccessibleTeams(U.ana)).map((t) => t.id), [SUPORTE])
  })

  test("gestor com conta existente é reaproveitado (sem senha nova); módulos escolhidos e nada mais", async () => {
    const result = await createTeam(
      { name: "Hardware", slug: "hardware", managerEmail: email("jeff"), managerName: "", modules: ["CENTRALS"] },
      actor,
    )
    assert.equal(result.managerUserId, jeff)
    assert.equal(result.managerPassword, null)
    assert.deepEqual(result.modules, ["CENTRALS"])
    assert.deepEqual((await d.teamModule.findMany({ where: { teamId: result.teamId }, select: { moduleKey: true } })).map((m) => m.moduleKey), ["CENTRALS"])
    // Jean continua vendo todos (agora 4); Jeff gerencia dois e não é VIEWER de todos.
    assert.deepEqual(result.viewers.map((v) => v.id), [U.jean])
    assert.equal((await listAccessibleTeams(U.jean)).length, 4)
    assert.equal(await d.user.count({ where: { email: email("jeff") } }), 1)
  })

  test("recusa: slug repetido, módulo desconhecido, conta nova sem nome, quem não administra", async () => {
    await assert.rejects(createTeam({ name: "Outro", slug: "treinamento", managerEmail: email("x"), managerName: "X" }, actor), /slug/)
    assert.throws(() => parseModuleList("CENTRALS, RELATORIOS"), /desconhecido/)
    await assert.rejects(createTeam({ name: "Sem nome", slug: "sem-nome", managerEmail: email("novo"), managerName: "" }, actor), /nome do gestor/)
    await assert.rejects(
      createTeam({ name: "Intruso", slug: "intruso", managerEmail: email("y"), managerName: "Y" }, { organizationId: ORG, adminUserId: U.thiago }),
      /isPlatformAdmin/,
    )
    await assert.rejects(createTeam({ name: "Slug ruim", slug: "Slug Ruim!", managerEmail: email("z"), managerName: "Z" }, actor), /slug/)
    // Nada ficou pela metade.
    assert.equal(await d.team.count({ where: { organizationId: ORG, slug: { in: ["intruso", "sem-nome"] } } }), 0)
    assert.equal(await d.user.count({ where: { email: { in: [email("novo"), email("y")] } } }), 0)
  })
})

describe("team:access", () => {
  test("conceder, mudar o nível e revogar sem apagar a linha; tudo auditado", async () => {
    const actorAccess = { email: email("ana"), teamSlug: "extra" }
    assert.equal(await grantAccess({ ...actorAccess, level: "VIEWER" }, actor), "granted")
    assert.equal(await grantAccess({ ...actorAccess, level: "VIEWER" }, actor), "unchanged")
    assert.equal(await grantAccess({ ...actorAccess, level: "MANAGER" }, actor), "changed")
    assert.equal((await teamContextFor(U.ana, EXTRA)).level, "MANAGER")
    assert.equal(await revokeAccess(actorAccess, actor), "revoked")
    assert.equal(await revokeAccess(actorAccess, actor), "none")
    await assert.rejects(teamContextFor(U.ana, EXTRA), { name: "TeamAccessError" })
    const row = await d.teamAccess.findUniqueOrThrow({ where: { userId_teamId: { userId: U.ana, teamId: EXTRA } } })
    assert.ok(row.revokedAt)
    // Conceder de novo reabre a mesma linha.
    assert.equal(await grantAccess({ ...actorAccess, level: "VIEWER" }, actor), "granted")
    assert.equal(await d.teamAccess.count({ where: { userId: U.ana, teamId: EXTRA } }), 1)
    assert.deepEqual(
      (await d.auditLog.findMany({ where: { teamId: EXTRA, entity: "TeamAccess" }, orderBy: { at: "asc" }, select: { action: true } })).map((a) => a.action),
      ["team.access.grant", "team.access.level", "team.access.revoke", "team.access.grant"],
    )
    await assert.rejects(grantAccess({ email: email("ninguem"), teamSlug: "extra", level: "VIEWER" }, actor), /não existe usuário/)
    await assert.rejects(grantAccess({ email: email("ana"), teamSlug: "nada", level: "VIEWER" }, actor), /não existe time/)
  })
})
