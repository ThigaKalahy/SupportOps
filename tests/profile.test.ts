/**
 * P7 — perfil do analista. Cobre as leituras do cabeçalho e da visão geral
 * (com a regra de visibilidade do VIEWER) e as escritas disparadas pelo
 * cabeçalho: 1:1, feedback, anotação, combinado e resumo gerencial — cada uma
 * com linha na timeline (mesma visibilidade) e AuditLog na mesma transação.
 *
 * Usa os dados do seed (rode `pnpm db:seed` antes). As escritas usam uma
 * pessoa de teste própria, apagada ao final.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { db, dbIncludingDeleted } from "../src/server/db.ts"
import { businessDateAtNoon, formatDate, todayBusinessDate } from "../src/lib/dates.ts"
import { getMemberOverview, getMemberProfile } from "../src/server/queries/profile.ts"
import { createMemberRecord, deactivateMemberRecord, updateManagerSummaryRecord } from "../src/server/members.ts"
import { createFeedbackRecord, createNoteRecord, createOneOnOneRecord } from "../src/server/records.ts"
import { createAgreementRecord } from "../src/server/agreements.ts"

const TEST_NAME = "Pessoa de Teste do Perfil"

async function cleanup() {
  const members = await dbIncludingDeleted.teamMember.findMany({ where: { fullName: TEST_NAME }, select: { id: true } })
  const ids = members.map((m) => m.id)
  if (ids.length === 0) return
  const memberId = { in: ids }
  const [oneOnOnes, feedbacks, notes, agreements] = await Promise.all([
    dbIncludingDeleted.oneOnOne.findMany({ where: { memberId }, select: { id: true } }),
    dbIncludingDeleted.feedback.findMany({ where: { memberId }, select: { id: true } }),
    dbIncludingDeleted.note.findMany({ where: { memberId }, select: { id: true } }),
    dbIncludingDeleted.agreement.findMany({ where: { memberId }, select: { id: true } }),
  ])
  const recordIds = [...ids, ...oneOnOnes, ...feedbacks, ...notes, ...agreements].map((r) => (typeof r === "string" ? r : r.id))
  await dbIncludingDeleted.timelineEvent.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.oneOnOne.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.feedback.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.note.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.agreement.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.memberChange.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.auditLog.deleteMany({ where: { entityId: { in: recordIds } } })
  await dbIncludingDeleted.teamMember.deleteMany({ where: { id: { in: ids } } })
}

const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const ownerViewer = { id: owner.id, role: owner.role, organizationId: owner.organizationId }
const viewerOnly = { id: "teste-viewer", role: "VIEWER" as const, organizationId: owner.organizationId }

const today = todayBusinessDate()
const display = (offsetDays: number) => {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return formatDate(d, "business")
}

async function seedMember(name: string) {
  const member = await db.teamMember.findFirst({ where: { preferredName: name } })
  assert.ok(member, `${name} existe no seed`)
  return member
}

after(async () => {
  await cleanup()
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

describe("datas de negócio na timeline", () => {
  test("data de negócio vira meio-dia em São Paulo e é exibida no mesmo dia", () => {
    const day = new Date(Date.UTC(2026, 7, 4))
    assert.equal(formatDate(businessDateAtNoon(day)), "04/08/2026")
    assert.equal(formatDate(day), "03/08/2026", "meia-noite UTC cairia no dia anterior — o defeito evitado")
  })

  test("1:1 e feedback do seed estão gravados ao meio-dia em São Paulo", async () => {
    const rows = await db.timelineEvent.findMany({ where: { type: { in: ["ONE_ON_ONE", "FEEDBACK"] } }, take: 20 })
    assert.ok(rows.length > 0)
    assert.ok(rows.every((r) => r.occurredAt.getUTCHours() === 15))
  })
})

describe("cabeçalho do perfil", () => {
  test("Henrique: fatos de cadastro, último 1:1 e atenção com motivos", async () => {
    const henrique = await seedMember("Henrique")
    const profile = await getMemberProfile(ownerViewer, henrique.id)
    assert.ok(profile)
    assert.equal(profile.seniorityKey, "PLENO")
    assert.equal(profile.managerName, owner.name)
    const last = await db.oneOnOne.findFirst({ where: { memberId: henrique.id }, orderBy: { date: "desc" } })
    assert.equal(profile.lastOneOnOne?.getTime(), last?.date.getTime())
    assert.ok(profile.attention?.reasons.some((r) => r.text.startsWith("PDI sem acompanhamento")))
  })

  test("VIEWER: último 1:1 e próximo acompanhamento só a partir de registros compartilhados", async () => {
    const people = await db.teamMember.findMany({ select: { id: true } })
    for (const person of people) {
      const profile = await getMemberProfile(viewerOnly, person.id)
      const lastShared = await db.oneOnOne.findFirst({
        where: { memberId: person.id, visibility: "SHARED" },
        orderBy: { date: "desc" },
      })
      assert.equal(profile?.lastOneOnOne?.getTime() ?? null, lastShared?.date.getTime() ?? null)
      if (profile?.nextFollowUp?.kind === "oneOnOne") {
        assert.equal(profile.nextFollowUp.date.getTime(), lastShared?.nextReviewAt?.getTime())
      }
    }
  })

  test("pessoa de outra organização não abre", async () => {
    const henrique = await seedMember("Henrique")
    const outsider = { ...ownerViewer, organizationId: "outra-organizacao" }
    assert.equal(await getMemberProfile(outsider, henrique.id), null)
  })
})

describe("visão geral", () => {
  test("últimos 5 registros: VIEWER nunca recebe PRIVATE; OWNER recebe os mais recentes", async () => {
    const people = await db.teamMember.findMany({ select: { id: true } })
    for (const person of people) {
      const asViewer = await getMemberOverview(viewerOnly, person.id)
      assert.ok(asViewer.recentEvents.length <= 5)
      assert.ok(asViewer.recentEvents.every((e) => e.visibility === "SHARED"))
    }
    const henrique = await seedMember("Henrique")
    const asOwner = await getMemberOverview(ownerViewer, henrique.id)
    const newest = await db.timelineEvent.findMany({
      where: { memberId: henrique.id },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 5,
    })
    assert.deepEqual(
      asOwner.recentEvents.map((e) => e.id),
      newest.map((e) => e.id),
    )
  })

  test("combinados em aberto por prazo, com arrasto (Diego) e vencidos (Priscila)", async () => {
    const diego = await getMemberOverview(ownerViewer, (await seedMember("Diego")).id)
    assert.ok(diego.agreements.some((a) => a.reschedules >= 4), "Diego tem combinado reagendado 4 vezes")
    const priscila = await getMemberOverview(ownerViewer, (await seedMember("Priscila")).id)
    const dues = priscila.agreements.map((a) => a.dueDate.getTime())
    assert.deepEqual(dues, [...dues].sort((a, b) => a - b))
    assert.ok(priscila.agreements.filter((a) => a.dueDate < today).length >= 2)
    assert.ok(priscila.agreements.every((a) => a.status === "OPEN" || a.status === "IN_PROGRESS"))
  })

  test("PDIs ativos com andamento das ações; mentorias nos dois sentidos", async () => {
    const people = await db.teamMember.findMany({ select: { id: true } })
    let plans = 0
    let mentorshipSides = 0
    for (const person of people) {
      const overview = await getMemberOverview(ownerViewer, person.id)
      for (const plan of overview.plans) {
        plans++
        assert.ok(plan.actionsDone <= plan.actionsTotal)
      }
      mentorshipSides += overview.mentors.length + overview.mentees.length
      assert.ok(overview.mentors.every((m) => m.person.id !== person.id))
      assert.ok(overview.mentees.every((m) => m.person.id !== person.id))
    }
    assert.ok(plans > 0, "o seed tem PDIs ativos")
    const activeLinks = await db.mentorshipLink.count({ where: { endedAt: null } })
    assert.equal(mentorshipSides, activeLinks * 2, "cada mentoria ativa aparece no mentor e no mentorado")
  })
})

describe("registros pelo cabeçalho do perfil", () => {
  let memberId = ""

  before(async () => {
    await cleanup()
    const seniority = await db.seniority.findFirstOrThrow({ where: { key: "JUNIOR" } })
    const created = await createMemberRecord(ownerViewer, {
      fullName: TEST_NAME,
      preferredName: "Teste Perfil",
      position: "Analista de suporte",
      seniorityId: seniority.id,
      joinedAt: display(-30),
      status: "ACTIVE",
      email: "",
      responsibilityIds: [],
      competencies: [],
    })
    assert.ok(created.ok)
    memberId = (await db.teamMember.findFirstOrThrow({ where: { fullName: TEST_NAME } })).id
  })

  test("VIEWER não registra nada", async () => {
    const forbidden = [
      await createOneOnOneRecord(viewerOnly, {}),
      await createFeedbackRecord(viewerOnly, {}),
      await createNoteRecord(viewerOnly, {}),
      await createAgreementRecord(viewerOnly, {}),
      await updateManagerSummaryRecord(viewerOnly, {}),
    ]
    assert.ok(forbidden.every((r) => !r.ok && r.error === "Ação não permitida para o seu papel."))
  })

  test("1:1 nasce PRIVATE, com linha PRIVATE na timeline e auditoria", async () => {
    const invalid = await createOneOnOneRecord(ownerViewer, {
      memberId,
      date: display(0),
      topics: "Andamento da fila",
      durationMinutes: "",
      memberPerception: "",
      managerPerception: "",
      wins: "",
      difficulties: "",
      development: "",
      nextReviewAt: display(-1),
      visibility: "PRIVATE",
    })
    assert.ok(!invalid.ok && invalid.fieldErrors?.nextReviewAt, "próxima revisão antes do 1:1 é recusada")

    const result = await createOneOnOneRecord(ownerViewer, {
      memberId,
      date: display(0),
      topics: "Andamento da fila",
      durationMinutes: "30",
      memberPerception: "",
      managerPerception: "Mais seguro nos chamados de rede",
      wins: "",
      difficulties: "",
      development: "",
      nextReviewAt: display(21),
      visibility: "PRIVATE",
    })
    assert.ok(result.ok)
    const record = await db.oneOnOne.findFirstOrThrow({ where: { memberId } })
    assert.equal(record.visibility, "PRIVATE")
    assert.equal(record.durationMinutes, 30)
    assert.equal(record.memberPerception, null, "campo vazio vira null")
    const line = await db.timelineEvent.findFirstOrThrow({ where: { oneOnOneId: record.id } })
    assert.equal(line.visibility, "PRIVATE")
    assert.equal(formatDate(line.occurredAt), display(0))
    assert.equal(await db.auditLog.count({ where: { action: "oneOnOne.create", entityId: record.id } }), 1)

    const profile = await getMemberProfile(ownerViewer, memberId)
    assert.equal(profile?.nextFollowUp?.kind, "oneOnOne")
    assert.equal(formatDate(profile!.nextFollowUp!.date, "business"), display(21))
    const asViewer = await getMemberProfile(viewerOnly, memberId)
    assert.equal(asViewer?.lastOneOnOne, null, "VIEWER não enxerga o 1:1 privado")
  })

  test("feedback de reconhecimento compartilhado vira linha RECOGNITION compartilhada", async () => {
    const result = await createFeedbackRecord(ownerViewer, {
      memberId,
      date: display(0),
      category: "RECOGNITION",
      context: "",
      behavior: "Assumiu o plantão do fim de semana sem ser pedido",
      impact: "Nenhum chamado crítico ficou sem resposta",
      guidance: "",
      followUpAt: "",
      visibility: "SHARED",
    })
    assert.ok(result.ok)
    const record = await db.feedback.findFirstOrThrow({ where: { memberId } })
    const line = await db.timelineEvent.findFirstOrThrow({ where: { feedbackId: record.id } })
    assert.equal(line.type, "RECOGNITION")
    assert.equal(line.visibility, "SHARED")
    assert.equal(await db.auditLog.count({ where: { action: "feedback.create", entityId: record.id } }), 1)
  })

  test("anotação nasce privada e entra nos últimos registros só para o OWNER", async () => {
    const result = await createNoteRecord(ownerViewer, {
      memberId,
      date: display(0),
      title: "Conversa sobre escala",
      body: "Pediu para não ficar no plantão de dezembro.",
      visibility: "PRIVATE",
    })
    assert.ok(result.ok)
    const note = await db.note.findFirstOrThrow({ where: { memberId } })
    const owners = await getMemberOverview(ownerViewer, memberId)
    const viewers = await getMemberOverview(viewerOnly, memberId)
    assert.ok(owners.recentEvents.some((e) => e.title === note.title))
    assert.ok(!viewers.recentEvents.some((e) => e.title === note.title))
    assert.equal(await db.auditLog.count({ where: { action: "note.create", entityId: note.id } }), 1)
  })

  test("combinado: prazo no passado é recusado; prazo original = prazo atual (D17)", async () => {
    const base = { memberId, title: "Revisar a base de conhecimento de VPN", description: "", priority: "NORMAL", origin: "MANAGER" }
    const past = await createAgreementRecord(ownerViewer, { ...base, dueDate: display(-1) })
    assert.ok(!past.ok && past.fieldErrors?.dueDate)

    const result = await createAgreementRecord(ownerViewer, { ...base, dueDate: display(7) })
    assert.ok(result.ok)
    const agreement = await db.agreement.findFirstOrThrow({ where: { memberId } })
    assert.equal(agreement.originalDueDate.getTime(), agreement.dueDate.getTime())
    assert.equal(agreement.status, "OPEN")
    const line = await db.timelineEvent.findFirstOrThrow({ where: { agreementId: agreement.id } })
    assert.equal(line.type, "AGREEMENT")
    assert.equal(await db.auditLog.count({ where: { action: "agreement.create", entityId: agreement.id } }), 1)
    const overview = await getMemberOverview(ownerViewer, memberId)
    assert.deepEqual(overview.agreements.map((a) => a.id), [agreement.id])
  })

  test("resumo gerencial: grava com o texto anterior na auditoria; vazio apaga", async () => {
    assert.ok((await updateManagerSummaryRecord(ownerViewer, { id: memberId, managerSummary: "Evoluindo bem em rede." })).ok)
    assert.ok((await updateManagerSummaryRecord(ownerViewer, { id: memberId, managerSummary: "  " })).ok)
    const member = await db.teamMember.findUniqueOrThrow({ where: { id: memberId } })
    assert.equal(member.managerSummary, null)
    const audits = await db.auditLog.findMany({ where: { action: "member.summary.update", entityId: memberId }, orderBy: { at: "asc" } })
    assert.equal(audits.length, 2)
    assert.deepEqual(audits[1]?.before, { managerSummary: "Evoluindo bem em rede." })
    assert.equal(await db.timelineEvent.count({ where: { memberId, type: "NOTE", title: "Evoluindo bem em rede." } }), 0)
  })

  test("pessoa desativada: perfil continua acessível e não recebe registros", async () => {
    assert.ok((await deactivateMemberRecord(ownerViewer, { id: memberId, reason: "Fim do teste" })).ok)
    const profile = await getMemberProfile(ownerViewer, memberId)
    assert.equal(profile?.status, "INACTIVE")
    assert.equal(profile?.attention, null)
    const note = await createNoteRecord(ownerViewer, {
      memberId,
      date: display(0),
      title: "Depois de desativar",
      body: "Não deveria gravar.",
      visibility: "PRIVATE",
    })
    assert.ok(!note.ok)
  })
})
