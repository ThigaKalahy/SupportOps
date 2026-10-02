/**
 * P12 — cumprimento de combinados. Regras puras (no prazo × atraso × aberto,
 * pendente de hoje fora do total, cancelado conta, ajustada só tira o NÃO
 * cumprido com bloqueio externo, denominador e amostra pequena, tendência e
 * queda) e as consultas sobre o seed: queda do Henrique, ajustada do Diego,
 * agregado do time sem quem tem amostra pequena, série mensal, impeditivos, e
 * o alerta de /team (SQL) coerente com as consultas.
 *
 * Usa os dados do seed (rode `pnpm db:seed` antes). Só lê.
 */
import assert from "node:assert/strict"
import { after, describe, test } from "node:test"

import {
  computeAdherence,
  isDropping,
  lastMonths,
  makeRate,
  makeTrend,
  trendWindows,
  type AdherenceAgreement,
} from "../src/lib/adherence.ts"
import { adherenceRange, parseAdherenceFilters } from "../src/lib/adherence-filters.ts"
import { todayBusinessDate } from "../src/lib/dates.ts"
import { db, dbIncludingDeleted } from "../src/server/db.ts"
import {
  getAdherence,
  getAdherenceSeries,
  getAdherenceTrend,
  getBlockerBreakdown,
  getTeamAdherence,
} from "../src/server/queries/adherence.ts"
import { listTeamMembers } from "../src/server/queries/members.ts"

const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const ownerViewer = { id: owner.id, role: owner.role, organizationId: owner.organizationId }
const viewerOnly = { id: "teste-viewer", role: "VIEWER" as const, organizationId: owner.organizationId }
const today = todayBusinessDate()
const day = (offset: number) => {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}
const ninetyDays = { from: day(-89), to: today }
const memberId = async (name: string) => (await db.teamMember.findFirstOrThrow({ where: { preferredName: name } })).id

after(async () => {
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

let seq = 0
function agreement(patch: Partial<AdherenceAgreement>): AdherenceAgreement {
  return {
    id: `a${++seq}`,
    status: "DONE",
    originalDueDate: day(-10),
    completedAt: day(-10),
    reschedules: 0,
    lastBlockerCategory: null,
    ...patch,
  }
}

describe("regras puras", () => {
  test("no prazo, com atraso, aberto vencido, cancelado; aberto com prazo hoje fica de fora", () => {
    const a = computeAdherence(
      [
        agreement({}),
        agreement({ completedAt: day(-11) }),
        agreement({ completedAt: day(-5) }),
        agreement({ status: "OPEN", completedAt: null }),
        agreement({ status: "CANCELLED", completedAt: null }),
        agreement({ status: "OPEN", completedAt: null, originalDueDate: today }),
        agreement({ status: "DONE", completedAt: today, originalDueDate: today }),
      ],
      { from: day(-30), to: today },
      today,
    )
    assert.deepEqual(
      [a.totalDue, a.doneOnTime, a.doneLate, a.stillOpen, a.cancelled, a.pending],
      [6, 3, 1, 1, 1, 1],
    )
    assert.deepEqual([a.adherenceRate.numerator, a.adherenceRate.denominator, a.adherenceRate.lowConfidence], [3, 6, false])
  })

  test("ajustada: tira só o não cumprido cujo último impeditivo é externo; nunca passa de 100%", () => {
    const a = computeAdherence(
      [
        agreement({ lastBlockerCategory: "EXTERNAL" }),
        agreement({ completedAt: day(-1), lastBlockerCategory: "EXTERNAL", reschedules: 4 }),
        agreement({ status: "OPEN", completedAt: null, lastBlockerCategory: "EXTERNAL", reschedules: 3 }),
        agreement({ status: "OPEN", completedAt: null, lastBlockerCategory: "INTERNAL", reschedules: 1 }),
        agreement({}),
      ],
      { from: day(-30), to: today },
      today,
    )
    assert.equal(a.adherenceRate.value, 2 / 5)
    assert.equal(a.adjustedTotal, 3)
    assert.equal(a.adjustedRate.value, 2 / 3)
    assert.equal(a.adjustedRate.lowConfidence, true, "denominador 3 < 5")
    assert.deepEqual([a.avgReschedules, a.maxReschedules, a.chronicCount], [8 / 5, 4, 2])
  })

  test("taxa sem denominador é null; abaixo de 5, baixa confiança; toda taxa traz o denominador", () => {
    assert.deepEqual(makeRate(0, 0), { value: null, numerator: 0, denominator: 0, lowConfidence: true })
    assert.equal(makeRate(4, 4).lowConfidence, true)
    assert.equal(makeRate(4, 5).lowConfidence, false)
  })

  test("queda: 20 pontos ou mais com 5+ combinados nas duas janelas", () => {
    assert.ok(isDropping(makeTrend(makeRate(3, 6), makeRate(5, 6))))
    assert.ok(!isDropping(makeTrend(makeRate(4, 6), makeRate(5, 6))), "17 pontos não bastam")
    assert.ok(!isDropping(makeTrend(makeRate(0, 4), makeRate(4, 4))), "amostra pequena não dispara")
    const w = trendWindows(today)
    assert.equal(w.current.to.getTime(), today.getTime())
    assert.equal((w.current.from.getTime() - w.previous.to.getTime()) / 86_400_000, 1, "janelas contíguas")
  })

  test("meses: N meses até hoje; o corrente termina hoje", () => {
    const months = lastMonths(today, 6)
    assert.equal(months.length, 6)
    assert.equal(months.at(-1)!.to.getTime(), today.getTime())
    assert.equal(months[0]!.from.getUTCDate(), 1)
  })

  test("período: padrão 90 dias; personalizado inválido volta ao padrão", () => {
    const f = parseAdherenceFilters({})
    assert.deepEqual([f.period, f.sort], ["90d", "name"])
    const r = adherenceRange(f, today)
    assert.equal((r.to.getTime() - r.from.getTime()) / 86_400_000, 89)
    assert.equal(parseAdherenceFilters({ period: "custom", from: "x" }).period, "90d")
  })
})

describe("seed", () => {
  test("Henrique: queda de 83% (5 de 6) para 50% (3 de 6) dispara o alerta, visível no cabeçalho do perfil", async () => {
    const id = await memberId("Henrique")
    const trend = await getAdherenceTrend(ownerViewer, id, today)
    assert.deepEqual(
      [trend.previous.numerator, trend.previous.denominator, trend.current.numerator, trend.current.denominator],
      [5, 6, 3, 6],
    )
    assert.equal(trend.deltaPoints, -33)
    assert.ok(isDropping(trend))
    const [row] = await listTeamMembers(ownerViewer, { id })
    assert.ok(row?.attention?.reasons.some((r) => r.text.startsWith("Cumprimento no prazo caiu de 83% para 50%")))
  })

  test("Diego: taxa ajustada claramente maior que a bruta (bloqueio externo), as duas com o denominador", async () => {
    const id = await memberId("Diego")
    const a = await getAdherence(ownerViewer, id, ninetyDays.from, ninetyDays.to, today)
    assert.ok(a.adjustedRate.value! - a.adherenceRate.value! >= 0.2, `${a.adherenceRate.value} → ${a.adjustedRate.value}`)
    assert.ok(a.adjustedRate.denominator < a.adherenceRate.denominator)
    assert.ok(a.chronicCount >= 1, "o combinado reagendado 4x")
    const blockers = await getBlockerBreakdown(ownerViewer, id, ninetyDays.from, ninetyDays.to, today)
    assert.ok(blockers.byCategory.every((c) => c.category === "EXTERNAL"))
    assert.equal(blockers.byReason.reduce((s, r) => s + r.count, 0), blockers.total)
    const counts = blockers.byReason.map((r) => r.count)
    assert.deepEqual(counts, [...counts].sort((x, y) => y - x))
  })

  test("o alerta de /team (SQL) concorda com as consultas de cumprimento para todas as pessoas", async () => {
    const team = await listTeamMembers(ownerViewer)
    for (const member of team) {
      const trend = await getAdherenceTrend(ownerViewer, member.id, today)
      const alerted = member.attention?.reasons.some((r) => r.text.startsWith("Cumprimento no prazo caiu")) ?? false
      assert.equal(alerted, isDropping(trend), member.preferredName)
    }
  })

  test("time: totais somam as pessoas; a taxa do time ignora quem tem menos de 5; ordem alfabética", async () => {
    const team = await getTeamAdherence(ownerViewer, ninetyDays.from, ninetyDays.to, today)
    const names = team.members.map((m) => m.member.preferredName)
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)))
    assert.equal(team.totalDue, team.members.reduce((s, m) => s + m.adherence.totalDue, 0))
    const sufficient = team.members.filter((m) => m.adherence.totalDue >= 5)
    assert.equal(team.teamRate.denominator, sufficient.reduce((s, m) => s + m.adherence.totalDue, 0))
    assert.equal(team.teamRate.numerator, sufficient.reduce((s, m) => s + m.adherence.doneOnTime, 0))
    assert.equal(team.excludedMembers, team.members.filter((m) => m.adherence.totalDue > 0 && m.adherence.totalDue < 5).length)
    assert.ok(team.excludedMembers > 0, "o seed tem gente com amostra pequena em 90 dias")
    assert.ok(team.topBlocker)
  })

  test("série mensal: 6 meses, o corrente até hoje, e a soma bate com o período inteiro", async () => {
    const id = await memberId("Henrique")
    const series = await getAdherenceSeries(ownerViewer, id, 6, today)
    assert.equal(series.length, 6)
    assert.equal(series.at(-1)!.to.getTime(), today.getTime())
    const whole = await getAdherence(ownerViewer, id, series[0]!.from, today, today)
    assert.equal(series.reduce((s, m) => s + m.totalDue, 0), whole.totalDue)
    assert.equal(series.reduce((s, m) => s + m.doneOnTime, 0), whole.doneOnTime)
  })

  test("VIEWER lê os mesmos números (combinado não é registro privado); nada é gravado", async () => {
    const before = await db.timelineEvent.count()
    const id = await memberId("Diego")
    assert.deepEqual(
      await getAdherence(viewerOnly, id, ninetyDays.from, ninetyDays.to, today),
      await getAdherence(ownerViewer, id, ninetyDays.from, ninetyDays.to, today),
    )
    assert.equal(await db.timelineEvent.count(), before)
  })
})
