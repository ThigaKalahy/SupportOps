/**
 * P20 — Devolução do desenvolvimento (D21, D22, D23, D19). Sem banco: taxa
 * sempre com o denominador e marca de amostra pequena, atribuível nunca
 * sozinha, os dois alertas, o schema do formulário, a migration aditiva e as
 * restrições de arquitetura (entidade separada, sem timeline, sem WhatsApp,
 * aba e não item novo na sidebar).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

import { DEFAULT_THRESHOLDS } from "../src/lib/alert-thresholds.ts"
import { DEFAULT_DEV_RETURN_REASONS, devReturnRate, devReturnStats, formatDevReturnRate } from "../src/lib/dev-returns.ts"
import { labels } from "../src/lib/labels.ts"
import { devReturnSchema } from "../src/lib/validators/dev-return.ts"
import { deriveAlerts } from "../src/server/alerts.ts"
import type { AlertDevReturn, AlertFacts, AlertMember } from "../src/server/queries/alerts.ts"

const today = new Date(Date.UTC(2026, 9, 9))
const day = (offset: number) => new Date(Date.UTC(2026, 9, 9 + offset))

describe("números com denominador (D19)", () => {
  test("taxa sempre com o total de chamados validados; amostra pequena abaixo de 20", () => {
    assert.deepEqual(devReturnRate(12, 180), { count: 12, total: 180, percent: 7, lowConfidence: false })
    assert.equal(devReturnRate(3, 19).lowConfidence, true)
    assert.equal(devReturnRate(3, 0).percent, null, "sem chamado validado: nunca 0% de nada")
  })

  test("formato '7% (12 de 180 chamados)' e só a contagem sem validação", () => {
    const texts = { withTotal: labels.devReturns.summary.rate, countOnly: labels.devReturns.summary.countOnly }
    assert.equal(formatDevReturnRate(devReturnRate(12, 180), texts), "7% (12 de 180 chamados)")
    assert.equal(formatDevReturnRate(devReturnRate(1234, 2000), texts), "62% (1234 de 2.000 chamados)")
    assert.match(formatDevReturnRate(devReturnRate(4, 0), texts), /^4 · sem chamado validado/)
  })

  test("atribuível ao analista sai junto da total, com o mesmo denominador; reenvio e média", () => {
    const stats = devReturnStats(
      [
        { category: "ANALYST", returnedAt: day(-10), resolvedAt: day(-8) },
        { category: "ANALYST", returnedAt: day(-6), resolvedAt: day(-1) },
        { category: "PROCESS", returnedAt: day(-2), resolvedAt: null },
      ],
      40,
    )
    assert.equal(stats.total, 3)
    assert.equal(stats.attributable, 2)
    assert.equal(stats.process, 1)
    assert.equal(stats.returnRate.total, 40)
    assert.equal(stats.attributableRate.total, 40)
    assert.equal(stats.resolved, 2)
    assert.equal(stats.stillOpen, 1)
    assert.equal(stats.avgDaysToResolve, 3.5)
    assert.equal(stats.lowConfidence, false)
  })
})

describe("formulário", () => {
  const catalog = { reasons: [{ id: "r1", requiresDetail: false }, { id: "outro", requiresDetail: true }] }
  const base = {
    ticketUrl: "https://helpdesk/tickets/1",
    ticketRef: "1",
    memberId: "m1",
    centralId: "",
    returnedAt: "01/10/2026",
    reasonId: "r1",
    reasonOther: "",
    devContact: "",
    note: "",
  }

  test("motivo obrigatório; 'Outro' exige o texto; data não pode ser no futuro", () => {
    assert.ok(devReturnSchema(catalog).safeParse(base).success)
    assert.ok(!devReturnSchema(catalog).safeParse({ ...base, reasonId: "" }).success)
    assert.ok(!devReturnSchema(catalog).safeParse({ ...base, reasonId: "outro" }).success)
    assert.ok(devReturnSchema(catalog).safeParse({ ...base, reasonId: "outro", reasonOther: "Ambiente de homologação fora" }).success)
    assert.ok(!devReturnSchema(catalog).safeParse({ ...base, returnedAt: "01/01/2999" }).success)
    assert.ok(!devReturnSchema(catalog).safeParse({ ...base, memberId: "" }).success, "analista é obrigatório")
  })
})

describe("alertas (P20)", () => {
  const member: AlertMember = {
    id: "Ana",
    preferredName: "Ana",
    fullName: "Ana Teste",
    status: "ACTIVE",
    joinedAt: day(-400),
    seniorityKey: "PLENO",
    seniorityLabel: "Pleno",
    lastOneOnOne: day(-2),
    lastRecordAt: day(-1),
  }
  const ret = (id: string, offset: number, patch: Partial<AlertDevReturn> = {}): AlertDevReturn => ({
    id,
    memberId: "Ana",
    ticketRef: id,
    returnedAt: day(offset),
    resolvedAt: day(offset),
    reasonId: "falta",
    reasonLabel: "Falta de informação no chamado",
    category: "ANALYST",
    ...patch,
  })
  const facts = (devReturns: AlertDevReturn[]): AlertFacts => ({
    members: [member],
    agreements: [],
    plans: [],
    followUps: [],
    devReturns,
    watchItems: [],
    adherence: new Map(),
    lastDaily: today,
    readiness: [],
  })
  const kinds = (devReturns: AlertDevReturn[]) => deriveAlerts(facts(devReturns), today, DEFAULT_THRESHOLDS).map((a) => a.kind)

  test("recorrentes: 3+ do analista pelo mesmo motivo em 60 dias", () => {
    assert.deepEqual(kinds([ret("1", -1), ret("2", -20), ret("3", -59)]), ["devReturnsRecurring"])
    assert.deepEqual(kinds([ret("1", -1), ret("2", -20)]), [], "duas não são padrão")
    assert.deepEqual(kinds([ret("1", -1), ret("2", -20), ret("3", -60)]), [], "fora da janela de 60 dias")
    assert.deepEqual(kinds([ret("1", -1), ret("2", -20), ret("3", -30, { reasonId: "outro" })]), [], "motivos diferentes")
    assert.deepEqual(
      kinds([ret("1", -1, { category: "PROCESS" }), ret("2", -2, { category: "PROCESS" }), ret("3", -3, { category: "PROCESS" })]),
      [],
      "processo não é falha do analista (D22)",
    )
  })

  test("sem reenvio há mais de 7 dias; reenviada não alerta", () => {
    assert.deepEqual(kinds([ret("1", -8, { resolvedAt: null })]), ["devReturnUnresolved"])
    assert.deepEqual(kinds([ret("1", -7, { resolvedAt: null })]), [])
    assert.deepEqual(kinds([ret("1", -40)]), [])
    const old = deriveAlerts(facts([ret("1", -31, { resolvedAt: null })]), today, DEFAULT_THRESHOLDS)[0]
    assert.equal(old?.severity, "overdue")
    assert.equal(old?.nav, "validations")
  })
})

describe("entidade separada, migration aditiva (D21, D23)", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8")
  const sql = readFileSync("prisma/migrations/20261009120000_dev_returns/migration.sql", "utf8")

  test("ValidationOutcome não ganhou valor e PriorityValidation não ganhou coluna de devolução", () => {
    const outcome = schema.slice(schema.indexOf("enum ValidationOutcome"), schema.indexOf("}", schema.indexOf("enum ValidationOutcome")))
    assert.deepEqual(outcome.match(/^\s+[A-Z_]+$/gm)?.map((v) => v.trim()), ["MAINTAINED", "RAISED", "LOWERED", "RETURNED"])
    const model = schema.slice(schema.indexOf("model PriorityValidation {"), schema.indexOf("\n}", schema.indexOf("model PriorityValidation {")))
    assert.ok(!/resolvedAt|devContact|returnedAt/.test(model))
  })

  test("só cria; reasonId NOT NULL; catálogo inicial igual ao da aplicação", () => {
    assert.ok(!/\bDROP\b|^\s*UPDATE\b|\bDELETE FROM\b|\bRENAME\b|ALTER TABLE "(?!DevReturn)/im.test(sql))
    assert.match(sql, /"reasonId" TEXT NOT NULL/)
    for (const [i, r] of DEFAULT_DEV_RETURN_REASONS.entries()) {
      assert.ok(sql.includes(`('${r.label}', '${r.category}', ${i + 1}, ${r.requiresDetail})`), r.label)
    }
  })

  test("sem TimelineEvent, sem WhatsApp, e a extração do ID é a mesma da validação", () => {
    const server = readFileSync("src/server/dev-returns.ts", "utf8")
    assert.ok(!/timeline/i.test(server.replace(/\/\*[\s\S]*?\*\//g, "")))
    assert.match(server, /withExtractedRef/)
    assert.ok(!/RegExp|new RegExp/.test(server), "não duplica a lógica de padrões")
    assert.ok(!/DevReturn|devReturn/.test(readFileSync("src/server/whatsapp.ts", "utf8")))
    assert.match(readFileSync("src/components/dev-returns/dev-return-form.tsx", "utf8"), /extractTicketRef/)
  })
})

describe("navegação: aba, não item novo", () => {
  test("a sidebar não ganhou item; /dev-returns é aba de Validação de prioridade", () => {
    // nav-config usa o alias @/ do Next, que o node:test não resolve: leitura do código.
    const nav = readFileSync("src/components/shell/nav-config.ts", "utf8")
    const main = nav.slice(nav.indexOf("export const mainNav"), nav.indexOf("export const footerNav"))
    assert.ok((main.match(/href: "\//g) ?? []).length - 1 <= 8, "oito é o teto (a aba conta só dentro do item)")
    assert.match(main, /href: "\/priority-validations"[\s\S]*also: \[\{ href: "\/dev-returns"/)
    assert.ok(!/^\s+\{ href: "\/dev-returns", label: labels\.nav/m.test(main))
    assert.match(readFileSync("src/app/(app)/dev-returns/page.tsx", "utf8"), /<TriageTabs modules=\{ctx\.modules\} \/>/)
    assert.match(readFileSync("src/app/(app)/priority-validations/page.tsx", "utf8"), /<TriageTabs modules=\{ctx\.modules\} \/>/)
  })
})
