/**
 * C1 — prazo padrão do combinado (D28). Regras puras, sem banco: prazo hoje é
 * severidade neutra; o alerta "Combinado vencendo" não conta prazo hoje (só o
 * vencido volta à home, no dia seguinte); o WhatsApp omite o prazo igual à data
 * da daily. E, por leitura do código, os três pontos de criação nascem com a
 * data certa: daily (Seção 1 e 3) com a data da daily, criação rápida com hoje.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

import { DEFAULT_THRESHOLDS } from "../src/lib/alert-thresholds.ts"
import { deadlineSeverity } from "../src/lib/severity.ts"
import { deriveAlerts } from "../src/server/alerts.ts"
import type { AlertFacts, AlertMember } from "../src/server/queries/alerts.ts"
import { buildDailyWhatsApp } from "../src/server/whatsapp.ts"

const today = new Date(Date.UTC(2026, 9, 8))
const day = (offset: number) => new Date(Date.UTC(2026, 9, 8 + offset))

const member: AlertMember = {
  id: "Ana",
  preferredName: "Ana",
  fullName: "Ana",
  status: "ACTIVE",
  joinedAt: day(-400),
  seniorityKey: "PLENO",
  seniorityLabel: "Pleno",
  lastOneOnOne: day(-1),
  lastRecordAt: day(-1),
}

function facts(agreements: AlertFacts["agreements"]): AlertFacts {
  return { members: [member], agreements, plans: [], followUps: [], adherence: new Map(), lastDaily: today, readiness: [], devReturns: [], watchItems: [] }
}

describe("C1 — prazo padrão do combinado (D28)", () => {
  test("prazo hoje é neutro; o sinal começa no primeiro dia de atraso", () => {
    assert.equal(deadlineSeverity(today, { today }).severity, "neutral")
    assert.equal(deadlineSeverity(day(1), { today }).severity, "attention")
    const late = deadlineSeverity(day(-1), { today })
    assert.deepEqual([late.severity, late.strong, late.label], ["attention", false, "Vencido há 1 dia"])
  })

  test("criado hoje não aparece na home; amanhã aparece como vencido há 1 dia", () => {
    const agreement = { id: "a1", memberId: "Ana", title: "Finalizar tutorial", dueDate: today, reschedules: 0 }
    const now = deriveAlerts(facts([agreement]), today, DEFAULT_THRESHOLDS)
    assert.equal(now.filter((a) => a.kind === "dueSoon" || a.kind === "overdue").length, 0)
    const tomorrow = deriveAlerts(facts([agreement]), day(1), DEFAULT_THRESHOLDS)
    const overdue = tomorrow.find((a) => a.id === "overdue:a1")
    assert.ok(overdue)
    assert.equal(overdue.severity, "attention")
  })

  test("vencendo em 1 a 3 dias continua no alerta", () => {
    const alerts = deriveAlerts(
      facts([
        { id: "a1", memberId: "Ana", title: "Hoje", dueDate: today, reschedules: 0 },
        { id: "a2", memberId: "Ana", title: "Depois de amanhã", dueDate: day(2), reschedules: 0 },
      ]),
      today,
      DEFAULT_THRESHOLDS,
    )
    const soon = alerts.filter((a) => a.kind === "dueSoon")
    assert.equal(soon.length, 1)
    assert.match(soon[0]!.text, /^1 combinado/)
  })

  test("WhatsApp: prazo igual à data da daily é omitido; diferente aparece", () => {
    const text = buildDailyWhatsApp({
      date: today,
      reviewed: [],
      created: [
        { name: "Larissa", title: "Finalizar tutorial de instalação", dueDate: today },
        { name: "Vinícius", title: "Mapear chamados recorrentes", dueDate: day(2) },
      ],
      blockers: [],
    })
    assert.equal(
      text,
      "*Daily — 08/10/2026*\n\n*Combinados de hoje*\n- Larissa — Finalizar tutorial de instalação\n- Vinícius — Mapear chamados recorrentes — 10/10",
    )
  })

  test("valores iniciais: daily usa a data dela; criação rápida usa hoje; nenhum usa a próxima daily", () => {
    const form = readFileSync("src/components/dailies/daily-form.tsx", "utf8")
    assert.ok(!/nextDaily|nextBusinessDay/.test(form))
    assert.match(form, /initialState\(form, dateText\)/)
    assert.match(form, /newDueDate: dailyDate/)
    assert.match(form, /newRow\(dateText\)/)
    assert.ok(!/nextDaily/.test(readFileSync("src/server/queries/dailies.ts", "utf8")))
    assert.match(readFileSync("src/components/forms/agreement-dialog.tsx", "utf8"), /dueDate: formatDate\(todayBusinessDate\(\), "business"\)/)
  })
})
