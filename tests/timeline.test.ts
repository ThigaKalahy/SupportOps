/**
 * P8 — timeline. Paginação por cursor (40, sem repetir nem perder), filtros
 * da URL, regra do VIEWER em todas as páginas, marcadores que sangram (só
 * pendência real) e alternância de visibilidade que muda origem e espelho na
 * mesma transação.
 *
 * Usa os dados do seed (rode `pnpm db:seed` antes). A alternância usa uma
 * pessoa de teste própria, apagada ao final.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { db, dbIncludingDeleted } from "../src/server/db.ts"
import { formatDate, todayBusinessDate } from "../src/lib/dates.ts"
import { parseTimelineFilters, periodStart, type TimelineFilters } from "../src/lib/timeline-filters.ts"
import { getTimelinePage, TIMELINE_PAGE, type TimelineItem } from "../src/server/queries/timeline.ts"
import { createMemberRecord } from "../src/server/members.ts"
import { createNoteRecord, setRecordVisibilityRecord } from "../src/server/records.ts"
import { createAgreementRecord } from "../src/server/agreements.ts"
import { seedContexts } from "./support/team-context.ts"

const TEST_NAME = "Pessoa de Teste da Timeline"
const ALL: TimelineFilters = { types: [], period: "all", q: "" }

const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const { manager: ownerViewer, viewer: viewerOnly } = await seedContexts(owner)

async function cleanup() {
  const members = await dbIncludingDeleted.teamMember.findMany({ where: { fullName: TEST_NAME }, select: { id: true } })
  const ids = members.map((m) => m.id)
  if (ids.length === 0) return
  const memberId = { in: ids }
  const notes = await dbIncludingDeleted.note.findMany({ where: { memberId }, select: { id: true } })
  const agreements = await dbIncludingDeleted.agreement.findMany({ where: { memberId }, select: { id: true } })
  await dbIncludingDeleted.timelineEvent.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.note.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.agreement.deleteMany({ where: { memberId } })
  await dbIncludingDeleted.auditLog.deleteMany({
    where: { entityId: { in: [...ids, ...notes.map((n) => n.id), ...agreements.map((a) => a.id)] } },
  })
  await dbIncludingDeleted.teamMember.deleteMany({ where: { id: { in: ids } } })
}

async function memberId(name: string) {
  return (await db.teamMember.findFirstOrThrow({ where: { preferredName: name } })).id
}

/** Todas as páginas, seguindo o cursor. */
async function allPages(viewer: typeof ownerViewer, id: string, filters: TimelineFilters = ALL) {
  const items: TimelineItem[] = []
  const sizes: number[] = []
  let cursor: string | null = null
  do {
    const page = await getTimelinePage(viewer, id, filters, cursor)
    items.push(...page.items)
    sizes.push(page.items.length)
    cursor = page.nextCursor
  } while (cursor)
  return { items, sizes }
}

after(async () => {
  await cleanup()
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

describe("filtros da URL", () => {
  test("valores inválidos são ignorados; padrão é tudo", () => {
    assert.deepEqual(parseTimelineFilters({}), ALL)
    const parsed = parseTimelineFilters(new URLSearchParams("types=ONE_ON_ONE,XYZ,ONE_ON_ONE&period=2anos&q=%20vpn%20"))
    assert.deepEqual(parsed, { types: ["ONE_ON_ONE"], period: "all", q: "vpn" })
  })
})

describe("paginação por cursor", () => {
  test("40 por vez, do mais recente ao mais antigo, sem repetir nem perder", async () => {
    const id = await memberId("Henrique")
    const { items, sizes } = await allPages(ownerViewer, id)
    const total = await db.timelineEvent.count({ where: { memberId: id } })
    assert.ok(total > TIMELINE_PAGE, "o Henrique tem mais de uma página")
    assert.equal(items.length, total)
    assert.equal(new Set(items.map((i) => i.id)).size, total)
    assert.ok(sizes.slice(0, -1).every((s) => s === TIMELINE_PAGE))
    for (let i = 1; i < items.length; i++) {
      assert.ok(items[i - 1]!.occurredAt >= items[i]!.occurredAt)
    }
  })

  test("VIEWER: nenhuma página traz registro privado, de ninguém", async () => {
    const people = await db.teamMember.findMany({ select: { id: true } })
    for (const person of people) {
      const { items } = await allPages(viewerOnly, person.id)
      assert.ok(items.every((i) => i.visibility === "SHARED"))
      const shared = await db.timelineEvent.count({ where: { memberId: person.id, visibility: "SHARED" } })
      assert.equal(items.length, shared)
    }
  })
})

describe("filtros", () => {
  test("tipo, período e busca restringem o resultado", async () => {
    const id = await memberId("Diego")
    const types = await allPages(ownerViewer, id, { ...ALL, types: ["ONE_ON_ONE", "FEEDBACK"] })
    assert.ok(types.items.length > 0)
    assert.ok(types.items.every((i) => i.type === "ONE_ON_ONE" || i.type === "FEEDBACK"))

    const recent = await allPages(ownerViewer, id, { ...ALL, period: "30d" })
    const start = periodStart("30d")!
    assert.ok(recent.items.every((i) => i.occurredAt >= start))
    assert.ok(recent.items.length < (await db.timelineEvent.count({ where: { memberId: id } })))

    const found = await allPages(ownerViewer, id, { ...ALL, q: "erp" })
    assert.ok(found.items.length > 0)
    assert.ok(found.items.every((i) => `${i.title} ${i.summary ?? ""}`.toLowerCase().includes("erp")))
  })
})

describe("marcadores e vínculos", () => {
  test("combinado aberto e vencido sangra em vermelho; concluído não perturba a calha", async () => {
    const { items } = await allPages(ownerViewer, await memberId("Priscila"))
    const overdue = items.filter(
      (i) => i.type === "AGREEMENT" && i.agreements?.items[0]?.status === "OPEN" && i.agreements.items[0].dueDate < todayBusinessDate(),
    )
    assert.ok(overdue.length >= 2)
    assert.ok(overdue.every((i) => i.marker.bleed && i.marker.severity !== "neutral"))
    assert.ok(overdue.some((i) => i.marker.severity === "overdue"))
    const done = items.filter((i) => i.type === "AGREEMENT_DONE")
    assert.ok(done.length > 0 && done.every((i) => !i.marker.bleed))
  })

  test("PDI parado sangra em atenção forte (Henrique)", async () => {
    const { items } = await allPages(ownerViewer, await memberId("Henrique"))
    const plan = items.find((i) => i.type === "DEVELOPMENT" && i.marker.bleed)
    assert.ok(plan, "o PDI do Henrique está sem acompanhamento há mais de 45 dias")
    assert.equal(plan.marker.severity, "attention")
    assert.equal(plan.marker.strong, true)
    assert.match(plan.marker.note ?? "", /^PDI sem acompanhamento há \d+ dias$/)
  })

  test("registro que gerou combinados mostra cada um com o status atual", async () => {
    const people = await db.teamMember.findMany({ select: { id: true } })
    let sourced = 0
    for (const person of people) {
      const { items } = await allPages(ownerViewer, person.id)
      for (const item of items.filter((i) => i.agreements?.kind === "sourced")) {
        sourced++
        for (const linked of item.agreements!.items) {
          const real = await db.agreement.findUniqueOrThrow({ where: { id: linked.id } })
          assert.equal(linked.status, real.status)
        }
      }
      assert.ok(items.filter((i) => i.type === "AGREEMENT").every((i) => i.agreements?.kind === "self"))
    }
    assert.ok(sourced > 0, "o seed tem combinados nascidos em daily e 1:1")
  })

  test("só sangra o que tem pendência", async () => {
    const people = await db.teamMember.findMany({ select: { id: true } })
    for (const person of people) {
      const { items } = await allPages(ownerViewer, person.id)
      for (const item of items.filter((i) => i.marker.bleed)) {
        assert.ok(["AGREEMENT", "ONE_ON_ONE", "DEVELOPMENT"].includes(item.type), `${item.type} não deveria sangrar`)
      }
    }
  })
})

describe("alternar privado/compartilhado", () => {
  let member = ""
  const display = (offset: number) => {
    const d = todayBusinessDate()
    d.setUTCDate(d.getUTCDate() + offset)
    return formatDate(d, "business")
  }

  before(async () => {
    await cleanup()
    const seniority = await db.seniority.findFirstOrThrow({ where: { key: "JUNIOR" } })
    const created = await createMemberRecord(ownerViewer, {
      fullName: TEST_NAME,
      preferredName: "Teste Timeline",
      position: "Analista de suporte",
      seniorityId: seniority.id,
      joinedAt: display(-10),
      status: "ACTIVE",
      email: "",
      responsibilityIds: [],
      competencies: [],
    })
    assert.ok(created.ok)
    member = (await db.teamMember.findFirstOrThrow({ where: { fullName: TEST_NAME } })).id
    assert.ok(
      (
        await createNoteRecord(ownerViewer, {
          memberId: member,
          date: display(0),
          title: "Conversa sobre escala",
          body: "Pediu para não ficar no plantão de dezembro.",
          visibility: "PRIVATE",
        })
      ).ok,
    )
    assert.ok(
      (
        await createAgreementRecord(ownerViewer, {
          memberId: member,
          title: "Revisar a base de VPN",
          dueDate: display(5),
          description: "",
          priority: "NORMAL",
          origin: "MANAGER",
        })
      ).ok,
    )
  })

  test("compartilhar muda a anotação e a linha da timeline juntas, com auditoria", async () => {
    const { items } = await getTimelinePage(ownerViewer, member, ALL)
    const note = items.find((i) => i.type === "NOTE")!
    assert.equal(note.toggleable, true)
    assert.equal((await getTimelinePage(viewerOnly, member, ALL)).items.some((i) => i.id === note.id), false)

    assert.ok((await setRecordVisibilityRecord(ownerViewer, { eventId: note.id, visibility: "SHARED" })).ok)
    const source = await db.note.findFirstOrThrow({ where: { memberId: member } })
    const mirror = await db.timelineEvent.findUniqueOrThrow({ where: { id: note.id } })
    assert.equal(source.visibility, "SHARED")
    assert.equal(mirror.visibility, "SHARED")
    assert.ok((await getTimelinePage(viewerOnly, member, ALL)).items.some((i) => i.id === note.id))

    assert.ok((await setRecordVisibilityRecord(ownerViewer, { eventId: note.id, visibility: "PRIVATE" })).ok)
    assert.equal((await db.note.findUniqueOrThrow({ where: { id: source.id } })).visibility, "PRIVATE")
    assert.equal((await db.timelineEvent.findUniqueOrThrow({ where: { id: note.id } })).visibility, "PRIVATE")
    const audits = await db.auditLog.findMany({ where: { action: "record.visibility.update", entityId: source.id }, orderBy: { at: "asc" } })
    assert.deepEqual(
      audits.map((a) => [a.before, a.after]),
      [
        [{ visibility: "PRIVATE" }, { visibility: "SHARED" }],
        [{ visibility: "SHARED" }, { visibility: "PRIVATE" }],
      ],
    )
  })

  test("VIEWER não alterna; combinado não tem visibilidade própria", async () => {
    const { items } = await getTimelinePage(ownerViewer, member, ALL)
    const note = items.find((i) => i.type === "NOTE")!
    const agreement = items.find((i) => i.type === "AGREEMENT")!
    assert.equal(agreement.toggleable, false)
    await assert.rejects(setRecordVisibilityRecord(viewerOnly, { eventId: note.id, visibility: "SHARED" }), { name: "ForbiddenError" })
    const onAgreement = await setRecordVisibilityRecord(ownerViewer, { eventId: agreement.id, visibility: "PRIVATE" })
    assert.ok(!onAgreement.ok)
    assert.equal((await db.timelineEvent.findUniqueOrThrow({ where: { id: agreement.id } })).visibility, "SHARED")
  })
})
