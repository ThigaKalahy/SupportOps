/**
 * P21 — Em observação (D24–D27, D23, D9). Sem banco: estados derivados
 * (sem revisão, fogo alto frio, parada), o que entra na home, os alertas, a
 * privacidade (nasce PRIVATE, nunca no WhatsApp, VIEWER pela regra de
 * visibilidade), timeline só com pessoa e só na criação/resolução, migration
 * aditiva e a sidebar com 8 itens.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

import { DEFAULT_THRESHOLDS } from "../src/lib/alert-thresholds.ts"
import { labels } from "../src/lib/labels.ts"
import { createWatchSchema, resolveWatchSchema, reviewWatchSchema } from "../src/lib/validators/watch.ts"
import { coldHighDays, reviewState, showsOnHome, stalledDays } from "../src/lib/watch.ts"
import { alertCounts, deriveAlerts } from "../src/server/alerts.ts"
import type { AlertFacts, AlertWatchItem } from "../src/server/queries/alerts.ts"

const t = DEFAULT_THRESHOLDS
const now = new Date("2026-10-10T15:00:00Z")
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000)
const today = new Date(Date.UTC(2026, 9, 10))

describe("estados derivados (D9, D24)", () => {
  test("sem revisão pela cadência do grau; muito atrasada acima do dobro", () => {
    assert.equal(reviewState({ heat: "HIGH", lastReviewedAt: ago(2) }, now, t).status, "ok")
    assert.deepEqual(
      [reviewState({ heat: "HIGH", lastReviewedAt: ago(3) }, now, t).status, reviewState({ heat: "HIGH", lastReviewedAt: ago(3) }, now, t).severity],
      ["due", "attention"],
    )
    assert.equal(reviewState({ heat: "HIGH", lastReviewedAt: ago(5) }, now, t).severity, "overdue")
    assert.equal(reviewState({ heat: "MEDIUM", lastReviewedAt: ago(7) }, now, t).status, "ok")
    assert.equal(reviewState({ heat: "LOW", lastReviewedAt: ago(22) }, now, t).status, "due")
    assert.equal(reviewState({ heat: "LOW", lastReviewedAt: ago(43) }, now, t).status, "late")
  })

  test("fogo alto frio: HIGH ativa há mais de 30 dias sem mudar de grau", () => {
    assert.equal(coldHighDays({ heat: "HIGH", status: "ACTIVE", heatChangedAt: ago(35) }, now, t), 35)
    assert.equal(coldHighDays({ heat: "HIGH", status: "ACTIVE", heatChangedAt: ago(30) }, now, t), null)
    assert.equal(coldHighDays({ heat: "MEDIUM", status: "ACTIVE", heatChangedAt: ago(90) }, now, t), null)
    assert.equal(coldHighDays({ heat: "HIGH", status: "RESOLVED", heatChangedAt: ago(90) }, now, t), null)
  })

  test("parada: nunca revisada há mais de 14 dias", () => {
    assert.equal(stalledDays({ status: "ACTIVE", reviewCount: 0, createdAt: ago(15) }, now), 15)
    assert.equal(stalledDays({ status: "ACTIVE", reviewCount: 0, createdAt: ago(14) }, now), null)
    assert.equal(stalledDays({ status: "ACTIVE", reviewCount: 1, createdAt: ago(60) }, now), null)
  })

  test("home: alto e médio sem revisão entram; baixo só passado o dobro; em dia não entra", () => {
    const state = (heat: "HIGH" | "MEDIUM" | "LOW", days: number) => reviewState({ heat, lastReviewedAt: ago(days) }, now, t)
    assert.ok(showsOnHome("HIGH", state("HIGH", 3)))
    assert.ok(showsOnHome("MEDIUM", state("MEDIUM", 8)))
    assert.ok(!showsOnHome("LOW", state("LOW", 22)))
    assert.ok(showsOnHome("LOW", state("LOW", 43)))
    assert.ok(!showsOnHome("LOW", state("LOW", 5)))
  })
})

describe("alertas e home", () => {
  const item = (id: string, patch: Partial<AlertWatchItem>): AlertWatchItem => ({
    id,
    memberId: null,
    title: `Item ${id}`,
    heat: "MEDIUM",
    createdAt: ago(40),
    lastReviewedAt: ago(1),
    heatChangedAt: ago(40),
    reviewCount: 2,
    ...patch,
  })
  const facts = (watchItems: AlertWatchItem[]): AlertFacts => ({
    members: [],
    agreements: [],
    plans: [],
    followUps: [],
    devReturns: [],
    watchItems,
    adherence: new Map(),
    lastDaily: today,
    readiness: [],
  })

  test("fogo alto há 35 dias sem mudar de grau aparece dizendo exatamente isso, em vermelho", () => {
    const [alert] = deriveAlerts(facts([item("a", { heat: "HIGH", heatChangedAt: ago(35), lastReviewedAt: ago(1) })]), today, t, now)
    assert.equal(alert?.kind, "watchColdHigh")
    assert.equal(alert?.severity, "overdue")
    assert.match(alert!.text, /fogo alto há 35 dias sem mudar de grau/)
  })

  test("um alerta por item; alto sem revisão no topo; baixo em dia fora; parada", () => {
    const alerts = deriveAlerts(
      facts([
        item("high", { heat: "HIGH", lastReviewedAt: ago(3), heatChangedAt: ago(10) }),
        item("medium", { heat: "MEDIUM", lastReviewedAt: ago(8) }),
        item("low", { heat: "LOW", lastReviewedAt: ago(10) }),
        item("stalled", { heat: "LOW", lastReviewedAt: ago(16), createdAt: ago(16), reviewCount: 0 }),
      ]),
      today,
      t,
      now,
    )
    assert.deepEqual(
      alerts.map((a) => [a.kind, a.id.split(":")[1], a.severity]),
      [
        ["watchUnreviewed", "high", "overdue"],
        ["watchStalled", "stalled", "attention"],
        ["watchUnreviewed", "medium", "attention"],
      ],
    )
    assert.equal(alertCounts(alerts).watch, 3)
  })
})

describe("formulários (D27)", () => {
  test("título obrigatório; revisar sem nota é válido; resolver exige texto", () => {
    assert.ok(!createWatchSchema.safeParse({ title: " ", heat: "HIGH", origin: "MANUAL" }).success)
    assert.ok(createWatchSchema.safeParse({ title: "Algo", heat: "HIGH", origin: "MANUAL" }).success)
    assert.ok(reviewWatchSchema.safeParse({ id: "x" }).success)
    assert.ok(!resolveWatchSchema.safeParse({ id: "x", note: "" }).success)
    assert.ok(resolveWatchSchema.safeParse({ id: "x", note: "Conversamos e ajustou a fila." }).success)
  })

  test("não existe campo de visibilidade na criação: nasce PRIVATE sempre (D25)", () => {
    assert.ok(!("visibility" in createWatchSchema.shape))
    const server = readFileSync("src/server/watch.ts", "utf8")
    assert.match(server, /visibility: "PRIVATE",/)
  })

  test("rótulos pedidos", () => {
    assert.deepEqual(labels.watch.heat, { HIGH: "Fogo alto", MEDIUM: "Fogo médio", LOW: "Fogo baixo" })
    assert.equal(labels.watch.title, "Em observação")
    const a = labels.watch.actions
    assert.deepEqual([a.watch, a.reviewed, a.cool, a.heat, a.resolve, a.archive], ["Colocar em observação", "Revisado hoje", "Esfriar", "Esquentar", "Resolver", "Arquivar"])
  })
})

describe("privacidade e timeline (D25, D26)", () => {
  test("WatchItem nunca entra no texto do WhatsApp", () => {
    const whatsapp = readFileSync("src/server/whatsapp.ts", "utf8")
    assert.ok(!/watch|observa/i.test(whatsapp.replace(/\/\*[\s\S]*?\*\//g, "")))
    const daily = readFileSync("src/components/dailies/daily-form.tsx", "utf8")
    const builder = daily.slice(daily.indexOf("function whatsapp()"), daily.indexOf("function whatsapp()") + 1500)
    assert.ok(!/watch/i.test(builder), "o texto da daily não lê observações")
  })

  test("timeline só com pessoa, na criação e na resolução; revisão não escreve", () => {
    const server = readFileSync("src/server/watch.ts", "utf8")
    const body = (name: string) => server.slice(server.indexOf(`export async function ${name}`), server.indexOf("\nexport ", server.indexOf(`export async function ${name}`) + 1))
    assert.match(body("createWatchItemRecord"), /if \(item\.memberId\) \{\s+await recordTimelineEvents/)
    assert.match(body("resolveWatchItemRecord"), /if \(item\.memberId\) \{\s+await recordTimelineEvents/)
    for (const fn of ["reviewWatchItemRecord", "changeWatchHeatRecord", "archiveWatchItemRecord"]) {
      assert.ok(!/recordTimelineEvents/.test(body(fn)), fn)
    }
    assert.match(body("setWatchVisibilityRecord"), /syncTimelineVisibility/)
  })

  test("toda leitura de WatchItem passa por visibilityFilter (VIEWER só SHARED)", () => {
    const visibility = readFileSync("tests/visibility.test.ts", "utf8")
    assert.match(visibility, /SENSITIVE_MODELS = "oneOnOne\|feedback\|note\|timelineEvent\|watchItem"/)
  })
})

describe("migration aditiva e navegação", () => {
  test("só acrescenta: enums, um valor de enum, tabelas e uma coluna nula", () => {
    const sql = readFileSync("prisma/migrations/20261010120000_watch_items/migration.sql", "utf8")
    assert.ok(!/\bDROP\b|^\s*UPDATE\b|\bDELETE FROM\b|\bRENAME\b|SET NOT NULL/im.test(sql))
    assert.match(sql, /ALTER TYPE "TimelineEventType" ADD VALUE 'WATCH';/)
    assert.match(sql, /ALTER TABLE "TimelineEvent" ADD COLUMN\s+"watchItemId" TEXT;/)
    assert.match(sql, /"visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE'/)
    assert.match(sql, /WatchItem_resolution_required/)
  })

  test("Em observação é o segundo item da sidebar, que fica com 8", () => {
    const nav = readFileSync("src/components/shell/nav-config.ts", "utf8")
    const main = nav.slice(nav.indexOf("export const mainNav"), nav.indexOf("export const footerNav"))
    const hrefs = [...main.matchAll(/^\s+(?:\{ )?href: "([^"]+)"/gm)].map((m) => m[1])
    assert.deepEqual(hrefs.slice(0, 2), ["/", "/watch"])
    assert.equal(hrefs.length, 8)
  })
})
