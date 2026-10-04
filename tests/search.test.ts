/**
 * P16 — busca global. Regras puras (consulta sem operador do usuário, sem
 * acento, por prefixo; trecho e destaque), índices GIN nas colunas geradas,
 * o critério de aceite (termo do corpo de um feedback de ~4 meses atrás em
 * menos de 300 ms), a regra do VIEWER (nunca encontra PRIVATE, nem na
 * contagem) e registro novo encontrável na hora.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { after, before, describe, test } from "node:test"

import { formatDate, todayBusinessDate } from "../src/lib/dates.ts"
import { highlight, normalize, parseSearchFilters, toTsQuery } from "../src/lib/search.ts"
import { db, dbIncludingDeleted } from "../src/server/db.ts"
import { searchAll } from "../src/server/queries/search.ts"
import { createNoteRecord } from "../src/server/records.ts"

const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const ownerViewer = { id: owner.id, role: owner.role, organizationId: owner.organizationId }
const viewerOnly = { id: "teste-viewer", role: "VIEWER" as const, organizationId: owner.organizationId }
const stranger = { id: "x", role: "OWNER" as const, organizationId: "outra-organizacao" }
const NOTE_TITLE = "Teste da busca: xilofone ornitorrinco"

async function cleanup() {
  const notes = await dbIncludingDeleted.note.findMany({ where: { title: NOTE_TITLE }, select: { id: true } })
  const ids = notes.map((n) => n.id)
  await dbIncludingDeleted.timelineEvent.deleteMany({ where: { noteId: { in: ids } } })
  await dbIncludingDeleted.auditLog.deleteMany({ where: { entityId: { in: ids } } })
  await dbIncludingDeleted.note.deleteMany({ where: { id: { in: ids } } })
}

before(cleanup)
after(async () => {
  await cleanup()
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

/** Palavra longa e pouco comum de um texto (para buscar um registro específico). */
function distinctiveWord(text: string): string {
  const words = (text.match(/[\p{L}]{7,}/gu) ?? []).sort((a, b) => b.length - a.length)
  return words[0] ?? ""
}

describe("regras puras (src/lib/search.ts)", () => {
  test("a consulta só leva letras e números, sem acento, como prefixo; curta demais não busca", () => {
    assert.equal(toTsQuery("Relatório  do cliente!"), "relatorio:* & do:* & cliente:*")
    assert.equal(toTsQuery("a | b & !c ' ) :*"), "a:* & b:* & c:*")
    assert.equal(toTsQuery("x"), null)
    assert.equal(toTsQuery("   "), null)
    assert.equal(normalize("AÇÃO Ênfase"), "acao enfase")
  })

  test("destaque: sem acento casa com acentuado, plural casa com singular; corte com reticências", () => {
    const parts = highlight("Mandou o relatório de julho ao cliente Atlas; os relatórios seguintes saíram certos.", "relatorios atlas")
    const marked = parts.filter((p) => p.match).map((p) => p.text)
    assert.deepEqual(marked, ["relatório", "Atlas", "relatórios"])
    assert.equal(parts.map((p) => p.text).join(""), "Mandou o relatório de julho ao cliente Atlas; os relatórios seguintes saíram certos.")
    const long = `${"palavra ".repeat(60)}encontrada ${"fim ".repeat(60)}`
    const cut = highlight(long, "encontrada", 80)
    assert.equal(cut[0]!.text, "…")
    assert.equal(cut.at(-1)!.text, "…")
    assert.ok(cut.some((p) => p.match && p.text === "encontrada"))
  })

  test("filtros da URL: tipo e período válidos, o resto cai no padrão", () => {
    assert.deepEqual(parseSearchFilters({ q: " atlas ", type: "feedback", period: "3m" }), { q: "atlas", type: "feedback", period: "3m" })
    assert.deepEqual(parseSearchFilters({ q: "x", type: "nada", period: "ontem" }), { q: "x", type: null, period: "all" })
  })
})

describe("banco", () => {
  test("colunas tsvector geradas com índice GIN nas cinco tabelas; a busca usa o índice", async () => {
    const rows = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE indexname LIKE '%_searchVector_idx' ORDER BY indexname`
    assert.deepEqual(
      rows.map((r) => r.indexname),
      ["Agreement_searchVector_idx", "Feedback_searchVector_idx", "Note_searchVector_idx", "OneOnOne_searchVector_idx", "TimelineEvent_searchVector_idx"],
    )
    const plan = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`
      return tx.$queryRaw<{ "QUERY PLAN": string }[]>`
        EXPLAIN SELECT id FROM "Feedback" WHERE "searchVector" @@ to_tsquery('portuguese', 'relatorio:*')`
    })
    assert.match(plan.map((p) => p["QUERY PLAN"]).join("\n"), /Feedback_searchVector_idx/)
  })

  test("critério de aceite: termo do CORPO de um feedback de ~4 meses atrás é encontrado em menos de 300 ms", async () => {
    const today = todayBusinessDate()
    const from = new Date(today)
    from.setUTCDate(from.getUTCDate() - 135)
    const to = new Date(today)
    to.setUTCDate(to.getUTCDate() - 105)
    const candidates = await db.feedback.findMany({
      where: { date: { gte: from, lte: to }, OR: [{ guidance: { not: null } }, { context: { not: null } }] },
      orderBy: { date: "asc" },
    })
    // Uma palavra que está no corpo (contexto ou orientação), não no comportamento que vira título na timeline.
    const target = candidates.find((f) => {
      const word = distinctiveWord(`${f.guidance ?? ""} ${f.context ?? ""}`)
      return word && !normalize(f.behavior).includes(normalize(word))
    })
    assert.ok(target, "o seed tem feedback de ~4 meses com contexto ou orientação")
    const word = distinctiveWord(`${target.guidance ?? ""} ${target.context ?? ""}`)

    await searchAll(ownerViewer, word) // aquece a conexão
    const result = await searchAll(ownerViewer, word, { kinds: ["feedback"], limit: 50 })
    const found = result.groups.find((g) => g.kind === "feedback")?.hits.some((h) => h.id === target.id)
    assert.ok(found, `"${word}" acha o feedback de ${formatDate(target.date, "business")}`)
    assert.ok(result.ms < 300, `busca levou ${result.ms} ms`)
  })

  test("VIEWER nunca encontra PRIVATE (nem na contagem); o gestor encontra; outra organização não vê nada", async () => {
    const privates = await db.feedback.findMany({ where: { visibility: "PRIVATE" }, take: 6, orderBy: { date: "desc" } })
    assert.ok(privates.length > 0)
    for (const f of privates) {
      const word = distinctiveWord(f.behavior)
      if (!word) continue
      const asOwner = await searchAll(ownerViewer, word, { kinds: ["feedback"], limit: 50 })
      const asViewer = await searchAll(viewerOnly, word, { kinds: ["feedback"], limit: 50 })
      assert.ok(asOwner.groups[0]?.hits.some((h) => h.id === f.id), `gestor acha "${word}"`)
      const viewerFeedback = asViewer.groups.find((g) => g.kind === "feedback")
      assert.ok(!viewerFeedback?.hits.some((h) => h.id === f.id), `VIEWER não acha o privado por "${word}"`)
      assert.ok((viewerFeedback?.hits ?? []).every((h) => h.visibility === "SHARED"))
      assert.equal(viewerFeedback?.total ?? 0, viewerFeedback?.hits.length ?? 0, "a contagem não revela privados")
    }
    for (const kind of ["oneOnOne", "note", "other"] as const) {
      const r = await searchAll(viewerOnly, "cliente", { kinds: [kind], limit: 50 })
      assert.ok(r.groups.every((g) => g.hits.every((h) => h.visibility === "SHARED")), kind)
    }
    assert.deepEqual((await searchAll(stranger, "cliente")).groups, [])
  })

  test("registro novo é encontrável na hora (coluna gerada pelo banco) e sem acento", async () => {
    const henrique = await db.teamMember.findFirstOrThrow({ where: { preferredName: "Henrique" } })
    assert.ok(
      (
        await createNoteRecord(ownerViewer, {
          memberId: henrique.id,
          date: formatDate(todayBusinessDate(), "business"),
          title: NOTE_TITLE,
          body: "Plantão com a impressora fiscal da filial; anotação só para a busca.",
          visibility: "PRIVATE",
        })
      ).ok,
    )
    const r = await searchAll(ownerViewer, "ornitorrinco impressora", { kinds: ["note"] })
    assert.equal(r.groups[0]?.hits[0]?.title, NOTE_TITLE)
    assert.equal((await searchAll(ownerViewer, "plantao filial", { kinds: ["note"] })).groups[0]?.hits[0]?.title, NOTE_TITLE)
    assert.deepEqual((await searchAll(viewerOnly, "ornitorrinco", { kinds: ["note"] })).groups, [], "privada")
  })

  test("pessoas por nome sem acento; agrupamento por tipo com total", async () => {
    const r = await searchAll(ownerViewer, "otavio")
    assert.equal(r.groups[0]?.kind, "person")
    assert.equal(r.groups[0]?.hits[0]?.member.preferredName, "Otávio")
    for (const g of r.groups) assert.ok(g.total >= g.hits.length)
  })

  test("sem serviço externo de busca", () => {
    const pkg = readFileSync("package.json", "utf8")
    assert.ok(!/algolia|meilisearch|elasticsearch|typesense/i.test(pkg))
  })
})
