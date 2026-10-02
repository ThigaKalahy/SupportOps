/**
 * P13 — 1:1 e feedbacks. Regra do follow-up (pendente até a conversa
 * seguinte; para o VIEWER só contam registros compartilhados), combinados
 * gerados na mesma transação do 1:1/feedback (origem, vínculo, D17, timeline,
 * auditoria; linha inválida derruba tudo), o painel de contexto do 1:1 (o que
 * ficou do anterior sem navegar) e o índice /records com filtros.
 *
 * Usa os dados do seed (rode `pnpm db:seed` antes). As escritas usam uma
 * pessoa de teste própria, apagada ao final.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { formatDate, todayBusinessDate } from "../src/lib/dates.ts"
import { feedbackFollowUp, oneOnOneFollowUp } from "../src/lib/follow-up.ts"
import { parseRecordFilters } from "../src/lib/records-filters.ts"
import { db, dbIncludingDeleted } from "../src/server/db.ts"
import { createMemberRecord } from "../src/server/members.ts"
import { getOneOnOneContext, listRecords } from "../src/server/queries/records.ts"
import { createFeedbackRecord, createOneOnOneRecord } from "../src/server/records.ts"

const TEST_NAME = "Pessoa de Teste dos Registros"
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

async function cleanup() {
  const members = await dbIncludingDeleted.teamMember.findMany({ where: { fullName: TEST_NAME }, select: { id: true } })
  const ids = members.map((m) => m.id)
  if (ids.length === 0) return
  const memberId = { in: ids }
  const [oneOnOnes, feedbacks, agreements] = await Promise.all([
    dbIncludingDeleted.oneOnOne.findMany({ where: { memberId }, select: { id: true } }),
    dbIncludingDeleted.feedback.findMany({ where: { memberId }, select: { id: true } }),
    dbIncludingDeleted.agreement.findMany({ where: { memberId }, select: { id: true } }),
  ])
  await dbIncludingDeleted.timelineEvent.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.agreement.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.oneOnOne.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.feedback.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.auditLog.deleteMany({
    where: { entityId: { in: [...ids, ...[...oneOnOnes, ...feedbacks, ...agreements].map((r) => r.id)] } },
  })
  await dbIncludingDeleted.teamMember.deleteMany({ where: { id: { in: ids } } })
}

let memberId = ""

before(async () => {
  await cleanup()
  const seniority = await db.seniority.findFirstOrThrow({ where: { key: "JUNIOR" } })
  const created = await createMemberRecord(ownerViewer, {
    fullName: TEST_NAME,
    preferredName: "Teste Registros",
    position: "Analista de suporte",
    seniorityId: seniority.id,
    joinedAt: display(-200),
    status: "ACTIVE",
    email: "",
    responsibilityIds: [],
    competencies: [],
  })
  assert.ok(created.ok)
  memberId = (await db.teamMember.findFirstOrThrow({ where: { fullName: TEST_NAME } })).id
})

after(async () => {
  await cleanup()
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

const oneOnOne = (patch: Record<string, unknown>) => ({
  memberId,
  date: display(0),
  topics: "Assuntos",
  durationMinutes: "",
  memberPerception: "",
  managerPerception: "",
  wins: "",
  difficulties: "",
  development: "",
  nextReviewAt: "",
  visibility: "PRIVATE",
  agreements: [],
  ...patch,
})

describe("follow-up (src/lib/follow-up.ts)", () => {
  test("1:1: revisão pendente até um 1:1 posterior; vencida ganha a severidade", () => {
    const record = { date: day(-40), nextReviewAt: day(-10) }
    const pending = oneOnOneFollowUp(record, [{ kind: "feedback", date: day(-5) }], today)
    assert.equal(pending.status, "pending")
    assert.ok(pending.status === "pending" && pending.deadline.severity === "overdue")
    const done = oneOnOneFollowUp(record, [{ kind: "oneOnOne", date: day(-20) }], today)
    assert.ok(done.status === "done" && done.resolvedAt.getTime() === day(-20).getTime())
    assert.equal(oneOnOneFollowUp({ date: day(-1), nextReviewAt: null }, [], today).status, "none")
  })

  test("feedback: encerrado por conversa na data do follow-up ou depois — não antes, nem por ele mesmo", () => {
    const record = { id: "f1", followUpAt: day(-10) }
    assert.equal(feedbackFollowUp(record, [{ id: "o1", kind: "oneOnOne", date: day(-11) }], today).status, "pending")
    assert.equal(feedbackFollowUp(record, [{ id: "f1", kind: "feedback", date: day(-10) }], today).status, "pending")
    assert.equal(feedbackFollowUp(record, [{ id: "f2", kind: "feedback", date: day(-10) }], today).status, "done")
  })
})

describe("combinados gerados no 1:1 e no feedback", () => {
  test("1:1 com combinados: origem ONE_ON_ONE, vínculo, prazo original = prazo, linha na timeline e auditoria", async () => {
    const result = await createOneOnOneRecord(
      ownerViewer,
      oneOnOne({
        date: display(-14),
        topics: "Fila de integração e escalonamento",
        development: "Praticar análise de log com evidência",
        difficulties: "Chamados longos de ERP",
        nextReviewAt: display(-2),
        agreements: [
          { title: "Revisar o roteiro de escalonamento", dueDate: display(5) },
          { title: "Documentar dois casos de ERP", dueDate: display(9) },
        ],
      }),
    )
    assert.ok(result.ok)
    const record = await db.oneOnOne.findFirstOrThrow({ where: { memberId }, include: { sourcedAgreements: true } })
    assert.equal(record.sourcedAgreements.length, 2)
    for (const a of record.sourcedAgreements) {
      assert.equal(a.origin, "ONE_ON_ONE")
      assert.equal(a.memberId, memberId)
      assert.equal(a.originalDueDate.getTime(), a.dueDate.getTime())
      assert.equal(await db.timelineEvent.count({ where: { agreementId: a.id, type: "AGREEMENT" } }), 1)
    }
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "oneOnOne.create", entityId: record.id } })
    assert.equal((audit.after as { agreementIds: string[] }).agreementIds.length, 2)
  })

  test("combinado inválido (prazo no passado) recusa o 1:1 inteiro; nada é gravado", async () => {
    const before = await db.oneOnOne.count({ where: { memberId } })
    const result = await createOneOnOneRecord(
      ownerViewer,
      oneOnOne({ topics: "Não deve gravar", agreements: [{ title: "Prazo vencido", dueDate: display(-1) }] }),
    )
    assert.ok(!result.ok && result.fieldErrors?.["agreements.0.dueDate"])
    assert.equal(await db.oneOnOne.count({ where: { memberId } }), before)
  })

  test("feedback com combinado: origem FEEDBACK e vínculo com o feedback", async () => {
    const result = await createFeedbackRecord(ownerViewer, {
      memberId,
      date: display(-7),
      category: "DEVELOPMENT",
      context: "Plantão de sábado",
      behavior: "Escalou sem anexar o log",
      impact: "",
      guidance: "Anexar o log antes de escalar",
      followUpAt: display(-3),
      visibility: "SHARED",
      agreements: [{ title: "Anexar log em todo escalonamento", dueDate: display(7) }],
    })
    assert.ok(result.ok)
    const feedback = await db.feedback.findFirstOrThrow({ where: { memberId }, include: { sourcedAgreements: true } })
    assert.deepEqual(feedback.sourcedAgreements.map((a) => a.origin), ["FEEDBACK"])
  })
})

describe("painel de contexto do 1:1", () => {
  test("mostra o que ficou do 1:1 anterior sem navegar: revisão pendente, desenvolvimento, combinados gerados", async () => {
    const context = await getOneOnOneContext(ownerViewer, memberId, today)
    assert.ok(context.previous)
    assert.equal(context.previous.development, "Praticar análise de log com evidência")
    assert.equal(context.previous.difficulties, "Chamados longos de ERP")
    assert.ok(context.previous.followUp.status === "pending" && context.previous.followUp.deadline.severity !== "neutral")
    assert.deepEqual(
      context.previous.agreements.map((a) => a.title).sort(),
      ["Documentar dois casos de ERP", "Revisar o roteiro de escalonamento"],
    )
    assert.equal(context.openAgreements.length, 3)
    assert.equal(context.lastFeedback?.behavior, "Escalou sem anexar o log")
    assert.equal(context.lastFeedback?.followUp.status, "pending", "nenhum 1:1 depois do follow-up")
  })

  test("VIEWER não vê o 1:1 privado no contexto (nem os textos dele)", async () => {
    const context = await getOneOnOneContext(viewerOnly, memberId, today)
    assert.equal(context.previous, null)
    assert.equal(context.lastFeedback?.behavior, "Escalou sem anexar o log", "o feedback é compartilhado")
  })

  test("Henrique no seed: o contexto traz o 1:1 anterior e a revisão vencida", async () => {
    const henrique = await db.teamMember.findFirstOrThrow({ where: { preferredName: "Henrique" } })
    const context = await getOneOnOneContext(ownerViewer, henrique.id, today)
    assert.ok(context.previous)
    assert.ok(context.previous.followUp.status === "pending" && context.previous.followUp.deadline.severity === "overdue")
    assert.ok(context.plans.length >= 1)
  })
})

describe("índice /records", () => {
  test("dois tipos numa lista, mais recente primeiro; o 1:1 seguinte encerra a revisão do anterior", async () => {
    const rows = await listRecords(ownerViewer, { ...parseRecordFilters({}), memberId }, today)
    assert.deepEqual(rows.map((r) => r.kind), ["feedback", "oneOnOne"])
    assert.ok(rows[1]!.followUp.status === "pending")

    assert.ok((await createOneOnOneRecord(ownerViewer, oneOnOne({ date: display(-1), topics: "Retorno da revisão" }))).ok)
    const after = await listRecords(ownerViewer, { ...parseRecordFilters({}), memberId, type: "oneOnOne" }, today)
    assert.deepEqual(after.map((r) => r.kind), ["oneOnOne", "oneOnOne"])
    const earlier = after.find((r) => r.kind === "oneOnOne" && r.topics === "Fila de integração e escalonamento")!
    assert.ok(earlier.followUp.status === "done" && earlier.followUp.resolvedAt.getTime() === day(-1).getTime())
    // O 1:1 de ontem também encerra o follow-up do feedback (marcado para 3 dias atrás).
    const feedbackRow = (await listRecords(ownerViewer, { ...parseRecordFilters({}), memberId, type: "feedback" }, today))[0]!
    assert.equal(feedbackRow.followUp.status, "done")
  })

  test("VIEWER: só os compartilhados, e 1:1 privado não encerra pendência para ele", async () => {
    const rows = await listRecords(viewerOnly, { ...parseRecordFilters({}), memberId }, today)
    assert.ok(rows.every((r) => r.visibility === "SHARED"))
    assert.deepEqual(rows.map((r) => r.kind), ["feedback"])
    assert.equal(rows[0]!.followUp.status, "pending", "o 1:1 que encerraria é privado")
  })

  test("filtros: categoria só traz feedback; período; pessoa", async () => {
    const byCategory = await listRecords(ownerViewer, { ...parseRecordFilters({ category: "DEVELOPMENT" }), memberId }, today)
    assert.ok(byCategory.length === 1 && byCategory[0]!.kind === "feedback")
    const last30 = await listRecords(ownerViewer, { ...parseRecordFilters({ period: "30d" }), memberId }, today)
    assert.equal(last30.length, 3)
    const team = await listRecords(ownerViewer, parseRecordFilters({ period: "all" }), today)
    assert.ok(team.length > 50, "o seed tem dezenas de 1:1 e feedbacks")
    const dates = team.map((r) => r.date.getTime())
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a))
  })
})
