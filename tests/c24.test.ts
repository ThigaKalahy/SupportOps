/**
 * C24 — contagem de 1:1 recomeçada e troca de combinado na daily e no portal. Regras puras e
 * estrutura (sem banco).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"

import {
  decodeBusinessDate,
  DEFAULT_THRESHOLDS,
  encodeBusinessDate,
  oneOnOneClockFrom,
  resolveThresholds,
  THRESHOLD_LIMITS,
} from "../src/lib/alert-thresholds.ts"
import { dailySchema } from "../src/lib/validators/daily.ts"
import { conductDailySchema, transferOwnSchema } from "../src/lib/validators/member-portal.ts"

const SRC = join(import.meta.dirname, "..", "src")
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe("C24 — contagem de dias sem 1:1 recomeçada", () => {
  test("a data vai e volta como AAAAMMDD", () => {
    assert.equal(encodeBusinessDate(day("2026-11-11")), 20261111)
    assert.equal(decodeBusinessDate(20261111)?.toISOString(), "2026-11-11T00:00:00.000Z")
    assert.equal(decodeBusinessDate(7), null)
  })

  test("sem recomeço, conta do último 1:1 (ou da entrada); com recomeço, nunca antes dele", () => {
    const since = { oneOnOneSince: day("2026-11-11") }
    assert.equal(oneOnOneClockFrom(day("2026-08-01"), day("2025-01-01"), DEFAULT_THRESHOLDS).toISOString(), day("2026-08-01").toISOString())
    assert.equal(oneOnOneClockFrom(null, day("2025-01-01"), DEFAULT_THRESHOLDS).toISOString(), day("2025-01-01").toISOString())
    assert.equal(oneOnOneClockFrom(day("2026-08-01"), day("2025-01-01"), since).toISOString(), day("2026-11-11").toISOString())
    assert.equal(oneOnOneClockFrom(null, day("2025-01-01"), since).toISOString(), day("2026-11-11").toISOString())
    assert.equal(oneOnOneClockFrom(day("2026-11-20"), day("2025-01-01"), since).toISOString(), day("2026-11-20").toISOString(), "1:1 depois do recomeço vale")
  })

  test("a chave vem do banco sem virar limiar editável na tabela", () => {
    const t = resolveThresholds([{ key: "oneOnOneSince", value: 20261111 }])
    assert.equal(t.oneOnOneSince?.toISOString(), "2026-11-11T00:00:00.000Z")
    assert.equal(DEFAULT_THRESHOLDS.oneOnOneSince, null)
    assert.ok(!("oneOnOneSince" in THRESHOLD_LIMITS))
  })

  test("as cadências padrão de 1:1 (dias úteis) continuam: Júnior 21, Pleno e Sênior 30", () => {
    assert.deepEqual(DEFAULT_THRESHOLDS.oneOnOneDays, { JUNIOR: 21, PLENO: 30, SENIOR: 30 })
  })

  test("o motor e o perfil contam pelo recomeço", () => {
    const alerts = readFileSync(join(SRC, "server", "alerts.ts"), "utf8")
    assert.equal(alerts.match(/oneOnOneClockFrom\(/g)?.length, 3)
    assert.ok(!/businessDaysBetween\(m\.lastOneOnOne \?\? m\.joinedAt/.test(alerts))
  })
})

describe("C24 — troca de combinado na daily", () => {
  const base = {
    date: "10/11/2026",
    summary: "",
    decisions: "",
    participants: [],
    newAgreements: [],
  }
  const review = (outcome: string, action = "reschedule") => ({
    agreementId: "a1",
    outcome,
    blockerText: "Faltou acesso",
    blockerReasonId: "",
    action,
    newDueDate: "10/11/2026",
    replacementTitle: "Outro combinado",
    replacementDueDate: "10/11/2026",
  })
  const transfer = { agreementId: "a1", memberId: "m2", reason: "Ela conhece o cliente" }

  test("vale sem desfecho e com Parcial/Não feito reagendado", () => {
    assert.ok(dailySchema.safeParse({ ...base, reviews: [], transfers: [transfer] }).success)
    assert.ok(dailySchema.safeParse({ ...base, reviews: [review("NOT_DONE")], transfers: [transfer] }).success)
  })

  test("não vale com Feito nem com Substituir, e exige o motivo", () => {
    assert.equal(dailySchema.safeParse({ ...base, reviews: [review("DONE")], transfers: [transfer] }).success, false)
    assert.equal(dailySchema.safeParse({ ...base, reviews: [review("PARTIAL", "replace")], transfers: [transfer] }).success, false)
    assert.equal(dailySchema.safeParse({ ...base, reviews: [], transfers: [{ ...transfer, reason: " " }] }).success, false)
    assert.equal(dailySchema.safeParse({ ...base, reviews: [], transfers: [transfer, transfer] }).success, false, "uma troca por combinado")
  })

  test("o scrum master também troca, com motivo; o colaborador, o próprio", () => {
    assert.ok(conductDailySchema.safeParse({ draftId: "d", reviews: [], transfers: [transfer] }).success)
    assert.equal(conductDailySchema.safeParse({ draftId: "d", reviews: [], transfers: [{ ...transfer, reason: "" }] }).success, false)
    assert.ok(transferOwnSchema.safeParse(transfer).success)
    assert.equal(transferOwnSchema.safeParse({ ...transfer, reason: "ab" }).success, false)
  })

  test("a troca da daily grava o mesmo registro da tela do combinado, depois das revisões", () => {
    const source = readFileSync(join(SRC, "server", "dailies.ts"), "utf8")
    const body = source.slice(source.indexOf("async function applyTransfers"))
    for (const piece of ["agreementTransfer.create(", "moveAgreementEvents(", "timelineEventFor.agreementTransfer(", 'action: "agreement.transfer"']) {
      assert.ok(body.includes(piece), `applyTransfers sem ${piece}`)
    }
    const create = source.slice(source.indexOf("export async function createDailyRecord"))
    assert.ok(create.indexOf("applyReviews(") < create.indexOf("applyTransfers("), "o desfecho é de quem estava com o combinado")
    assert.match(readFileSync(join(SRC, "server", "member-daily.ts"), "utf8"), /transfers: data\.transfers/)
  })
})
