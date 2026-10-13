/**
 * C7 — cliente (central) na observação e vários combinados por observação.
 * Usa o seed (Suporte, com o módulo de centrais) no banco de TESTE; tudo o que
 * cria é marcado com MARK e apagado no fim.
 */
import assert from "node:assert/strict"
import { after, describe, test } from "node:test"

import { formatDate, todayBusinessDate } from "../src/lib/dates.ts"
import { createAgreementRecord } from "../src/server/agreements.ts"
import { db, dbIncludingDeleted as d } from "../src/server/db.ts"
import { getWatchItem, listWatchItems } from "../src/server/queries/watch.ts"
import { getThresholds } from "../src/server/queries/thresholds.ts"
import { createWatchItemRecord, resolveWatchItemRecord, updateWatchItemRecord } from "../src/server/watch.ts"
import { parseWatchFilters } from "../src/lib/watch-filters.ts"
import { seedContexts } from "./support/team-context.ts"

const owner = await d.user.findFirstOrThrow({ where: { role: "OWNER" } })
const { manager: ctx } = await seedContexts(owner)
const MARK = "C7 teste automatizado"
const due = formatDate(todayBusinessDate(), "business")
const base = { priority: "NORMAL", origin: "MANAGER", dueDate: due }

after(async () => {
  const agreements = (await d.agreement.findMany({ where: { title: { startsWith: MARK } }, select: { id: true } })).map((a) => a.id)
  const watches = (await d.watchItem.findMany({ where: { title: { startsWith: MARK } }, select: { id: true } })).map((w) => w.id)
  await d.timelineEvent.deleteMany({ where: { OR: [{ agreementId: { in: agreements } }, { watchItemId: { in: watches } }] } })
  await d.agreement.deleteMany({ where: { id: { in: agreements } } })
  await d.watchReview.deleteMany({ where: { watchItemId: { in: watches } } })
  await d.watchItem.deleteMany({ where: { id: { in: watches } } })
  await db.$disconnect()
  await d.$disconnect()
})

describe("observação com cliente e vários combinados", () => {
  test("cinco combinados de pessoas diferentes na mesma observação; contagem e lista no painel; resolvida não aceita novo", async () => {
    const central = await d.central.findFirstOrThrow({ where: { teamId: ctx.teamId, isActive: true } })
    const people = await d.teamMember.findMany({ where: { teamId: ctx.teamId, status: "ACTIVE" }, take: 5, select: { id: true } })
    const created = await createWatchItemRecord(ctx, { title: `${MARK} NPS detrator`, heat: "HIGH", origin: "MANUAL", context: "", centralId: central.id })
    assert.ok(created.ok)
    const watchId = created.ok ? created.id : ""
    assert.equal((await d.watchItem.findUniqueOrThrow({ where: { id: watchId } })).centralId, central.id)

    for (const [i, p] of people.entries()) {
      assert.ok((await createAgreementRecord(ctx, { ...base, memberId: p.id, title: `${MARK} item ${i + 1}`, watchItemId: watchId })).ok)
    }
    const t = await getThresholds(ctx)
    const detail = (await getWatchItem(ctx, watchId, t))!
    assert.equal(detail.agreements.length, people.length)
    assert.equal(detail.agreementCount, people.length)
    assert.equal(detail.openAgreementCount, people.length)
    assert.equal(new Set(detail.agreements.map((a) => a.member)).size, people.length, "pessoas diferentes")

    // Filtro por cliente em /watch encontra a observação.
    const list = await listWatchItems(ctx, parseWatchFilters({ central: central.id }), t)
    assert.ok(list.rows.some((r) => r.id === watchId))

    // Editar: tirar e devolver o cliente.
    assert.ok((await updateWatchItemRecord(ctx, { id: watchId, title: `${MARK} NPS detrator`, centralId: "" })).ok)
    assert.equal((await d.watchItem.findUniqueOrThrow({ where: { id: watchId } })).centralId, null)
    assert.ok((await updateWatchItemRecord(ctx, { id: watchId, title: `${MARK} NPS detrator`, centralId: central.id })).ok)
    // Sem o campo, o cliente não muda.
    assert.ok((await updateWatchItemRecord(ctx, { id: watchId, title: `${MARK} NPS detrator (editado)` })).ok)
    assert.equal((await d.watchItem.findUniqueOrThrow({ where: { id: watchId } })).centralId, central.id)

    assert.ok((await resolveWatchItemRecord(ctx, { id: watchId, note: "Plano do NPS concluído" })).ok)
    const late = await createAgreementRecord(ctx, { ...base, memberId: people[0]!.id, title: `${MARK} tarde`, watchItemId: watchId })
    assert.equal(late.ok, false, "observação resolvida não recebe combinado novo")
  })

  test("observação criada no combinado (pendente) herda a central dele ao salvar", async () => {
    const central = await d.central.findFirstOrThrow({ where: { teamId: ctx.teamId, isActive: true } })
    const person = await d.teamMember.findFirstOrThrow({ where: { teamId: ctx.teamId, status: "ACTIVE" } })
    const pending = await createWatchItemRecord(ctx, { title: `${MARK} pendente`, heat: "MEDIUM", origin: "AGREEMENT", context: "", memberId: person.id })
    assert.ok(pending.ok)
    const id = pending.ok ? pending.id : ""
    assert.ok((await createAgreementRecord(ctx, { ...base, memberId: person.id, title: `${MARK} com central`, centralId: central.id, watchIds: [id] })).ok)
    const item = await d.watchItem.findUniqueOrThrow({ where: { id } })
    assert.equal(item.centralId, central.id)
    assert.ok(item.agreementId)
  })
})
