/**
 * Critério de aceite do P5: logado como VIEWER, nenhum registro PRIVATE
 * aparece em nenhuma superfície — timeline, busca, command palette, contadores.
 *
 * Duas camadas:
 * 1. Estática: toda leitura de OneOnOne, Feedback, Note e TimelineEvent em
 *    src/ precisa estar em src/server/queries e aplicar visibilityFilter. Isso
 *    vale para as superfícies que ainda vão existir (busca, paleta, contadores):
 *    uma leitura nova fora do padrão reprova o teste.
 * 2. Banco: com os dados do seed (que têm registros PRIVATE), as funções de
 *    leitura chamadas como VIEWER não devolvem nada PRIVATE.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { after, describe, test } from "node:test"

import { db, dbIncludingDeleted } from "../src/server/db.ts"
import {
  countRecordsByMember,
  getMemberTimeline,
  listFeedbacks,
  listNotes,
  listOneOnOnes,
  searchRecords,
} from "../src/server/queries/records.ts"
import type { TeamContext } from "../src/server/scope.ts"

const SRC = join(import.meta.dirname, "..", "src")
// watchItem (P21, D25): observação é a superfície mais provável de anotação gerencial crua.
const SENSITIVE_MODELS = "oneOnOne|feedback|note|timelineEvent|watchItem"
const READ_CALL = new RegExp(`\\.(${SENSITIVE_MODELS})\\.(findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|aggregate|groupBy)\\(`, "g")
const NESTED_RELATION = /\b(oneOnOnes|feedbacks|notes|timelineEvents|watchItems)\s*:\s*(true|\{)/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [path] : []
  })
}

/** Trecho da chamada: do match até o fechamento do parêntese correspondente. */
function callBody(source: string, openParenIndex: number): string {
  let depth = 0
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === "(") depth++
    if (source[i] === ")" && --depth === 0) return source.slice(openParenIndex, i + 1)
  }
  return source.slice(openParenIndex)
}

describe("camada estática: leituras sensíveis só com visibilityFilter", () => {
  const files = sourceFiles(SRC)

  test("existem arquivos para analisar", () => assert.ok(files.length > 20))

  test("toda leitura de OneOnOne/Feedback/Note/TimelineEvent está em src/server/queries e filtra visibilidade", () => {
    const violations: string[] = []
    for (const file of files) {
      const source = readFileSync(file, "utf8")
      const rel = relative(SRC, file).split(sep).join("/")
      for (const match of source.matchAll(READ_CALL)) {
        const body = callBody(source, (match.index ?? 0) + match[0].length - 1)
        if (!rel.startsWith("server/queries/")) violations.push(`${rel}: leitura de ${match[1]} fora de src/server/queries`)
        else if (!body.includes("visibilityFilter(")) violations.push(`${rel}: ${match[1]}.${match[2]} sem visibilityFilter`)
      }
    }
    assert.deepEqual(violations, [])
  })

  test("SQL cru ($queryRaw) que toca tabela sensível usa visibilitySql e mora em src/server/queries", () => {
    const violations: string[] = []
    for (const file of files) {
      const source = readFileSync(file, "utf8")
      const rel = relative(SRC, file).split(sep).join("/")
      for (const match of source.matchAll(/\$queryRaw(Unsafe)?/g)) {
        const start = source.indexOf("`", match.index)
        // Fim do template: crase seguida de quebra de linha (crases internas de Prisma.sql não fecham linha).
        const end = source.indexOf("`\n", start + 1)
        const sql = source.slice(start, end > start ? end : undefined)
        const tables = [...sql.matchAll(/"(OneOnOne|Feedback|Note|TimelineEvent|WatchItem)"/g)].map((m) => m[1])
        if (match[1]) violations.push(`${rel}: $queryRawUnsafe é proibido (use $queryRaw com parâmetros)`)
        if (tables.length === 0) continue
        if (!rel.startsWith("server/queries/")) violations.push(`${rel}: SQL cru em tabela sensível fora de src/server/queries`)
        const guards = (sql.match(/visibilitySql\(/g) ?? []).length
        if (guards < tables.length) violations.push(`${rel}: ${tables.length} tabela(s) sensível(is) e ${guards} visibilitySql`)
      }
    }
    assert.deepEqual(violations, [])
  })

  test("relação aninhada com registro sensível (include/select/_count) também filtra visibilidade", () => {
    const violations: string[] = []
    for (const file of files) {
      const source = readFileSync(file, "utf8")
      const rel = relative(SRC, file).split(sep).join("/")
      for (const match of source.matchAll(NESTED_RELATION)) {
        const window = source.slice(match.index, (match.index ?? 0) + 240)
        if (!window.includes("visibilityFilter(")) violations.push(`${rel}: relação ${match[1]} sem visibilityFilter`)
      }
    }
    assert.deepEqual(violations, [])
  })
})

describe("camada de banco: VIEWER nunca recebe PRIVATE (dados do seed)", async () => {
  const org = await dbIncludingDeleted.organization.findUnique({ where: { slug: "suporte" } })
  const team = await dbIncludingDeleted.team.findFirst({ where: { slug: "suporte" }, select: { id: true } })
  const members = await dbIncludingDeleted.teamMember.findMany({ where: { teamId: team?.id ?? "" }, select: { id: true, preferredName: true } })
  const privateTotal = await dbIncludingDeleted.timelineEvent.count({ where: { teamId: team?.id ?? "", visibility: "PRIVATE" } })

  after(async () => {
    await db.$disconnect()
    await dbIncludingDeleted.$disconnect()
  })

  test("o seed tem registros PRIVATE e SHARED (senão o teste não prova nada)", () => {
    assert.ok(org, "rode `pnpm db:seed` antes dos testes")
    assert.ok(members.length >= 9)
    assert.ok(privateTotal > 0)
  })

  if (!org || !team) return
  // Contextos sintéticos do time do seed: o nível (D34) é o que decide a visibilidade.
  const base = { organizationId: org.id, teamId: team.id, isPlatformAdmin: false, modules: new Set<string>() }
  const viewer: TeamContext = { ...base, userId: "teste-viewer", level: "VIEWER" }
  const owner: TeamContext = { ...base, userId: "teste-owner", level: "MANAGER" }

  test("timeline: nenhuma linha PRIVATE para VIEWER; OWNER vê as privadas", async () => {
    let ownerPrivate = 0
    for (const m of members) {
      const asViewer = await getMemberTimeline(viewer, m.id, { take: 1000 })
      assert.ok(asViewer.every((e) => e.visibility === "SHARED"), `PRIVATE na timeline de ${m.preferredName}`)
      const asOwner = await getMemberTimeline(owner, m.id, { take: 1000 })
      ownerPrivate += asOwner.filter((e) => e.visibility === "PRIVATE").length
    }
    assert.equal(ownerPrivate, privateTotal)
  })

  test("busca (e command palette, que usa a mesma busca): nenhum resultado PRIVATE", async () => {
    for (const term of ["cliente", "chamado", "combinado", "log", "rede", "a"]) {
      const results = await searchRecords(viewer, term, 500)
      assert.ok(results.every((e) => e.visibility === "SHARED"), `PRIVATE na busca por "${term}"`)
    }
    const ownerResults = await searchRecords(owner, "a", 500)
    assert.ok(ownerResults.some((e) => e.visibility === "PRIVATE"), "a busca do OWNER deveria alcançar registros privados")
  })

  test("contadores: total do VIEWER é exatamente o total SHARED", async () => {
    const counts = await countRecordsByMember(viewer)
    const viewerTotal = [...counts.values()].reduce((a, b) => a + b, 0)
    const sharedTotal = await dbIncludingDeleted.timelineEvent.count({ where: { teamId: team.id, visibility: "SHARED" } })
    assert.equal(viewerTotal, sharedTotal)
  })

  test("listas de 1:1, feedbacks e anotações: nenhum PRIVATE para VIEWER", async () => {
    for (const m of members) {
      for (const rows of [await listOneOnOnes(viewer, m.id), await listFeedbacks(viewer, m.id), await listNotes(viewer, m.id)]) {
        assert.ok(rows.every((r) => r.visibility === "SHARED"), `PRIVATE em lista de ${m.preferredName}`)
      }
    }
  })

  test("escopo de time: outro time não enxerga nada", async () => {
    const stranger: TeamContext = { ...owner, teamId: "time-inexistente" }
    assert.equal((await searchRecords(stranger, "a", 50)).length, 0)
    assert.equal((await countRecordsByMember(stranger)).size, 0)
  })
})
