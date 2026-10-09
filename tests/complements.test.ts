/**
 * Complementos das fases anteriores (feitos junto com o P15): editar e excluir
 * 1:1, feedback e anotação (timeline refeita na mesma transação, nunca
 * vazando privado); reativar pessoa; editar PDI e acrescentar ação; registrar
 * e encerrar mentoria; catálogo de competências em /settings.
 *
 * Usa uma pessoa de teste própria; tudo é apagado ao final.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { formatDate, todayBusinessDate } from "../src/lib/dates.ts"
import { db, dbIncludingDeleted } from "../src/server/db.ts"
import {
  addPlanActionRecord,
  createMentorshipRecord,
  createPlanRecord,
  endMentorshipRecord,
  reviewPlanRecord,
  updatePlanRecord,
} from "../src/server/development.ts"
import { createMemberRecord, deactivateMemberRecord, reactivateMemberRecord } from "../src/server/members.ts"
import { getMemberTimeline } from "../src/server/queries/records.ts"
import { listCompetencies } from "../src/server/queries/settings.ts"
import {
  createFeedbackRecord,
  createNoteRecord,
  createOneOnOneRecord,
  deleteRecordRecord,
  updateFeedbackRecord,
  updateNoteRecord,
  updateOneOnOneRecord,
} from "../src/server/records.ts"
import { deleteCatalogItemRecord, moveCatalogItemRecord, saveCatalogItemRecord } from "../src/server/settings.ts"
import { seedContexts } from "./support/team-context.ts"

const TEST_NAME = "Pessoa de Teste dos Complementos"
const COMPETENCY = "Competência de Teste dos Complementos"
const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const { manager: ownerViewer, viewer: viewerOnly } = await seedContexts(owner)
const today = todayBusinessDate()
const display = (offset: number) => {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + offset)
  return formatDate(d, "business")
}

let memberId = ""

async function cleanup() {
  const members = await dbIncludingDeleted.teamMember.findMany({ where: { fullName: TEST_NAME }, select: { id: true } })
  const ids = members.map((m) => m.id)
  const competencies = await dbIncludingDeleted.competency.findMany({ where: { name: COMPETENCY }, select: { id: true } })
  if (ids.length) {
    const memberIdIn = { in: ids }
    const [ones, feedbacks, notes, plans, agreements, links, changes] = await Promise.all([
      dbIncludingDeleted.oneOnOne.findMany({ where: { memberId: memberIdIn }, select: { id: true } }),
      dbIncludingDeleted.feedback.findMany({ where: { memberId: memberIdIn }, select: { id: true } }),
      dbIncludingDeleted.note.findMany({ where: { memberId: memberIdIn }, select: { id: true } }),
      dbIncludingDeleted.developmentPlan.findMany({ where: { memberId: memberIdIn }, select: { id: true, actions: { select: { id: true } } } }),
      dbIncludingDeleted.agreement.findMany({ where: { memberId: memberIdIn }, select: { id: true } }),
      dbIncludingDeleted.mentorshipLink.findMany({
        where: { OR: [{ mentorMemberId: memberIdIn }, { menteeMemberId: memberIdIn }] },
        select: { id: true },
      }),
      dbIncludingDeleted.memberChange.findMany({ where: { memberId: memberIdIn }, select: { id: true } }),
    ])
    await dbIncludingDeleted.timelineEvent.deleteMany({ where: { memberId: memberIdIn } })
    await dbIncludingDeleted.agreement.deleteMany({ where: { memberId: memberIdIn } })
    await dbIncludingDeleted.oneOnOne.deleteMany({ where: { memberId: memberIdIn } })
    await dbIncludingDeleted.feedback.deleteMany({ where: { memberId: memberIdIn } })
    await dbIncludingDeleted.note.deleteMany({ where: { memberId: memberIdIn } })
    await dbIncludingDeleted.developmentPlan.deleteMany({ where: { memberId: memberIdIn } })
    await dbIncludingDeleted.mentorshipLink.deleteMany({ where: { id: { in: links.map((l) => l.id) } } })
    await dbIncludingDeleted.memberChange.deleteMany({ where: { memberId: memberIdIn } })
    await dbIncludingDeleted.memberResponsibility.deleteMany({ where: { memberId: memberIdIn } })
    await dbIncludingDeleted.memberCompetency.deleteMany({ where: { memberId: memberIdIn } })
    await dbIncludingDeleted.auditLog.deleteMany({
      where: {
        entityId: {
          in: [
            ...ids,
            ...[...ones, ...feedbacks, ...notes, ...agreements, ...links, ...changes].map((r) => r.id),
            ...plans.flatMap((p) => [p.id, ...p.actions.map((a) => a.id)]),
          ],
        },
      },
    })
    await dbIncludingDeleted.teamMember.deleteMany({ where: { id: memberIdIn } })
  }
  if (competencies.length) {
    await dbIncludingDeleted.auditLog.deleteMany({ where: { entityId: { in: competencies.map((c) => c.id) } } })
    await dbIncludingDeleted.competency.deleteMany({ where: { id: { in: competencies.map((c) => c.id) } } })
  }
}

before(async () => {
  await cleanup()
  const junior = await db.seniority.findFirstOrThrow({ where: { teamId: ownerViewer.teamId, key: "JUNIOR" } })
  const created = await createMemberRecord(ownerViewer, {
    fullName: TEST_NAME,
    preferredName: "Teste Complementos",
    position: "Analista de suporte",
    seniorityId: junior.id,
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

const oneOnOne = (patch: Record<string, unknown> = {}) => ({
  memberId,
  date: display(-3),
  topics: "Plantão de sábado",
  durationMinutes: "30",
  memberPerception: "",
  managerPerception: "Mais seguro",
  wins: "",
  difficulties: "",
  development: "",
  nextReviewAt: "",
  visibility: "PRIVATE",
  agreements: [{ title: "Revisar a escala de plantão", dueDate: display(5) }],
  ...patch,
})

describe("editar e excluir registros", () => {
  test("editar 1:1: a linha da timeline é refeita com data, texto e visibilidade; combinados gerados ficam; auditoria", async () => {
    assert.ok((await createOneOnOneRecord(ownerViewer, oneOnOne())).ok)
    const record = await db.oneOnOne.findFirstOrThrow({ where: { memberId } })
    const generated = await db.agreement.count({ where: { sourceOneOnOneId: record.id } })
    assert.equal(generated, 1)

    const result = await updateOneOnOneRecord(ownerViewer, record.id, oneOnOne({ date: display(-2), topics: "Plantão e escala", visibility: "SHARED", agreements: [] }))
    assert.ok(result.ok)
    const events = await dbIncludingDeleted.timelineEvent.findMany({ where: { oneOnOneId: record.id } })
    assert.equal(events.length, 1)
    assert.equal(events[0]!.title, "Plantão e escala")
    assert.equal(events[0]!.visibility, "SHARED")
    assert.equal(formatDate(events[0]!.occurredAt), display(-2))
    assert.equal(await db.agreement.count({ where: { sourceOneOnOneId: record.id } }), 1, "edição não refaz combinados")
    const audit = await dbIncludingDeleted.auditLog.findFirstOrThrow({ where: { action: "oneOnOne.update", entityId: record.id } })
    assert.deepEqual((audit.after as { changed: string[] }).changed.sort(), ["date", "topics", "visibility"])

    // De volta a privado: o VIEWER deixa de ver a linha.
    assert.ok((await updateOneOnOneRecord(ownerViewer, record.id, oneOnOne({ topics: "Plantão e escala", agreements: [] }))).ok)
    const asViewer = await getMemberTimeline(viewerOnly, memberId)
    assert.ok(!asViewer.some((e) => e.oneOnOneId === record.id))
  })

  test("editar feedback para Reconhecimento troca o tipo da linha; outra pessoa no input é recusada", async () => {
    const base = {
      memberId,
      date: display(-1),
      category: "DEVELOPMENT",
      context: "",
      behavior: "Fechou chamado sem causa",
      impact: "",
      guidance: "",
      followUpAt: "",
      visibility: "PRIVATE",
      agreements: [],
    }
    assert.ok((await createFeedbackRecord(ownerViewer, base)).ok)
    const record = await db.feedback.findFirstOrThrow({ where: { memberId } })
    assert.ok((await updateFeedbackRecord(ownerViewer, record.id, { ...base, category: "RECOGNITION", behavior: "Achou a causa raiz" })).ok)
    const event = await dbIncludingDeleted.timelineEvent.findFirstOrThrow({ where: { feedbackId: record.id } })
    assert.equal(event.type, "RECOGNITION")
    assert.equal(event.title, "Achou a causa raiz")
    assert.equal(event.visibility, "PRIVATE", "a visibilidade escolhida não muda com a categoria")

    const other = await db.teamMember.findFirstOrThrow({ where: { preferredName: "Rafael" } })
    assert.equal((await updateFeedbackRecord(ownerViewer, record.id, { ...base, memberId: other.id })).ok, false)
  })

  test("editar anotação no mesmo dia mantém o instante; excluir tira da timeline e audita; VIEWER não exclui", async () => {
    const base = { memberId, date: display(0), title: "Atraso no plantão", body: "Chegou 40 min depois", visibility: "PRIVATE" }
    assert.ok((await createNoteRecord(ownerViewer, base)).ok)
    const note = await db.note.findFirstOrThrow({ where: { memberId } })
    assert.ok((await updateNoteRecord(ownerViewer, note.id, { ...base, body: "Chegou 40 min depois; avisou antes" })).ok)
    const updated = await db.note.findFirstOrThrow({ where: { id: note.id } })
    assert.equal(updated.occurredAt.getTime(), note.occurredAt.getTime())
    assert.equal((await dbIncludingDeleted.timelineEvent.findFirstOrThrow({ where: { noteId: note.id } })).summary, "Chegou 40 min depois; avisou antes")

    await assert.rejects(deleteRecordRecord(viewerOnly, { kind: "note", id: note.id }), { name: "ForbiddenError" })
    assert.ok((await deleteRecordRecord(ownerViewer, { kind: "note", id: note.id })).ok)
    assert.equal(await db.note.count({ where: { id: note.id } }), 0, "some das leituras")
    assert.ok((await dbIncludingDeleted.note.findFirstOrThrow({ where: { id: note.id } })).deletedAt)
    assert.equal(await dbIncludingDeleted.timelineEvent.count({ where: { noteId: note.id } }), 0)
    assert.ok(await dbIncludingDeleted.auditLog.findFirst({ where: { action: "note.delete", entityId: note.id } }))
  })

  test("excluir 1:1 mantém os combinados gerados nele (e as linhas deles)", async () => {
    const record = await db.oneOnOne.findFirstOrThrow({ where: { memberId } })
    assert.ok((await deleteRecordRecord(ownerViewer, { kind: "oneOnOne", id: record.id })).ok)
    assert.equal(await dbIncludingDeleted.timelineEvent.count({ where: { oneOnOneId: record.id } }), 0)
    const agreement = await db.agreement.findFirstOrThrow({ where: { sourceOneOnOneId: record.id } })
    assert.equal(await dbIncludingDeleted.timelineEvent.count({ where: { agreementId: agreement.id } }), 1)
  })
})

describe("reativar pessoa", () => {
  test("só quem está desativado; volta a ativo com evento de carreira na timeline e auditoria", async () => {
    assert.equal((await reactivateMemberRecord(ownerViewer, { id: memberId, reason: "Voltou" })).ok, false, "ativo não reativa")
    assert.ok((await deactivateMemberRecord(ownerViewer, { id: memberId, reason: "Saiu do time" })).ok)
    await assert.rejects(reactivateMemberRecord(viewerOnly, { id: memberId, reason: "Voltou" }), { name: "ForbiddenError" })
    assert.ok((await reactivateMemberRecord(ownerViewer, { id: memberId, reason: "Voltou ao time" })).ok)
    const member = await db.teamMember.findFirstOrThrow({ where: { id: memberId } })
    assert.equal(member.status, "ACTIVE")
    assert.equal(member.deletedAt, null)
    const change = await db.memberChange.findFirstOrThrow({ where: { memberId, toValue: "ACTIVE" } })
    assert.equal(change.reason, "Voltou ao time")
    assert.equal(await dbIncludingDeleted.timelineEvent.count({ where: { memberChangeId: change.id } }), 1)
    assert.ok(await dbIncludingDeleted.auditLog.findFirst({ where: { action: "member.reactivate", entityId: memberId } }))
  })
})

describe("PDI e mentorias", () => {
  test("editar PDI muda só a linha de criação; acompanhamentos ficam como foram; prazo antes do início é recusado", async () => {
    assert.ok(
      (
        await createPlanRecord(ownerViewer, {
          memberId,
          competencyId: "",
          currentSituation: "Escala sem log",
          objective: "Anexar log",
          expectedEvidence: "",
          startedAt: display(-30),
          dueDate: "",
          status: "ACTIVE",
          actions: [],
        })
      ).ok,
    )
    const plan = await db.developmentPlan.findFirstOrThrow({ where: { memberId } })
    assert.ok((await reviewPlanRecord(ownerViewer, { planId: plan.id, note: "Anexou em 2 de 5" })).ok)

    const edit = { planId: plan.id, competencyId: "", currentSituation: "Escala sem evidência", objective: "Anexar log em todo escalonamento", expectedEvidence: "", dueDate: display(30) }
    assert.ok((await updatePlanRecord(ownerViewer, edit)).ok)
    const rows = await dbIncludingDeleted.timelineEvent.findMany({ where: { developmentPlanId: plan.id }, orderBy: { occurredAt: "asc" } })
    assert.equal(rows.length, 2)
    assert.equal(rows[0]!.title, "Anexar log em todo escalonamento")
    assert.equal(rows[0]!.summary, "Escala sem evidência")
    assert.ok(rows[1]!.title.includes("Anexar log") && !rows[1]!.title.includes("todo escalonamento"), "acompanhamento intacto")

    const early = await updatePlanRecord(ownerViewer, { ...edit, dueDate: display(-40) })
    assert.equal(early.ok, false)
    assert.ok(!early.ok && early.fieldErrors?.dueDate)
  })

  test("acrescentar ação: mentor exigido, não em PDI encerrado", async () => {
    const plan = await db.developmentPlan.findFirstOrThrow({ where: { memberId } })
    const mentor = await db.teamMember.findFirstOrThrow({ where: { preferredName: "Rafael" } })
    const action = { description: "Acompanhar dois plantões", ownerType: "MENTOR", ownerMemberId: "", dueDate: "" }
    assert.equal((await addPlanActionRecord(ownerViewer, { planId: plan.id, action })).ok, false)
    assert.ok((await addPlanActionRecord(ownerViewer, { planId: plan.id, action: { ...action, ownerMemberId: mentor.id } })).ok)
    assert.equal(await db.developmentAction.count({ where: { planId: plan.id, ownerMemberId: mentor.id } }), 1)
    await db.developmentPlan.update({ where: { id: plan.id }, data: { status: "DONE" } })
    assert.equal((await addPlanActionRecord(ownerViewer, { planId: plan.id, action: { ...action, ownerType: "MEMBER" } })).ok, false)
  })

  test("mentoria: registrar, recusar duplicada e a mesma pessoa, encerrar com data", async () => {
    const mentor = await db.teamMember.findFirstOrThrow({ where: { preferredName: "Rafael" } })
    const input = { mentorMemberId: mentor.id, menteeMemberId: memberId, competencyId: "", startedAt: display(-5), note: "" }
    assert.equal((await createMentorshipRecord(ownerViewer, { ...input, mentorMemberId: memberId })).ok, false)
    assert.ok((await createMentorshipRecord(ownerViewer, input)).ok)
    assert.equal((await createMentorshipRecord(ownerViewer, input)).ok, false, "duplicada")
    const link = await db.mentorshipLink.findFirstOrThrow({ where: { menteeMemberId: memberId, endedAt: null } })
    assert.ok((await endMentorshipRecord(ownerViewer, { linkId: link.id })).ok)
    const ended = await db.mentorshipLink.findFirstOrThrow({ where: { id: link.id } })
    assert.equal(ended.endedAt?.getTime(), today.getTime())
    assert.equal((await endMentorshipRecord(ownerViewer, { linkId: link.id })).ok, false, "já encerrada")
    assert.equal(await dbIncludingDeleted.timelineEvent.count({ where: { memberId, title: { contains: "mentor" } } }), 0)
  })
})

describe("catálogo de competências", () => {
  test("criar, nome repetido recusado, sem mover; em uso não se exclui", async () => {
    assert.ok((await saveCatalogItemRecord(ownerViewer, "competency", { label: COMPETENCY, category: "Técnica", description: "" })).ok)
    assert.equal((await saveCatalogItemRecord(ownerViewer, "competency", { label: COMPETENCY.toUpperCase(), category: "", description: "" })).ok, false)
    const item = (await listCompetencies(ownerViewer)).find((c) => c.label === COMPETENCY)
    assert.ok(item)
    assert.equal(item.category, "Técnica")
    assert.equal((await moveCatalogItemRecord(ownerViewer, { kind: "competency", id: item.id, direction: "up" })).ok, false)

    await db.memberCompetency.create({ data: { teamId: ownerViewer.teamId, memberId, competencyId: item.id, currentLevel: 2, assessedAt: today } })
    const refused = await deleteCatalogItemRecord(ownerViewer, { kind: "competency", id: item.id })
    assert.equal(refused.ok, false)
    await db.memberCompetency.deleteMany({ where: { competencyId: item.id } })
    assert.ok((await deleteCatalogItemRecord(ownerViewer, { kind: "competency", id: item.id })).ok)
    assert.ok(await dbIncludingDeleted.auditLog.findFirst({ where: { action: "settings.competency.delete", entityId: item.id } }))
  })
})
