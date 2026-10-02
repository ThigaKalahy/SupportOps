/**
 * P9 — combinados. Abas (partição e contagem), ordem por urgência, filtros,
 * escala de prazo, conclusão (status, completedAt, AGREEMENT_DONE, auditoria,
 * D17) e o histórico de revisões no detalhe.
 *
 * Usa os dados do seed (rode `pnpm db:seed` antes). As escritas usam uma
 * pessoa de teste própria, apagada ao final.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { db, dbIncludingDeleted } from "../src/server/db.ts"
import { formatDate, todayBusinessDate } from "../src/lib/dates.ts"
import { deadlineSeverity } from "../src/lib/severity.ts"
import { parseAgreementFilters, type AgreementFilters } from "../src/lib/agreement-filters.ts"
import { getAgreementDetail, listAgreements } from "../src/server/queries/agreements.ts"
import { createMemberRecord } from "../src/server/members.ts"
import {
  cancelAgreementRecord,
  completeAgreementRecord,
  createAgreementRecord,
  updateAgreementRecord,
} from "../src/server/agreements.ts"

const TEST_NAME = "Pessoa de Teste dos Combinados"
const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const ownerViewer = { id: owner.id, role: owner.role, organizationId: owner.organizationId }
const viewerOnly = { id: "teste-viewer", role: "VIEWER" as const, organizationId: owner.organizationId }
const base: AgreementFilters = parseAgreementFilters({})
const today = todayBusinessDate()
const display = (offset: number) => {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + offset)
  return formatDate(d, "business")
}

async function cleanup() {
  const members = await dbIncludingDeleted.teamMember.findMany({ where: { fullName: TEST_NAME }, select: { id: true } })
  const ids = members.map((m) => m.id)
  if (ids.length === 0) return
  const agreements = await dbIncludingDeleted.agreement.findMany({ where: { memberId: { in: ids } }, select: { id: true } })
  await dbIncludingDeleted.timelineEvent.deleteMany({ where: { memberId: { in: ids } } })
  await dbIncludingDeleted.agreement.deleteMany({ where: { memberId: { in: ids } } })
  await dbIncludingDeleted.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...agreements.map((a) => a.id)] } } })
  await dbIncludingDeleted.teamMember.deleteMany({ where: { id: { in: ids } } })
}

after(async () => {
  await cleanup()
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

describe("escala de prazo (src/lib/severity.ts)", () => {
  const at = (days: number) => {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() + days)
    return deadlineSeverity(d, { today })
  }
  test("em dia, ≤ 3 dias, vencido ≤ 7, vencido > 7, vencido > 30", () => {
    assert.equal(at(4).severity, "neutral")
    assert.equal(at(3).severity, "attention")
    assert.equal(at(0).severity, "attention")
    assert.deepEqual([at(-7).severity, at(-7).strong], ["attention", true])
    assert.deepEqual([at(-8).severity, at(-8).strong], ["overdue", false])
    assert.equal(at(-30).label, "Vencido há 30 dias")
    assert.equal(at(-31).label, "Provavelmente esquecido")
  })
})

describe("central de combinados", () => {
  test("abas repartem os combinados e cada contagem bate com a lista", async () => {
    const { counts } = await listAgreements(ownerViewer, base)
    for (const view of ["overdue", "due-soon", "open", "done", "all"] as const) {
      const { rows } = await listAgreements(ownerViewer, { ...base, view })
      assert.equal(rows.length, counts[view], view)
    }
    assert.equal(counts.all, await db.agreement.count())
    assert.equal(counts.open, await db.agreement.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }))
    assert.equal(counts.done, await db.agreement.count({ where: { status: "DONE" } }))
    assert.equal(counts.overdue, await db.agreement.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: today } } }))
    assert.ok(counts.overdue >= 2, "o seed tem vencidos (Priscila)")
  })

  test("ordem: vencidos primeiro, depois vencendo, depois por prazo; encerrados por último", async () => {
    const { rows } = await listAgreements(ownerViewer, { ...base, view: "all" })
    const firstClosed = rows.findIndex((r) => !r.open)
    assert.ok(firstClosed > 0)
    assert.ok(rows.slice(firstClosed).every((r) => !r.open))
    const open = rows.slice(0, firstClosed)
    for (let i = 1; i < open.length; i++) assert.ok(open[i - 1]!.dueDate <= open[i]!.dueDate)
    assert.ok((open[0]!.deadline.daysUntilDue ?? 0) < 0, "o primeiro é um vencido")
  })

  test("filtros: pessoa, senioridade, origem, prioridade e período", async () => {
    const diego = await db.teamMember.findFirstOrThrow({ where: { preferredName: "Diego" } })
    const byMember = await listAgreements(ownerViewer, { ...base, view: "all", memberId: diego.id })
    assert.ok(byMember.rows.length > 0 && byMember.rows.every((r) => r.member.id === diego.id))
    assert.ok(byMember.rows.some((r) => r.reschedules >= 4), "arrasto do Diego aparece")

    const juniors = await listAgreements(ownerViewer, { ...base, view: "all", seniority: "JUNIOR" })
    const juniorIds = new Set(
      (await db.teamMember.findMany({ where: { seniority: { key: "JUNIOR" } }, select: { id: true } })).map((m) => m.id),
    )
    assert.ok(juniors.rows.every((r) => juniorIds.has(r.member.id)))

    const daily = await listAgreements(ownerViewer, { ...base, view: "all", origin: "DAILY" })
    assert.ok(daily.rows.length > 0 && daily.rows.every((r) => r.origin === "DAILY"))

    const recent = await listAgreements(ownerViewer, { ...base, view: "all", created: "30d" })
    const limit = new Date()
    limit.setUTCDate(limit.getUTCDate() - 30)
    assert.ok(recent.rows.every((r) => r.createdAt >= limit))
    assert.ok(recent.rows.length < (await db.agreement.count()))
  })

  test("VIEWER vê os combinados (não são registro privado)", async () => {
    const asViewer = await listAgreements(viewerOnly, { ...base, view: "all" })
    assert.equal(asViewer.rows.length, await db.agreement.count())
  })

  test("filtros inválidos na URL são ignorados; padrão é Em aberto", () => {
    const parsed = parseAgreementFilters({ view: "x", origin: "nada", priority: "HIGH", created: "2anos", member: "a b" })
    assert.deepEqual(parsed, { view: "open", memberId: null, seniority: null, origin: null, priority: "HIGH", created: "all" })
  })
})

describe("detalhe", () => {
  test("histórico de revisões em ordem cronológica, com impeditivo e novo prazo (Diego)", async () => {
    const dragged = await db.agreement.findFirstOrThrow({
      where: { member: { preferredName: "Diego" }, checkins: { some: { newDueDate: { not: null } } } },
      orderBy: { checkins: { _count: "desc" } },
    })
    const detail = await getAgreementDetail(ownerViewer, dragged.id)
    assert.ok(detail)
    assert.ok(detail.reschedules >= 4)
    const dates = detail.checkins.map((c) => c.dailyDate.getTime())
    assert.deepEqual(dates, [...dates].sort((a, b) => a - b))
    const rescheduled = detail.checkins.filter((c) => c.newDueDate)
    assert.ok(rescheduled.every((c) => c.blockerText && c.blockerReason?.category === "EXTERNAL"))
    assert.ok(detail.slipDays > 0)
    assert.equal(detail.originalDueDate.getTime(), dragged.originalDueDate.getTime())
  })

  test("outra organização não abre", async () => {
    const any = await db.agreement.findFirstOrThrow()
    assert.equal(await getAgreementDetail({ ...ownerViewer, organizationId: "outra" }, any.id), null)
  })
})

describe("conclusão", () => {
  let memberId = ""
  let agreementId = ""

  before(async () => {
    await cleanup()
    const seniority = await db.seniority.findFirstOrThrow({ where: { key: "JUNIOR" } })
    assert.ok(
      (
        await createMemberRecord(ownerViewer, {
          fullName: TEST_NAME,
          preferredName: "Teste Combinados",
          position: "Analista de suporte",
          seniorityId: seniority.id,
          joinedAt: display(-10),
          status: "ACTIVE",
          email: "",
          responsibilityIds: [],
          competencies: [],
        })
      ).ok,
    )
    memberId = (await db.teamMember.findFirstOrThrow({ where: { fullName: TEST_NAME } })).id
    const created = await createAgreementRecord(ownerViewer, {
      memberId,
      title: "Publicar a macro de reembolso",
      dueDate: display(3),
      description: "",
      priority: "HIGH",
      origin: "MANAGER",
    })
    assert.ok(created.ok)
    agreementId = (await db.agreement.findFirstOrThrow({ where: { memberId } })).id
  })

  test("criar sem responsável é recusado com erro no campo", async () => {
    const result = await createAgreementRecord(ownerViewer, {
      memberId: "",
      title: "Sem dono",
      dueDate: display(2),
      description: "",
      priority: "NORMAL",
      origin: "MANAGER",
    })
    assert.ok(!result.ok && result.fieldErrors?.memberId)
  })

  test("VIEWER não conclui", async () => {
    const result = await completeAgreementRecord(viewerOnly, { id: agreementId, outcome: "" })
    assert.ok(!result.ok)
  })

  test("concluir grava DONE, completedAt de hoje, resultado, AGREEMENT_DONE e auditoria; prazo original intacto", async () => {
    const before = await db.agreement.findUniqueOrThrow({ where: { id: agreementId } })
    const result = await completeAgreementRecord(ownerViewer, { id: agreementId, outcome: " Macro publicada na base " })
    assert.ok(result.ok)
    const after = await db.agreement.findUniqueOrThrow({ where: { id: agreementId } })
    assert.equal(after.status, "DONE")
    assert.equal(after.completedAt?.getTime(), today.getTime())
    assert.equal(after.outcome, "Macro publicada na base")
    assert.equal(after.originalDueDate.getTime(), before.originalDueDate.getTime())
    const done = await db.timelineEvent.findMany({ where: { agreementId, type: "AGREEMENT_DONE" } })
    assert.equal(done.length, 1)
    assert.equal(done[0]?.summary, "Macro publicada na base")
    assert.equal(formatDate(done[0]!.occurredAt), display(0))
    assert.equal(await db.auditLog.count({ where: { action: "agreement.complete", entityId: agreementId } }), 1)
  })

  test("concluir de novo é recusado e não duplica a linha da timeline", async () => {
    const again = await completeAgreementRecord(ownerViewer, { id: agreementId, outcome: "" })
    assert.ok(!again.ok && again.error === "Este combinado já está encerrado.")
    assert.equal(await db.timelineEvent.count({ where: { agreementId, type: "AGREEMENT_DONE" } }), 1)
  })

  test("resultado é opcional", async () => {
    assert.ok(
      (
        await createAgreementRecord(ownerViewer, {
          memberId,
          title: "Revisar a base de VPN",
          dueDate: display(5),
          description: "",
          priority: "NORMAL",
          origin: "MANAGER",
        })
      ).ok,
    )
    const second = await db.agreement.findFirstOrThrow({ where: { memberId, status: "OPEN" } })
    assert.ok((await completeAgreementRecord(ownerViewer, { id: second.id, outcome: "" })).ok)
    assert.equal((await db.agreement.findUniqueOrThrow({ where: { id: second.id } })).outcome, null)
  })
})

describe("editar e cancelar fora da daily", () => {
  let memberId = ""
  let agreementId = ""

  before(async () => {
    memberId = (await db.teamMember.findFirstOrThrow({ where: { fullName: TEST_NAME } })).id
    assert.ok(
      (
        await createAgreementRecord(ownerViewer, {
          memberId,
          title: "Revisar o roteiro de atendimento N1",
          dueDate: display(4),
          description: "Primeira versão",
          priority: "NORMAL",
          origin: "MANAGER",
        })
      ).ok,
    )
    agreementId = (await db.agreement.findFirstOrThrow({ where: { memberId, title: "Revisar o roteiro de atendimento N1" } })).id
  })

  test("editar muda título, detalhes e prioridade, e a linha da timeline acompanha; prazo não muda", async () => {
    const before = await db.agreement.findUniqueOrThrow({ where: { id: agreementId } })
    const result = await updateAgreementRecord(ownerViewer, {
      id: agreementId,
      title: "Revisar o roteiro de atendimento N1 e N2",
      description: "Incluir o N2",
      priority: "HIGH",
      dueDate: display(30),
    })
    assert.ok(result.ok)
    const after = await db.agreement.findUniqueOrThrow({ where: { id: agreementId } })
    assert.equal(after.title, "Revisar o roteiro de atendimento N1 e N2")
    assert.equal(after.description, "Incluir o N2")
    assert.equal(after.priority, "HIGH")
    assert.equal(after.dueDate.getTime(), before.dueDate.getTime(), "o prazo só se move na daily")
    const line = await db.timelineEvent.findFirstOrThrow({ where: { agreementId, type: "AGREEMENT" } })
    assert.equal(line.title, "Revisar o roteiro de atendimento N1 e N2")
    assert.equal(line.summary, "Incluir o N2")
    assert.equal(await db.auditLog.count({ where: { action: "agreement.update", entityId: agreementId } }), 1)
  })

  test("cancelar exige motivo, grava CANCELLED com o motivo e sai da aba em aberto", async () => {
    const empty = await cancelAgreementRecord(ownerViewer, { id: agreementId, reason: " " })
    assert.ok(!empty.ok && empty.fieldErrors?.reason)
    assert.ok((await cancelAgreementRecord(ownerViewer, { id: agreementId, reason: "O cliente desistiu" })).ok)
    const after = await db.agreement.findUniqueOrThrow({ where: { id: agreementId } })
    assert.equal(after.status, "CANCELLED")
    assert.equal(after.outcome, "O cliente desistiu")
    const { rows } = await listAgreements(ownerViewer, { ...base, view: "open" })
    assert.ok(!rows.some((r) => r.id === agreementId))
    assert.equal(await db.auditLog.count({ where: { action: "agreement.cancel", entityId: agreementId } }), 1)
    const again = await cancelAgreementRecord(ownerViewer, { id: agreementId, reason: "De novo" })
    assert.ok(!again.ok && again.error === "Este combinado já está encerrado.")
  })

  test("VIEWER não edita nem cancela", async () => {
    assert.ok(!(await updateAgreementRecord(viewerOnly, { id: agreementId, title: "Invadido", description: "", priority: "LOW" })).ok)
    assert.ok(!(await cancelAgreementRecord(viewerOnly, { id: agreementId, reason: "Invadido" })).ok)
  })
})
