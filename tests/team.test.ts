/**
 * P6 — /team. Critérios: a listagem sai de UMA consulta com os agregados (sem
 * N+1); não há ranking; a atenção explica o motivo; cadastro, edição e
 * desativação gravam evento de carreira, timeline e auditoria, sem apagar.
 *
 * Usa os dados do seed (rode `pnpm db:seed` antes). As escritas usam uma
 * pessoa de teste, apagada ao final.
 */
process.env.PRISMA_COUNT_QUERIES = "1"

import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

const { db, dbIncludingDeleted, queryCounter } = await import("../src/server/db.ts")
const { listTeamMembers } = await import("../src/server/queries/members.ts")
const { getThresholds } = await import("../src/server/queries/thresholds.ts")
const { memberAttention } = await import("../src/server/alerts.ts")
const { createMemberRecord, updateMemberRecord, deactivateMemberRecord } = await import("../src/server/members.ts")

const TEST_NAME = "Pessoa de Teste Automatizado"

async function cleanupTestMember() {
  const members = await dbIncludingDeleted.teamMember.findMany({ where: { fullName: TEST_NAME }, select: { id: true } })
  const ids = members.map((m) => m.id)
  if (ids.length === 0) return
  await dbIncludingDeleted.timelineEvent.deleteMany({ where: { memberId: { in: ids } } })
  await dbIncludingDeleted.memberChange.deleteMany({ where: { memberId: { in: ids } } })
  await dbIncludingDeleted.memberResponsibility.deleteMany({ where: { memberId: { in: ids } } })
  await dbIncludingDeleted.memberCompetency.deleteMany({ where: { memberId: { in: ids } } })
  await dbIncludingDeleted.auditLog.deleteMany({ where: { entity: "TeamMember", entityId: { in: ids } } })
  await dbIncludingDeleted.teamMember.deleteMany({ where: { id: { in: ids } } })
}

const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const ownerViewer = { id: owner.id, role: owner.role, organizationId: owner.organizationId }
const viewerOnly = { id: "teste-viewer", role: "VIEWER" as const, organizationId: owner.organizationId }

after(async () => {
  await cleanupTestMember()
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

describe("listagem de /team", () => {
  before(cleanupTestMember)

  test("uma única consulta SQL, com os agregados (sem N+1)", async () => {
    // Os limiares de alerta (P15) vêm carregados do layout; a listagem em si é UMA consulta.
    const thresholds = await getThresholds(ownerViewer)
    const start = queryCounter.count
    const rows = await listTeamMembers(ownerViewer, {}, thresholds)
    assert.equal(queryCounter.count - start, 1)
    assert.equal(rows.length, 9)
    assert.ok(rows.every((r) => typeof r.openAgreements === "number"))
  })

  test("ordem por senioridade e nome — nunca por métrica", async () => {
    const rows = await listTeamMembers(ownerViewer)
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!
      const cur = rows[i]!
      assert.ok(prev.seniorityOrder >= cur.seniorityOrder, "senioridade mais alta primeiro")
      if (prev.seniorityOrder === cur.seniorityOrder) {
        assert.ok(prev.preferredName.localeCompare(cur.preferredName) <= 0, "mesmo grupo em ordem alfabética")
      }
    }
  })

  test("atenção diz exatamente por quê (padrões do seed)", async () => {
    const rows = await listTeamMembers(ownerViewer)
    const byName = (name: string) => rows.find((r) => r.preferredName === name)!
    const henrique = byName("Henrique").attention
    assert.ok(henrique, "Henrique precisa de atenção")
    assert.ok(henrique.reasons.some((r) => r.text.startsWith("PDI sem acompanhamento")))
    assert.ok(henrique.reasons.some((r) => r.text.startsWith("Sem 1:1 há")))
    const priscila = byName("Priscila").attention
    assert.equal(priscila?.severity, "overdue")
    assert.ok(priscila?.reasons.some((r) => /combinados vencidos; o mais antigo há \d+ dias/.test(r.text)))
    const beatriz = byName("Beatriz").attention
    assert.ok(beatriz?.reasons.some((r) => /Sem 1:1 há \d+ dias \(referência para Júnior: 21 dias\)/.test(r.text)))
    const diego = byName("Diego").attention
    assert.ok(diego?.reasons.some((r) => r.text.includes("reagendado 3 vezes ou mais")))
  })

  test("VIEWER: último 1:1 só conta 1:1 compartilhado", async () => {
    const rows = await listTeamMembers(viewerOnly)
    for (const row of rows) {
      const shared = await dbIncludingDeleted.oneOnOne.aggregate({
        where: { memberId: row.id, visibility: "SHARED", deletedAt: null },
        _max: { date: true },
      })
      assert.equal(row.lastOneOnOne?.getTime() ?? null, shared._max.date?.getTime() ?? null, row.preferredName)
    }
  })

  test("filtros: senioridade e precisa de atenção", async () => {
    const juniors = await listTeamMembers(ownerViewer, { seniority: "JUNIOR" })
    assert.equal(juniors.length, 4)
    assert.ok(juniors.every((r) => r.seniorityKey === "JUNIOR"))
    const flagged = await listTeamMembers(ownerViewer, { needsAttention: true })
    assert.ok(flagged.length > 0 && flagged.length < 9)
    assert.ok(flagged.every((r) => r.attention !== null))
  })
})

describe("memberAttention (regras)", () => {
  const today = new Date(Date.UTC(2026, 9, 1))
  const base = {
    seniorityKey: "PLENO",
    seniorityLabel: "Pleno",
    joinedAt: new Date(Date.UTC(2024, 0, 1)),
    lastOneOnOne: new Date(Date.UTC(2026, 8, 25)),
    overdueAgreements: 0,
    oldestOverdueDue: null,
    dueSoonAgreements: 0,
    chronicAgreements: 0,
    oldestPlanReview: null,
  }

  test("sem pendência, sem sinal", () => assert.equal(memberAttention(base, today), null))

  test("1:1 atrasado: atenção; acima do dobro do limite: vencido", () => {
    const late = memberAttention({ ...base, lastOneOnOne: new Date(Date.UTC(2026, 7, 20)) }, today)
    assert.equal(late?.severity, "attention")
    const veryLate = memberAttention({ ...base, lastOneOnOne: new Date(Date.UTC(2026, 5, 1)) }, today)
    assert.equal(veryLate?.severity, "overdue")
  })

  test("o motivo mais grave define a cor; todos os motivos aparecem", () => {
    const result = memberAttention(
      { ...base, overdueAgreements: 2, oldestOverdueDue: new Date(Date.UTC(2026, 7, 1)), dueSoonAgreements: 1 },
      today,
    )
    assert.equal(result?.severity, "overdue")
    assert.equal(result?.reasons.length, 2)
    assert.equal(result?.reasons[0]?.text, "2 combinados vencidos; o mais antigo há 61 dias")
    assert.equal(result?.reasons[1]?.text, "1 combinado vence em até 3 dias")
  })
})

describe("cadastro, edição e desativação", async () => {
  const seniorities = await dbIncludingDeleted.seniority.findMany({ where: { organizationId: owner.organizationId } })
  const junior = seniorities.find((s) => s.key === "JUNIOR")!
  const pleno = seniorities.find((s) => s.key === "PLENO")!
  const form = {
    fullName: TEST_NAME,
    preferredName: "Teste",
    position: "Analista de suporte",
    seniorityId: junior.id,
    joinedAt: "01/09/2026",
    status: "ACTIVE",
    email: "",
    responsibilityIds: [],
    competencies: [],
  }

  test("VIEWER não escreve", async () => {
    const result = await createMemberRecord(viewerOnly, form)
    assert.equal(result.ok, false)
  })

  test("data inválida ou no futuro é recusada", async () => {
    assert.equal((await createMemberRecord(ownerViewer, { ...form, joinedAt: "31/02/2026" })).ok, false)
    assert.equal((await createMemberRecord(ownerViewer, { ...form, joinedAt: "01/01/2999" })).ok, false)
  })

  test("cadastra com auditoria", async () => {
    assert.deepEqual(await createMemberRecord(ownerViewer, form), { ok: true })
    const member = await dbIncludingDeleted.teamMember.findFirstOrThrow({ where: { fullName: TEST_NAME } })
    assert.equal(member.joinedAt.toISOString().slice(0, 10), "2026-09-01")
    assert.equal(await dbIncludingDeleted.auditLog.count({ where: { entityId: member.id, action: "member.create" } }), 1)
  })

  test("mudar senioridade sem motivo é recusado; com motivo vira evento de carreira", async () => {
    const member = await dbIncludingDeleted.teamMember.findFirstOrThrow({ where: { fullName: TEST_NAME } })
    const noReason = await updateMemberRecord(ownerViewer, { ...form, id: member.id, seniorityId: pleno.id, reason: "" })
    assert.equal(noReason.ok, false)
    assert.ok(!noReason.ok && noReason.fieldErrors?.reason)

    const ok = await updateMemberRecord(ownerViewer, {
      ...form,
      id: member.id,
      seniorityId: pleno.id,
      reason: "Assumiu a fila N2 sozinha no trimestre.",
    })
    assert.deepEqual(ok, { ok: true })
    const change = await dbIncludingDeleted.memberChange.findFirstOrThrow({ where: { memberId: member.id } })
    assert.equal(change.changeType, "SENIORITY")
    assert.equal(change.fromValue, "JUNIOR")
    assert.equal(change.toValue, "PLENO")
    const event = await dbIncludingDeleted.timelineEvent.findFirstOrThrow({ where: { memberChangeId: change.id } })
    assert.equal(event.type, "SENIORITY_CHANGE")
    assert.equal(event.title, "Júnior → Pleno")
  })

  test("edição sem mudança de carreira não pede motivo nem grava evento", async () => {
    const member = await dbIncludingDeleted.teamMember.findFirstOrThrow({ where: { fullName: TEST_NAME } })
    const before = await dbIncludingDeleted.memberChange.count({ where: { memberId: member.id } })
    const result = await updateMemberRecord(ownerViewer, {
      ...form,
      id: member.id,
      seniorityId: pleno.id,
      preferredName: "Testinho",
      reason: "",
    })
    assert.deepEqual(result, { ok: true })
    assert.equal(await dbIncludingDeleted.memberChange.count({ where: { memberId: member.id } }), before)
  })

  test("desativar: INACTIVE + deletedAt, nada apagado, some da lista padrão", async () => {
    const member = await dbIncludingDeleted.teamMember.findFirstOrThrow({ where: { fullName: TEST_NAME } })
    assert.equal((await deactivateMemberRecord(ownerViewer, { id: member.id, reason: "" })).ok, false)
    assert.deepEqual(await deactivateMemberRecord(ownerViewer, { id: member.id, reason: "Saiu da empresa." }), { ok: true })
    const after = await dbIncludingDeleted.teamMember.findUniqueOrThrow({ where: { id: member.id } })
    assert.equal(after.status, "INACTIVE")
    assert.ok(after.deletedAt)
    assert.ok(!(await listTeamMembers(ownerViewer)).some((r) => r.id === member.id))
    assert.ok((await listTeamMembers(ownerViewer, { status: "inactive" })).some((r) => r.id === member.id))
    const statusChange = await dbIncludingDeleted.memberChange.findFirst({ where: { memberId: member.id, changeType: "STATUS" } })
    assert.equal(statusChange?.toValue, "INACTIVE")
  })
})
