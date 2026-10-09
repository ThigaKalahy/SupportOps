/**
 * P15 — motor de alertas e Hoje. Regra pura (deriveAlerts: ordem por urgência
 * real, agrupamentos, silêncio cobrindo "sem 1:1", daily em dias úteis,
 * prontidão só informativa, contadores da mesma fonte), limiares em /settings
 * (faixa, volta ao padrão, auditoria, efeito imediato), o seed lido pelo
 * motor, a regra do VIEWER e o critério de aceite da home (no máximo duas
 * superfícies delimitadas; nada persistido — D9).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { after, describe, test } from "node:test"

import { DEFAULT_THRESHOLDS, resolveThresholds, type AlertThresholds } from "../src/lib/alert-thresholds.ts"
import { todayBusinessDate } from "../src/lib/dates.ts"
import { alertCounts, deriveAlerts, getAlerts, memberAttention, missedBusinessDays } from "../src/server/alerts.ts"
import { db, dbIncludingDeleted } from "../src/server/db.ts"
import type { AlertFacts, AlertMember } from "../src/server/queries/alerts.ts"
import { listTeamMembers } from "../src/server/queries/members.ts"
import { getThresholds } from "../src/server/queries/thresholds.ts"
import { setThresholdRecord } from "../src/server/settings.ts"
import { seedContexts } from "./support/team-context.ts"

const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const { manager: ownerViewer, viewer: viewerOnly } = await seedContexts(owner)

// Uma sexta-feira fixa: 02/10/2026.
const today = new Date(Date.UTC(2026, 9, 2))
const day = (offset: number) => {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}
const t: AlertThresholds = DEFAULT_THRESHOLDS

function member(id: string, patch: Partial<AlertMember> = {}): AlertMember {
  return {
    id,
    preferredName: id,
    fullName: `${id} Teste`,
    status: "ACTIVE",
    joinedAt: day(-400),
    seniorityKey: "PLENO",
    seniorityLabel: "Pleno",
    lastOneOnOne: day(-5),
    lastRecordAt: day(-2),
    ...patch,
  }
}

function facts(patch: Partial<AlertFacts> = {}): AlertFacts {
  return {
    members: [member("Ana"), member("Bia"), member("Caio")],
    agreements: [],
    plans: [],
    followUps: [],
    devReturns: [],
    watchItems: [],
    adherence: new Map(),
    lastDaily: day(-1),
    readiness: [],
    ...patch,
  }
}

after(async () => {
  await dbIncludingDeleted.alertThreshold.deleteMany({ where: { teamId: ownerViewer.teamId } })
  await dbIncludingDeleted.auditLog.deleteMany({ where: { action: "settings.alertThreshold.update" } })
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

describe("regra do motor (pura)", () => {
  test("nada pendente: lista vazia, contadores zerados", () => {
    const alerts = deriveAlerts(facts(), today, t)
    assert.deepEqual(alerts, [])
    assert.deepEqual(alertCounts(alerts), { today: 0, team: 0, watch: 0, agreements: 0, validations: 0, records: 0, development: 0, dailies: 0 })
  })

  test("ordem por urgência real: vermelho antes de laranja antes de âmbar; dentro, o mais velho primeiro", () => {
    const alerts = deriveAlerts(
      facts({
        agreements: [
          { id: "a1", memberId: "Ana", title: "Recente", dueDate: day(-2), reschedules: 0 },
          { id: "a2", memberId: "Bia", title: "Esquecido", dueDate: day(-40), reschedules: 0 },
          { id: "a3", memberId: "Caio", title: "Vencido", dueDate: day(-10), reschedules: 0 },
          { id: "a4", memberId: "Ana", title: "Amanhã", dueDate: day(1), reschedules: 0 },
        ],
      }),
      today,
      t,
    )
    assert.deepEqual(
      alerts.map((a) => a.id),
      ["overdue:a2", "overdue:a3", "overdue:a1", "dueSoon:Ana"],
    )
    assert.equal(alerts[0]!.severity, "overdue")
    assert.equal(alerts[2]!.strong, true, "vencido há poucos dias = laranja")
  })

  test("vencido e crônico vira UMA linha; crônico no prazo tem linha própria; vencendo agrupa por pessoa", () => {
    const alerts = deriveAlerts(
      facts({
        agreements: [
          { id: "a1", memberId: "Ana", title: "Arrastado vencido", dueDate: day(-3), reschedules: 4 },
          { id: "a2", memberId: "Bia", title: "Arrastado no prazo", dueDate: day(10), reschedules: 3 },
          { id: "a3", memberId: "Caio", title: "Um", dueDate: day(2), reschedules: 0 },
          { id: "a4", memberId: "Caio", title: "Dois", dueDate: day(3), reschedules: 1 },
        ],
      }),
      today,
      t,
    )
    assert.equal(alerts.filter((a) => a.id.endsWith("a1")).length, 1)
    assert.match(alerts.find((a) => a.id === "overdue:a1")!.text, /4x/)
    assert.ok(alerts.find((a) => a.id === "chronic:a2"))
    const soon = alerts.filter((a) => a.kind === "dueSoon")
    assert.equal(soon.length, 1)
    assert.match(soon[0]!.text, /^2 combinados/)
  })

  test("silêncio gerencial cobre o 'sem 1:1' da mesma pessoa; afastado não entra na cadência", () => {
    const alerts = deriveAlerts(
      facts({
        members: [
          member("Ana", { lastRecordAt: day(-40), lastOneOnOne: day(-40) }),
          member("Bia", { lastOneOnOne: day(-35), lastRecordAt: day(-1) }),
          member("Caio", { status: "ON_LEAVE", lastOneOnOne: day(-90), lastRecordAt: day(-90) }),
        ],
      }),
      today,
      t,
    )
    assert.deepEqual(
      alerts.map((a) => `${a.kind}:${a.member?.id}`).sort(),
      ["lateOneOnOne:Bia", "silence:Ana"],
    )
    assert.equal(alerts.find((a) => a.kind === "silence")!.action.kind, "oneOnOne")
  })

  test("cadência por senioridade: Júnior 21, Pleno 30; acima do dobro é vermelho", () => {
    const alerts = deriveAlerts(
      facts({
        members: [
          member("Ana", { seniorityKey: "JUNIOR", seniorityLabel: "Júnior", lastOneOnOne: day(-22) }),
          member("Bia", { lastOneOnOne: day(-22) }),
          member("Caio", { seniorityKey: "JUNIOR", seniorityLabel: "Júnior", lastOneOnOne: day(-43) }),
        ],
      }),
      today,
      t,
    )
    assert.deepEqual(
      alerts.map((a) => `${a.member?.id}:${a.severity}`),
      ["Caio:overdue", "Ana:attention"],
    )
  })

  test("daily: conta só dias úteis entre a última e hoje; sem nenhuma daily, avisa", () => {
    // Última daily na quarta (30/09): falta só quinta (01/10) → 1 dia útil, abaixo do limiar 2.
    assert.equal(missedBusinessDays(day(-2), today), 1)
    // Última na sexta anterior (25/09): seg 28, ter 29, qua 30, qui 01 → 4.
    assert.equal(missedBusinessDays(day(-7), today), 4)
    assert.equal(deriveAlerts(facts({ lastDaily: day(-2) }), today, t).length, 0)
    const missing = deriveAlerts(facts({ lastDaily: day(-7) }), today, t)
    assert.deepEqual(
      missing.map((a) => [a.kind, a.member, a.severity]),
      [["dailyMissing", null, "overdue"]],
    )
    assert.equal(deriveAlerts(facts({ lastDaily: null }), today, t)[0]!.kind, "dailyMissing")
  })

  test("cumprimento em queda só com amostra nas duas janelas", () => {
    const drop = (current: [number, number], previous: [number, number]) =>
      deriveAlerts(
        facts({
          adherence: new Map([
            ["Ana", { current: { onTime: current[0], due: current[1] }, previous: { onTime: previous[0], due: previous[1] } }],
          ]),
        }),
        today,
        t,
      ).filter((a) => a.kind === "adherenceDrop").length
    assert.equal(drop([3, 6], [5, 6]), 1, "83% → 50%")
    assert.equal(drop([1, 4], [5, 5]), 0, "4 combinados na janela atual: amostra pequena")
    assert.equal(drop([4, 6], [5, 6]), 0, "queda de 17 p.p.")
  })

  test("prontidão: só quem atende a TODA a próxima senioridade; informativo, no fim e fora dos contadores", () => {
    const readiness = (met: number, total: number) => ({
      member: { id: "Ana", preferredName: "Ana", seniorityLabel: "Júnior" },
      readiness: { next: { seniorityId: "p", label: "Pleno" }, total, met },
    })
    assert.equal(deriveAlerts(facts({ readiness: [readiness(8, 10)] }), today, t).length, 0)
    const alerts = deriveAlerts(
      facts({
        readiness: [readiness(10, 10)],
        agreements: [{ id: "a1", memberId: "Bia", title: "Vencido", dueDate: day(-1), reschedules: 0 }],
      }),
      today,
      t,
    )
    assert.deepEqual(alerts.map((a) => a.kind), ["overdue", "readiness"])
    assert.equal(alerts[1]!.informative, true)
    assert.deepEqual(alertCounts(alerts), { today: 1, team: 1, watch: 0, agreements: 1, validations: 0, records: 0, development: 0, dailies: 0 })
  })

  test("limiares mudam o resultado: silêncio de 30 → 50 dias tira o alerta", () => {
    const f = facts({ members: [member("Ana", { lastRecordAt: day(-40), lastOneOnOne: day(-10) })] })
    assert.equal(deriveAlerts(f, today, t).length, 1)
    assert.equal(deriveAlerts(f, today, { ...t, silenceDays: 50 }).length, 0)
  })

  test("resolveThresholds: linha do banco sobrepõe o padrão; chave desconhecida é ignorada", () => {
    const r = resolveThresholds([
      { key: "silenceDays", value: 45 },
      { key: "oneOnOneDays.JUNIOR", value: 14 },
      { key: "oneOnOneDays.ESPECIALISTA", value: 40 },
      { key: "inexistente", value: 1 },
    ])
    assert.equal(r.silenceDays, 45)
    assert.deepEqual(r.oneOnOneDays, { JUNIOR: 14, PLENO: 30, SENIOR: 30, ESPECIALISTA: 40 })
    assert.equal("inexistente" in r, false)
    assert.equal(DEFAULT_THRESHOLDS.oneOnOneDays.JUNIOR, 21, "padrão intacto")
  })
})

describe("motor sobre o seed", () => {
  test("as narrativas do seed aparecem, na ordem de urgência; contadores da mesma lista", async () => {
    const { alerts, counts } = await getAlerts(ownerViewer)
    const has = (kind: string, name: string) => alerts.some((a) => a.kind === kind && a.member?.preferredName === name)
    assert.ok(has("overdue", "Priscila"), "combinados vencidos há mais de 40 dias")
    assert.ok(has("stalePlan", "Henrique"), "PDI parado")
    assert.ok(has("adherenceDrop", "Henrique"), "cumprimento em queda")
    assert.ok(has("chronic", "Diego") || alerts.some((a) => a.member?.preferredName === "Diego" && /4x/.test(a.text)), "arrastado 4x")
    assert.ok(has("lateOneOnOne", "Beatriz"), "Beatriz sem 1:1 há ~6 semanas")
    assert.equal(alerts[0]!.severity, "overdue")
    const weights = alerts.filter((a) => !a.informative).map((a) => (a.severity === "overdue" ? 4 : a.severity === "attention" ? (a.strong ? 3 : 2) : 1))
    assert.deepEqual(weights, [...weights].sort((a, b) => b - a), "nunca um menos grave antes de um mais grave")
    assert.deepEqual(counts, alertCounts(alerts))
  })

  test("o motor e a coluna de atenção de /team concordam em quem tem vencido", async () => {
    const { alerts } = await getAlerts(ownerViewer)
    const rows = await listTeamMembers(ownerViewer)
    const withOverdue = new Set(alerts.filter((a) => a.kind === "overdue").map((a) => a.member!.id))
    const teamOverdue = new Set(rows.filter((r) => r.attention?.reasons.some((x) => /vencido/.test(x.text))).map((r) => r.id))
    assert.deepEqual([...withOverdue].sort(), [...teamOverdue].sort())
  })

  test("VIEWER: 1:1 privado não resolve alerta que ele vê; nenhum texto vem de registro privado", async () => {
    const asOwner = await getAlerts(ownerViewer)
    const asViewer = await getAlerts(viewerOnly)
    const late = (r: typeof asOwner) => new Set(r.alerts.filter((a) => a.kind === "lateOneOnOne" || a.kind === "silence").map((a) => a.member!.id))
    for (const id of late(asOwner)) assert.ok(late(asViewer).has(id), "o que é atraso para o gestor também é para o VIEWER")
    const privateBehaviors = await db.feedback.findMany({ where: { visibility: "PRIVATE" }, select: { behavior: true } })
    const viewerTexts = asViewer.alerts.map((a) => a.text).join("\n")
    for (const f of privateBehaviors) assert.ok(!viewerTexts.includes(f.behavior.split("\n")[0]!.trim()), "follow-up de feedback privado vazou")
  })
})

describe("limiares em /settings", () => {
  test("fora da faixa recusa; grava, audita, muda o motor; voltar ao padrão apaga a linha; VIEWER não altera", async () => {
    assert.equal((await setThresholdRecord(ownerViewer, { key: "silenceDays", value: 2 })).ok, false)
    assert.equal((await setThresholdRecord(ownerViewer, { key: "naoExiste", value: 10 })).ok, false)
    await assert.rejects(setThresholdRecord(viewerOnly, { key: "silenceDays", value: 40 }), { name: "ForbiddenError" })

    assert.ok((await setThresholdRecord(ownerViewer, { key: "oneOnOneDays.JUNIOR", value: 60 })).ok)
    assert.equal((await getThresholds(ownerViewer)).oneOnOneDays.JUNIOR, 60)
    const { alerts } = await getAlerts(ownerViewer)
    assert.ok(!alerts.some((a) => a.kind === "lateOneOnOne" && a.member?.preferredName === "Beatriz"), "Beatriz (Júnior, ~44 dias) sai com 60")
    const audit = await dbIncludingDeleted.auditLog.findFirstOrThrow({
      where: { action: "settings.alertThreshold.update", entityId: "oneOnOneDays.JUNIOR" },
      orderBy: { at: "desc" },
    })
    assert.deepEqual(audit.after, { value: 60, custom: true })

    assert.ok((await setThresholdRecord(ownerViewer, { key: "oneOnOneDays.JUNIOR", value: null })).ok)
    assert.equal(await db.alertThreshold.count({ where: { teamId: ownerViewer.teamId } }), 0)
    assert.ok((await setThresholdRecord(ownerViewer, { key: "silenceDays", value: 30 })).ok, "o próprio padrão não cria linha")
    assert.equal(await db.alertThreshold.count({ where: { teamId: ownerViewer.teamId } }), 0)
  })

  test("/team usa os mesmos limiares (crônico em 5 tira o motivo do Diego)", async () => {
    const before = (await listTeamMembers(ownerViewer)).find((r) => r.preferredName === "Diego")
    assert.ok(before?.attention?.reasons.some((r) => /reagendado/.test(r.text)))
    assert.ok((await setThresholdRecord(ownerViewer, { key: "chronicReschedules", value: 5 })).ok)
    const after = (await listTeamMembers(ownerViewer)).find((r) => r.preferredName === "Diego")
    assert.ok(!after?.attention?.reasons.some((r) => /reagendado/.test(r.text)))
    assert.ok((await setThresholdRecord(ownerViewer, { key: "chronicReschedules", value: null })).ok)
    // memberAttention puro com o limiar padrão continua marcando.
    const reason = memberAttention(
      {
        seniorityKey: "PLENO",
        seniorityLabel: "Pleno",
        joinedAt: todayBusinessDate(),
        lastOneOnOne: todayBusinessDate(),
        overdueAgreements: 0,
        oldestOverdueDue: null,
        dueSoonAgreements: 0,
        chronicAgreements: 1,
        oldestPlanReview: null,
      },
      todayBusinessDate(),
    )
    assert.ok(reason)
  })
})

describe("critério de aceite e D9", () => {
  test("a home tem no máximo duas superfícies delimitadas e não é grade de cards", () => {
    const sources = ["src/app/(app)/page.tsx", "src/components/today/alert-list.tsx"].map((p) => readFileSync(p, "utf8"))
    // Superfície delimitada = contêiner com borda nos quatro lados e canto arredondado.
    const surfaces = sources.join("\n").match(/rounded-lg border border-line/g) ?? []
    // A lista e o estado vazio são alternativos (nunca os dois na tela).
    assert.ok(surfaces.length <= 2, `superfícies: ${surfaces.length}`)
    assert.ok(!/grid-cols-(3|4)/.test(sources[0]!), "sem grade de cards de KPI")
  })

  test("alertas não são persistidos: sem tabela de alerta e sem escrita no motor", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8")
    assert.ok(!/^model Alert\s/m.test(schema))
    for (const file of ["src/server/alerts.ts", "src/server/queries/alerts.ts", "src/server/queries/today.ts"]) {
      assert.ok(!/\.(create|update|upsert|delete)(Many)?\(/.test(readFileSync(file, "utf8")), file)
    }
  })
})
