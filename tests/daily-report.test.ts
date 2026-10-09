/**
 * PDF da daily: arquivo válido (cabeçalho, xref com offsets corretos),
 * acentos no WinAnsi, observações ativas no bloco final sem repetir o
 * contexto do que já aparece acima, aviso de observação privada e nome do
 * arquivo em DD-MM-AAAA. Sem banco.
 */
import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { describe, test } from "node:test"

import { buildDailyPdf, dailyPdfFilename, type DailyReportInput, type DailyReportWatch } from "../src/lib/daily-report.ts"
import { textWidth, toWinAnsi } from "../src/lib/pdf.ts"

const day = new Date(Date.UTC(2026, 9, 8))
const daily: DailyReportInput = {
  id: "d1",
  date: day,
  summary: "Fila estável; foco em fechar as esteiras de capacitação paradas.",
  decisions: null,
  author: "Thiago",
  present: [
    { memberId: "p", name: "Pedro", note: "Construtor de BI na Track Land: vai acompanhar a montagem do BI personalizado.", blocker: null },
    { memberId: "c", name: "Clarice", note: null, blocker: "Eventos da Smarttrucks parados: Hardware acionou a Hikvision, sem SLA." },
    { memberId: "n", name: "Natália", note: null, blocker: null },
  ],
  absent: [{ memberId: "r", name: "Rafael" }],
  reviewed: [
    { agreementId: "a1", memberId: "p", name: "Pedro", title: "Publicar a documentação de entrada e saída de áreas", outcome: "PARTIAL", blockerText: "Página não subiu no deploy da Universidade", reason: "Dependência de terceiro", newDueDate: day, replacement: null },
    { agreementId: "a2", memberId: "c", name: "Clarice", title: "Apoio pontual ao cliente Tec Pav", outcome: "DONE", blockerText: null, reason: null, newDueDate: null, replacement: null },
  ],
  created: [
    { id: "a3", memberId: "p", name: "Pedro", title: "Corrigir o relatório Aging da esteira (faixa 0–15 do NET.COM)", dueDate: day, central: "NET.COM", isReplacement: false },
    { id: "a4", memberId: "c", name: "Clarice", title: "Buscar SLA da Smarttrucks com a Karita", dueDate: new Date(Date.UTC(2026, 9, 10)), central: null, isReplacement: false },
  ],
}
const ago = (d: number) => new Date(Date.UTC(2026, 9, 8 - d))
const base = { visibility: "PRIVATE" as const, central: null, agreementId: null, dailyId: null, unreviewedDays: null, coldHighDays: null, context: null }
const watch: DailyReportWatch[] = [
  { ...base, title: "SLA da Smarttrucks travando a esteira", heat: "HIGH", member: { id: "c", preferredName: "Clarice" }, agreementId: "a4", context: "Contexto que não deve repetir", lastReviewedAt: ago(1) },
  { ...base, title: "Ritmo de fechamento de esteiras", heat: "HIGH", member: { id: "n", preferredName: "Natália" }, context: "Três suspensões na mesma semana; entender se é o cliente ou a abordagem.", lastReviewedAt: ago(4), unreviewedDays: 4 },
  { ...base, title: "Central NET.COM com muitos retornos", heat: "MEDIUM", member: null, central: { name: "NET.COM" }, context: "Acompanhar após a correção do relatório.", lastReviewedAt: ago(2) },
  { ...base, title: "Documentação da Universidade", heat: "LOW", member: null, context: "Contexto de fogo baixo fica de fora", lastReviewedAt: ago(10), visibility: "SHARED" },
]

const pdfText = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes)

describe("PDF da daily", () => {
  const bytes = buildDailyPdf(daily, watch, new Date("2026-10-08T17:30:00Z"))
  const raw = pdfText(bytes)
  if (process.env.DAILY_PDF_OUT) writeFileSync(process.env.DAILY_PDF_OUT, bytes)

  test("arquivo PDF válido: cabeçalho, fim e xref apontando para cada objeto", () => {
    assert.ok(raw.startsWith("%PDF-1.4\n"))
    assert.ok(raw.trimEnd().endsWith("%%EOF"))
    const xrefAt = Number(raw.slice(raw.lastIndexOf("startxref") + 10).trim().split("\n")[0])
    assert.ok(raw.slice(xrefAt).startsWith("xref"))
    const entries = raw.slice(xrefAt).split("\n").slice(3).filter((l) => / n $/.test(l))
    entries.forEach((line, i) => assert.ok(raw.slice(Number(line.slice(0, 10))).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1}`))
  })

  test("acentos viram bytes do WinAnsi; emoji vira ?", () => {
    assert.ok(raw.includes(String.raw`(Nat\341lia)`))
    assert.equal(toWinAnsi("ok ✅"), "ok ?")
    assert.ok(textWidth("ação", "regular", 10) > 0)
  })

  test("observação já presente na daily não repete o contexto; fogo baixo sai sem contexto", () => {
    assert.ok(!raw.includes(String.raw`n\343o deve repetir`))
    assert.ok(!raw.includes("Contexto de fogo baixo"))
    assert.ok(raw.includes("(entender)") || raw.includes("(entender"))
    assert.ok(raw.includes("(aparece)"))
  })

  test("avisa que há observação privada", () => {
    assert.ok(raw.includes("(gerencial:)"))
  })

  test("daily longa quebra em várias páginas, com rodapé numerado", () => {
    const many: DailyReportInput = {
      ...daily,
      present: Array.from({ length: 30 }, (_, i) => ({ memberId: `m${i}`, name: `Pessoa ${i}`, note: "Nota longa ".repeat(30), blocker: null })),
    }
    const text = pdfText(buildDailyPdf(many, watch))
    const pages = Number(/\/Count (\d+)/.exec(text)?.[1])
    assert.ok(pages > 2)
    assert.ok(text.includes(`(${pages})`) || text.includes(`de ${pages})`))
  })

  test("nome do arquivo em DD-MM-AAAA", () => {
    assert.equal(dailyPdfFilename(day), "daily-08-10-2026.pdf")
  })
})
