/**
 * C4 — editar observação, transferir combinado entre pessoas e férias com início
 * e fim. Usa o seed (time do Suporte) no banco de TESTE; tudo o que cria é
 * marcado com MARK e apagado no fim.
 */
import assert from "node:assert/strict"
import { after, describe, test } from "node:test"

import { formatDate, todayBusinessDate } from "../src/lib/dates.ts"
import { getAlerts } from "../src/server/alerts.ts"
import { createAgreementRecord, completeAgreementRecord, transferAgreementRecord } from "../src/server/agreements.ts"
import { db, dbIncludingDeleted as d } from "../src/server/db.ts"
import { getDailyForm } from "../src/server/queries/dailies.ts"
import { listTeamMembers } from "../src/server/queries/members.ts"
import { listMemberVacations } from "../src/server/queries/vacations.ts"
import { cancelVacationRecord, createVacationRecord } from "../src/server/vacations.ts"
import { createWatchItemRecord, resolveWatchItemRecord, updateWatchItemRecord } from "../src/server/watch.ts"
import { seedContexts } from "./support/team-context.ts"

const owner = await d.user.findFirstOrThrow({ where: { role: "OWNER" } })
const { manager: ctx, viewer } = await seedContexts(owner)
const MARK = "C4 teste automatizado"
const today = todayBusinessDate()
const display = (offset: number) => {
  const x = new Date(today)
  x.setUTCDate(x.getUTCDate() + offset)
  return formatDate(x, "business")
}
const member = (name: string) => d.teamMember.findFirstOrThrow({ where: { teamId: ctx.teamId, preferredName: name } })

after(async () => {
  const agreements = (await d.agreement.findMany({ where: { title: { startsWith: MARK } }, select: { id: true } })).map((a) => a.id)
  const watches = (await d.watchItem.findMany({ where: { title: { startsWith: MARK } }, select: { id: true } })).map((w) => w.id)
  await d.timelineEvent.deleteMany({ where: { OR: [{ agreementId: { in: agreements } }, { watchItemId: { in: watches } }] } })
  await d.agreementTransfer.deleteMany({ where: { agreementId: { in: agreements } } })
  await d.agreement.deleteMany({ where: { id: { in: agreements } } })
  await d.watchReview.deleteMany({ where: { watchItemId: { in: watches } } })
  await d.watchItem.deleteMany({ where: { id: { in: watches } } })
  await d.memberVacation.deleteMany({ where: { note: MARK } })
  await db.$disconnect()
  await d.$disconnect()
})

describe("transferir combinado", () => {
  test("muda o dono, guarda o histórico, leva a linha de criação e escreve uma linha para cada pessoa; prazo intacto", async () => {
    const [ana, bruno] = [await member("Larissa"), await member("Rafael")]
    assert.ok((await createAgreementRecord(ctx, { memberId: ana.id, title: `${MARK} transferência`, dueDate: display(-2) })).ok)
    const agreement = await d.agreement.findFirstOrThrow({ where: { title: `${MARK} transferência` } })

    await assert.rejects(transferAgreementRecord(viewer, { id: agreement.id, memberId: bruno.id, reason: "férias" }), { name: "ForbiddenError" })
    assert.equal((await transferAgreementRecord(ctx, { id: agreement.id, memberId: ana.id, reason: "férias" })).ok, false, "mesma pessoa")
    assert.equal((await transferAgreementRecord(ctx, { id: agreement.id, memberId: bruno.id, reason: "" })).ok, false, "motivo obrigatório")

    assert.ok((await transferAgreementRecord(ctx, { id: agreement.id, memberId: bruno.id, reason: "Férias de 13/10 a 27/10" })).ok)
    const moved = await d.agreement.findUniqueOrThrow({ where: { id: agreement.id } })
    assert.equal(moved.memberId, bruno.id)
    assert.equal(moved.originalDueDate.getTime(), agreement.originalDueDate.getTime(), "prazo original intacto (D17)")
    assert.equal(moved.dueDate.getTime(), agreement.dueDate.getTime(), "prazo atual não muda fora da daily")

    const transfer = await d.agreementTransfer.findFirstOrThrow({ where: { agreementId: agreement.id } })
    assert.equal(transfer.fromMemberId, ana.id)
    assert.equal(transfer.toMemberId, bruno.id)
    assert.equal(transfer.teamId, ctx.teamId)

    const events = await d.timelineEvent.findMany({ where: { agreementId: agreement.id }, select: { type: true, memberId: true } })
    assert.deepEqual(
      events.map((e) => `${e.type}:${e.memberId}`).sort(),
      [`AGREEMENT:${bruno.id}`, `AGREEMENT_TRANSFER:${ana.id}`, `AGREEMENT_TRANSFER:${bruno.id}`].sort(),
    )
    assert.equal(await d.auditLog.count({ where: { action: "agreement.transfer", entityId: agreement.id } }), 1)

    // Encerrado não se transfere.
    assert.ok((await completeAgreementRecord(ctx, { id: agreement.id, outcome: "" })).ok)
    assert.equal((await transferAgreementRecord(ctx, { id: agreement.id, memberId: ana.id, reason: "volta" })).ok, false)
  })
})

describe("férias", () => {
  test("em curso: sai da daily, não gera alerta de cadência, aparece em /team; sobreposição e fim antes do início recusados; cancelar volta", async () => {
    const person = await member("Henrique")
    await assert.rejects(createVacationRecord(viewer, { memberId: person.id, startDate: display(-1), endDate: display(5) }), { name: "ForbiddenError" })
    assert.equal((await createVacationRecord(ctx, { memberId: person.id, startDate: display(5), endDate: display(1) })).ok, false, "fim antes do início")
    assert.ok((await createVacationRecord(ctx, { memberId: person.id, startDate: display(-1), endDate: display(5), note: MARK })).ok)
    assert.equal((await createVacationRecord(ctx, { memberId: person.id, startDate: display(3), endDate: display(9), note: MARK })).ok, false, "sobreposição")

    const rows = await listTeamMembers(ctx, {})
    const row = rows.find((r) => r.id === person.id)!
    assert.equal(formatDate(row.vacationUntil!, "business"), display(5))
    assert.ok(!(row.attention?.reasons ?? []).some((r) => r.text.includes("1:1")), "sem cobrança de 1:1 de férias")

    const form = await getDailyForm(ctx, today)
    assert.ok(form && !form.members.some((m) => m.id === person.id), "fora da presença da daily")

    const { alerts } = await getAlerts(ctx, { today })
    assert.ok(!alerts.some((a) => a.member?.id === person.id && (a.kind === "lateOneOnOne" || a.id.startsWith("silence:"))), "sem alerta de cadência")

    // No dia seguinte ao fim, volta sozinha (derivado).
    const afterEnd = new Date(today)
    afterEnd.setUTCDate(afterEnd.getUTCDate() + 6)
    const later = await getDailyForm(ctx, afterEnd)
    assert.ok(later?.members.some((m) => m.id === person.id), "volta no dia seguinte ao fim")

    const [current] = await listMemberVacations(ctx, person.id)
    assert.equal(current?.state, "current")
    assert.ok((await cancelVacationRecord(ctx, { id: current!.id })).ok)
    assert.equal(await d.memberVacation.count({ where: { memberId: person.id, note: MARK } }), 0)
    assert.equal(await d.auditLog.count({ where: { action: "member.vacation.cancel", entityId: current!.id } }), 1)
  })
})

describe("editar observação", () => {
  test("título e contexto mudam, a linha de criação da timeline acompanha; resolvida não se edita", async () => {
    const person = await member("Diego")
    const created = await createWatchItemRecord(ctx, { title: `${MARK} observação`, heat: "MEDIUM", origin: "MANUAL", context: "antes", memberId: person.id })
    assert.ok(created.ok)
    const id = created.ok ? created.id : ""

    await assert.rejects(updateWatchItemRecord(viewer, { id, title: "x" }), { name: "ForbiddenError" })
    assert.equal((await updateWatchItemRecord(ctx, { id, title: "" })).ok, false, "título obrigatório")
    assert.ok((await updateWatchItemRecord(ctx, { id, title: `${MARK} observação editada`, context: "depois" })).ok)

    const item = await d.watchItem.findUniqueOrThrow({ where: { id } })
    assert.equal(item.title, `${MARK} observação editada`)
    assert.equal(item.context, "depois")
    const row = await d.timelineEvent.findFirstOrThrow({ where: { watchItemId: id, type: "WATCH" } })
    assert.ok(row.title.includes("observação editada"), row.title)
    assert.equal(row.summary, "depois")
    assert.equal(await d.auditLog.count({ where: { action: "watch.update", entityId: id } }), 1)

    assert.ok((await resolveWatchItemRecord(ctx, { id, note: "Resolvido no teste" })).ok)
    assert.equal((await updateWatchItemRecord(ctx, { id, title: "outra" })).ok, false)
  })
})
