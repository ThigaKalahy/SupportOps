/**
 * P14 — desenvolvimento e PDI. Regras puras (idade do acompanhamento,
 * prontidão só para quem atende a tudo da senioridade atual), PDI parado do
 * seed, escritas (criar PDI com ações, acompanhamento na timeline, concluir,
 * ação, pontos fortes/de desenvolvimento com histórico, matriz) e o critério
 * de aceite: nenhuma lista ordena pessoas por desempenho, nada vira nota.
 *
 * Usa os dados do seed (rode `pnpm db:seed` antes). As escritas usam uma
 * pessoa de teste própria e são apagadas ao final; a matriz volta vazia.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { formatDate, todayBusinessDate } from "../src/lib/dates.ts"
import { planProgress, planStaleness, readiness, type SeniorityLevelMap } from "../src/lib/development.ts"
import { db, dbIncludingDeleted } from "../src/server/db.ts"
import {
  archiveTraitRecord,
  createPlanRecord,
  createTraitRecord,
  reviewPlanRecord,
  setActionStatusRecord,
  setExpectationRecord,
  setPlanStatusRecord,
} from "../src/server/development.ts"
import { createMemberRecord } from "../src/server/members.ts"
import { getDevelopmentOverview, getMemberDevelopment } from "../src/server/queries/development.ts"

const TEST_NAME = "Pessoa de Teste do Desenvolvimento"
const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const ownerViewer = { id: owner.id, role: owner.role, organizationId: owner.organizationId }
const viewerOnly = { id: "teste-viewer", role: "VIEWER" as const, organizationId: owner.organizationId }
const today = todayBusinessDate()
const day = (offset: number) => {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}
const display = (offset: number) => formatDate(day(offset), "business")

let memberId = ""
const competencies = await db.competency.findMany({ where: { organizationId: owner.organizationId }, orderBy: { name: "asc" }, take: 2 })
const [compA, compB] = competencies as [(typeof competencies)[number], (typeof competencies)[number]]
const seniorities = await db.seniority.findMany({ where: { organizationId: owner.organizationId }, orderBy: { order: "asc" } })

async function cleanup() {
  const members = await dbIncludingDeleted.teamMember.findMany({ where: { fullName: TEST_NAME }, select: { id: true } })
  const ids = members.map((m) => m.id)
  await dbIncludingDeleted.competencyExpectation.deleteMany({ where: { competencyId: { in: [compA.id, compB.id] } } })
  await dbIncludingDeleted.auditLog.deleteMany({ where: { entity: "CompetencyExpectation" } })
  if (ids.length === 0) return
  const memberIdIn = { in: ids }
  const [plans, traits] = await Promise.all([
    dbIncludingDeleted.developmentPlan.findMany({ where: { memberId: memberIdIn }, select: { id: true, actions: { select: { id: true } } } }),
    dbIncludingDeleted.memberTrait.findMany({ where: { memberId: memberIdIn }, select: { id: true } }),
  ])
  await dbIncludingDeleted.timelineEvent.deleteMany({ where: { memberId: memberIdIn } })
  await dbIncludingDeleted.developmentPlan.deleteMany({ where: { memberId: memberIdIn } })
  await dbIncludingDeleted.memberTrait.deleteMany({ where: { memberId: memberIdIn } })
  await dbIncludingDeleted.memberCompetency.deleteMany({ where: { memberId: memberIdIn } })
  await dbIncludingDeleted.auditLog.deleteMany({
    where: {
      entityId: {
        in: [...ids, ...plans.map((p) => p.id), ...plans.flatMap((p) => p.actions.map((a) => a.id)), ...traits.map((t) => t.id)],
      },
    },
  })
  await dbIncludingDeleted.teamMember.deleteMany({ where: { id: memberIdIn } })
}

before(async () => {
  await cleanup()
  const junior = seniorities.find((s) => s.key === "JUNIOR")!
  const created = await createMemberRecord(ownerViewer, {
    fullName: TEST_NAME,
    preferredName: "Teste Desenvolvimento",
    position: "Analista de suporte",
    seniorityId: junior.id,
    joinedAt: display(-300),
    status: "ACTIVE",
    email: "",
    responsibilityIds: [],
    competencies: [
      { competencyId: compA.id, level: 2 },
      { competencyId: compB.id, level: 1 },
    ],
  })
  assert.ok(created.ok)
  memberId = (await db.teamMember.findFirstOrThrow({ where: { fullName: TEST_NAME } })).id
})

after(async () => {
  await cleanup()
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

describe("regras puras (src/lib/development.ts)", () => {
  test("idade do acompanhamento: nunca acompanhado conta do início; parado depois de 45 dias; escala graduada", () => {
    const never = planStaleness({ lastReviewedAt: null, startedAt: day(-50) }, today)
    assert.deepEqual([never.days, never.neverReviewed, never.stale, never.severity.severity, never.severity.strong], [50, true, true, "attention", true])
    const fresh = planStaleness({ lastReviewedAt: new Date(), startedAt: day(-200) }, today)
    assert.deepEqual([fresh.days, fresh.stale, fresh.severity.severity], [0, false, "neutral"])
    assert.equal(planStaleness({ lastReviewedAt: null, startedAt: day(-100) }, today).severity.severity, "overdue")
    assert.deepEqual(planProgress([{ status: "DONE" }, { status: "OPEN" }, { status: "CANCELLED" }]), { done: 1, total: 2 })
  })

  test("prontidão: só com tudo da atual atendido; conta a próxima; sem matriz ou no topo, nada", () => {
    const s = (id: string, order: number, entries: [string, number][]): SeniorityLevelMap => ({ seniorityId: id, label: id, order, expected: new Map(entries) })
    const ladder = [s("J", 1, [["a", 1], ["b", 1]]), s("P", 2, [["a", 3], ["b", 2], ["c", 2]]), s("S", 3, [])]
    assert.deepEqual(readiness("J", ladder, new Map([["a", 3], ["b", 1], ["c", 4]])), { next: { seniorityId: "P", label: "P" }, total: 3, met: 2 })
    assert.equal(readiness("J", ladder, new Map([["a", 3]])), null, "b não avaliada conta como abaixo")
    assert.equal(readiness("P", ladder, new Map([["a", 5], ["b", 5], ["c", 5]])), null, "próxima sem matriz")
    assert.equal(readiness("S", ladder, new Map()), null, "sem próxima")
    assert.equal(readiness("J", [s("J", 1, []), s("P", 2, [["a", 1]])], new Map([["a", 1]])), null, "atual sem matriz")
  })
})

describe("seed", () => {
  test("o seed não preenche a matriz (P14); sem matriz, ninguém aparece em prontidão", async () => {
    const { readFileSync } = await import("node:fs")
    assert.ok(!/competencyExpectation\.(upsert|create)/.test(readFileSync("prisma/seed.ts", "utf8")))
    const overview = await getDevelopmentOverview(ownerViewer, today)
    if (overview.matrixEmpty) assert.deepEqual(overview.readiness, [])
  })

  test("o PDI do Henrique, sem acompanhamento há ~80 dias, aparece entre os parados", async () => {
    const overview = await getDevelopmentOverview(ownerViewer, today)
    const henrique = overview.stale.find((p) => p.member.preferredName === "Henrique")
    assert.ok(henrique, "PDI parado do Henrique")
    assert.ok(henrique.staleness.days > 45)
    assert.ok(overview.stale.every((p) => p.status === "ACTIVE" && p.staleness.stale))
    assert.equal(overview.plans.length, Object.values(overview.counts).reduce((s, n) => s + n, 0))
  })
})

describe("escritas", () => {
  test("criar PDI com ações: timeline ao meio-dia do início, auditoria; mentor exigido em ação de mentor", async () => {
    const mentor = await db.teamMember.findFirstOrThrow({ where: { preferredName: "Rafael" } })
    const base = {
      memberId,
      competencyId: compA.id,
      currentSituation: "Escala sem anexar evidência",
      objective: "Escalar com log e evidência",
      expectedEvidence: "Dez escalonamentos seguidos com log anexado",
      startedAt: display(-60),
      dueDate: display(30),
      status: "ACTIVE",
      actions: [
        { description: "Ler o guia de escalonamento", ownerType: "MEMBER", ownerMemberId: "", dueDate: display(5) },
        { description: "Acompanhar dois plantões", ownerType: "MENTOR", ownerMemberId: "", dueDate: "" },
      ],
    }
    const noMentor = await createPlanRecord(ownerViewer, base)
    assert.ok(!noMentor.ok && noMentor.fieldErrors?.["actions.1.ownerMemberId"])
    base.actions[1]!.ownerMemberId = mentor.id
    assert.ok((await createPlanRecord(ownerViewer, base)).ok)
    const plan = await db.developmentPlan.findFirstOrThrow({ where: { memberId }, include: { actions: true } })
    assert.equal(plan.actions.length, 2)
    const line = await db.timelineEvent.findFirstOrThrow({ where: { developmentPlanId: plan.id } })
    assert.equal(formatDate(line.occurredAt), display(-60), "data de negócio ao meio-dia, sem cair no dia anterior")
    assert.equal(await db.auditLog.count({ where: { action: "developmentPlan.create", entityId: plan.id } }), 1)
  })

  test("PDI nunca acompanhado há 60 dias está parado; registrar acompanhamento zera o relógio e entra na timeline", async () => {
    const plan = await db.developmentPlan.findFirstOrThrow({ where: { memberId } })
    let dev = await getMemberDevelopment(ownerViewer, memberId, today)
    assert.ok(dev!.plans[0]!.staleness.stale && dev!.plans[0]!.staleness.neverReviewed)

    assert.ok(!(await reviewPlanRecord(ownerViewer, { planId: plan.id, note: "" })).ok, "acompanhamento exige o que mudou")
    assert.ok((await reviewPlanRecord(ownerViewer, { planId: plan.id, note: "Leu o guia; anexou log em 4 de 5" })).ok)
    dev = await getMemberDevelopment(ownerViewer, memberId, today)
    assert.deepEqual([dev!.plans[0]!.staleness.stale, dev!.plans[0]!.progressNote], [false, "Leu o guia; anexou log em 4 de 5"])
    const review = await db.timelineEvent.findFirstOrThrow({ where: { developmentPlanId: plan.id, tags: { has: "acompanhamento" } } })
    assert.equal(review.summary, "Leu o guia; anexou log em 4 de 5")
    assert.equal(await db.auditLog.count({ where: { action: "developmentPlan.review", entityId: plan.id } }), 1)
  })

  test("ação concluída conta no progresso; concluir o PDI grava a data e a linha de conclusão", async () => {
    const plan = await db.developmentPlan.findFirstOrThrow({ where: { memberId }, include: { actions: true } })
    assert.ok((await setActionStatusRecord(ownerViewer, { actionId: plan.actions[0]!.id, status: "DONE" })).ok)
    let dev = await getMemberDevelopment(ownerViewer, memberId, today)
    assert.deepEqual(dev!.plans[0]!.progress, { done: 1, total: 2 })

    assert.ok((await setPlanStatusRecord(ownerViewer, { planId: plan.id, status: "DONE" })).ok)
    dev = await getMemberDevelopment(ownerViewer, memberId, today)
    assert.deepEqual([dev!.plans[0]!.status, dev!.plans[0]!.completedAt?.getTime()], ["DONE", today.getTime()])
    assert.equal(await db.timelineEvent.count({ where: { developmentPlanId: plan.id, tags: { has: "concluido" } } }), 1)
  })

  test("pontos fortes e de desenvolvimento: arquivar manda para o histórico, com a data observada", async () => {
    assert.ok((await createTraitRecord(ownerViewer, { memberId, kind: "STRENGTH", text: "Explica bem por escrito", observedAt: display(-20) })).ok)
    const trait = await db.memberTrait.findFirstOrThrow({ where: { memberId } })
    assert.ok((await archiveTraitRecord(ownerViewer, { traitId: trait.id })).ok)
    const dev = await getMemberDevelopment(ownerViewer, memberId, today)
    const stored = dev!.traits.find((t) => t.id === trait.id)!
    assert.deepEqual([stored.isActive, formatDate(stored.observedAt, "business")], [false, display(-20)])
  })

  test("matriz preenchível em /settings: grava, limpa, audita; com ela, a prontidão aparece em texto neutro", async () => {
    const junior = seniorities.find((s) => s.key === "JUNIOR")!
    const pleno = seniorities.find((s) => s.key === "PLENO")!
    for (const [competencyId, seniorityId, expectedLevel] of [
      [compA.id, junior.id, 1],
      [compB.id, junior.id, 1],
      [compA.id, pleno.id, 2],
      [compB.id, pleno.id, 3],
    ] as const) {
      assert.ok((await setExpectationRecord(ownerViewer, { competencyId, seniorityId, expectedLevel })).ok)
    }
    const dev = await getMemberDevelopment(ownerViewer, memberId, today)
    assert.deepEqual(dev!.readiness, { next: { seniorityId: pleno.id, label: pleno.label }, total: 2, met: 1 })
    const a = dev!.competencies.find((c) => c.id === compA.id)!
    assert.deepEqual([a.level, a.expectedCurrent, a.expectedNext], [2, 1, 2])

    const overview = await getDevelopmentOverview(ownerViewer, today)
    const names = overview.readiness.map((r) => r.member.preferredName)
    assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y)), "ordem alfabética, nunca por 'quão perto'")
    assert.ok(overview.readiness.every((r) => Number.isInteger(r.readiness.met) && Number.isInteger(r.readiness.total)))

    assert.ok((await setExpectationRecord(ownerViewer, { competencyId: compB.id, seniorityId: pleno.id, expectedLevel: null })).ok)
    assert.equal(await db.competencyExpectation.count({ where: { competencyId: compB.id, seniorityId: pleno.id } }), 0)
    assert.equal(await db.auditLog.count({ where: { action: "settings.competencyExpectation.update" } }), 5)
  })

  test("VIEWER lê o mesmo e não escreve", async () => {
    const plan = await db.developmentPlan.findFirstOrThrow({ where: { memberId } })
    assert.ok(!(await reviewPlanRecord(viewerOnly, { planId: plan.id, note: "Invasão" })).ok)
    assert.ok(!(await setExpectationRecord(viewerOnly, { competencyId: compA.id, seniorityId: seniorities[0]!.id, expectedLevel: 5 })).ok)
    assert.equal((await getMemberDevelopment(viewerOnly, memberId, today))!.plans.length, 1)
  })
})

describe("critério de aceite: nada ordena pessoas por desempenho nem vira nota", () => {
  test("as telas de desenvolvimento não exibem porcentagem nem score", async () => {
    const { readFileSync, readdirSync } = await import("node:fs")
    const files = [
      ...readdirSync("src/components/development").map((f) => `src/components/development/${f}`),
      "src/app/(app)/development/page.tsx",
      "src/app/(app)/team/[memberId]/development/page.tsx",
    ]
    for (const file of files) {
      const source = readFileSync(file, "utf8")
      assert.ok(!/%\s*[`"'<}]|percent\(|score/i.test(source), `${file} mostra porcentagem ou score`)
    }
  })
})
