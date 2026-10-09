import type { CheckinOutcome, WatchHeat } from "@prisma/client"

import { formatDate, formatDateTime, formatDayMonth } from "./dates.ts"
import { enumLabel, fill, labels, plural } from "./labels.ts"
import { PdfDocument, type PdfRun } from "./pdf.ts"
import { WATCH_HEATS } from "./watch.ts"

/**
 * PDF da daily, no modelo que o time de treinamento já usa (uma seção por
 * pessoa: o que foi entregue do combinado anterior, a nota e o que fica para
 * hoje), mais resumo, decisões e o bloco final "Em observação".
 *
 * Diferente do WhatsApp (D25), o PDF inclui TODAS as observações ativas que
 * quem gera pode ler — para o gestor, inclusive as privadas (decisão do
 * usuário em 08/10/2026); o documento avisa isso no topo. Para o VIEWER, a
 * query já entrega só as compartilhadas.
 *
 * Redundância: observação ligada a um combinado ou nota que aparece nesta
 * daily ganha a marca "em observação" na linha da pessoa e, no bloco final,
 * entra só com grau e título, apontando para cima — sem repetir o contexto.
 * As demais entram com o contexto, exceto fogo baixo (só o título), para o
 * bloco não crescer demais.
 */

/** O que o PDF lê da daily — `DailyDetail` (src/server/queries/dailies.ts) satisfaz. */
export interface DailyReportInput {
  id: string
  date: Date
  summary: string | null
  decisions: string | null
  author: string
  present: { memberId: string; name: string; note: string | null; blocker: string | null }[]
  absent: { memberId: string; name: string }[]
  reviewed: {
    agreementId: string
    memberId: string
    name: string
    title: string
    outcome: CheckinOutcome
    blockerText: string | null
    reason: string | null
    newDueDate: Date | null
    replacement: { title: string; dueDate: Date } | null
  }[]
  created: { id: string; memberId: string; name: string; title: string; dueDate: Date; central: string | null; isReplacement: boolean }[]
}

export interface DailyReportWatch {
  title: string
  context: string | null
  heat: WatchHeat
  visibility: "PRIVATE" | "SHARED"
  member: { id: string; preferredName: string } | null
  central: { name: string } | null
  agreementId: string | null
  dailyId: string | null
  lastReviewedAt: Date
  /** Dias desde a última revisão, quando passou da cadência do grau. */
  unreviewedDays: number | null
  coldHighDays: number | null
}

const P = labels.dailies.pdf
const CONTEXT_MAX = 180

const dayMonth = (date: Date) => formatDayMonth(date, "business")

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/** Nome do arquivo em DD-MM-AAAA (padrão brasileiro também no nome). */
export function dailyPdfFilename(date: Date): string {
  return `daily-${formatDate(date, "business").replaceAll("/", "-")}.pdf`
}

export function buildDailyPdf(daily: DailyReportInput, watch: DailyReportWatch[], generatedAt = new Date()): Uint8Array {
  const date = formatDate(daily.date, "business")
  const doc = new PdfDocument(fill(P.title, { date }))

  // Observações que já aparecem nesta daily: por combinado e pela nota da pessoa.
  const agreementIds = new Set([...daily.reviewed.map((r) => r.agreementId), ...daily.created.map((c) => c.id)])
  const byAgreement = new Map<string, DailyReportWatch>()
  const byNote = new Map<string, DailyReportWatch>()
  for (const item of watch) {
    if (item.agreementId && agreementIds.has(item.agreementId) && !byAgreement.has(item.agreementId)) byAgreement.set(item.agreementId, item)
    else if (item.dailyId === daily.id && item.member && !byNote.has(item.member.id)) byNote.set(item.member.id, item)
  }
  const watchTag = (item: DailyReportWatch | undefined): PdfRun[] =>
    item ? [{ text: ` · ${fill(P.watching, { heat: labels.watch.heat[item.heat].toLowerCase() })}`, font: "italic", gray: 0.35 }] : []

  // Cabeçalho
  doc.paragraph([{ text: fill(P.title, { date }), font: "bold" }], { size: 18, after: 4 })
  const meta = [fill(P.author, { name: daily.author }), plural(P.present, daily.present.length)]
  if (daily.absent.length) meta.push(fill(P.absent, { names: daily.absent.map((a) => a.name).join(", ") }))
  doc.paragraph([{ text: meta.join(" · "), gray: 0.4 }], { size: 9 })
  if (watch.some((w) => w.visibility === "PRIVATE")) {
    doc.paragraph([{ text: P.privateWarning, font: "italic", gray: 0.4 }], { size: 9 })
  }
  doc.space(14)

  // Uma seção por pessoa: presentes e quem teve combinado revisado ou criado.
  const people = new Map<string, string>()
  for (const p of daily.present) people.set(p.memberId, p.name)
  for (const r of daily.reviewed) people.set(r.memberId, r.name)
  for (const c of daily.created) people.set(c.memberId, c.name)
  const silent: string[] = []

  for (const [memberId, name] of [...people].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))) {
    const participant = daily.present.find((p) => p.memberId === memberId)
    const reviewed = daily.reviewed.filter((r) => r.memberId === memberId)
    const created = daily.created.filter((c) => c.memberId === memberId)
    const noteText = participant?.blocker ?? participant?.note ?? null
    if (!reviewed.length && !created.length && !noteText) {
      silent.push(name)
      continue
    }

    doc.ensure(64)
    doc.paragraph([{ text: name, font: "bold" }], { size: 12 })
    doc.rule()
    doc.space(4)

    if (reviewed.length) {
      section(doc, P.reviewed)
      for (const r of reviewed) {
        const runs: PdfRun[] = [{ text: enumLabel("checkinOutcome", r.outcome), font: "bold" }, { text: ` — ${r.title}` }]
        if (r.outcome !== "DONE") {
          const details: string[] = []
          if (r.blockerText) details.push(fill(P.blockerText, { text: r.reason ? `${r.blockerText} (${r.reason})` : r.blockerText }))
          if (r.replacement) details.push(fill(P.replacedBy, { title: r.replacement.title, date: dayMonth(r.replacement.dueDate) }))
          else if (r.newDueDate) details.push(fill(P.newDue, { date: dayMonth(r.newDueDate) }))
          if (details.length) runs.push({ text: `. ${details.join(". ")}`, gray: 0.25 })
        }
        doc.paragraph([...runs, ...watchTag(byAgreement.get(r.agreementId))], { bullet: true, after: 2 })
      }
      doc.space(4)
    }

    if (noteText) {
      section(doc, P.note)
      const lines = noteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      lines.forEach((line, index) => {
        const runs: PdfRun[] = participant?.blocker && index === 0 ? [{ text: P.blocker, font: "bold" }, { text: ` ${line}` }] : [{ text: line }]
        doc.paragraph([...runs, ...(index === lines.length - 1 ? watchTag(byNote.get(memberId)) : [])], { bullet: true, after: 2 })
      })
      doc.space(4)
    }

    const fresh = created.filter((c) => !c.isReplacement)
    if (fresh.length) {
      section(doc, fill(P.created, { date: dayMonth(daily.date) }))
      for (const c of fresh) {
        let text = c.title
        if (c.central) text += ` — ${c.central}`
        if (c.dueDate.getTime() !== daily.date.getTime()) text += ` — ${fill(P.due, { date: dayMonth(c.dueDate) })}`
        doc.paragraph([{ text }, ...watchTag(byAgreement.get(c.id))], { bullet: true, after: 2 })
      }
      doc.space(4)
    }
    doc.space(10)
  }

  if (silent.length) {
    doc.paragraph([{ text: fill(P.noRecord, { names: silent.join(", ") }), gray: 0.4 }], { size: 9, after: 14 })
  }

  for (const [title, text] of [
    [P.summary, daily.summary],
    [P.decisions, daily.decisions],
  ] as const) {
    if (!text?.trim()) continue
    doc.ensure(48)
    doc.paragraph([{ text: title, font: "bold" }], { size: 12 })
    doc.rule()
    doc.space(4)
    for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) doc.paragraph([{ text: line }], { after: 3 })
    doc.space(10)
  }

  // Em observação
  doc.ensure(64)
  doc.paragraph([{ text: P.watchTitle, font: "bold" }], { size: 12 })
  doc.rule()
  doc.space(2)
  if (!watch.length) {
    doc.paragraph([{ text: P.watchEmpty, gray: 0.4 }])
  } else {
    doc.paragraph([{ text: fill(P.watchSubtitle, { count: plural(P.watchCount, watch.length) }), gray: 0.4 }], { size: 9, after: 6 })
    const sorted = [...watch].sort((a, b) => a.lastReviewedAt.getTime() - b.lastReviewedAt.getTime())
    for (const heat of WATCH_HEATS) {
      const group = sorted.filter((w) => w.heat === heat)
      if (!group.length) continue
      doc.ensure(36)
      doc.paragraph([{ text: `${labels.watch.heat[heat]} (${group.length})`, font: "bold" }], { size: 10, after: 2 })
      for (const item of group) {
        const subject = item.member?.preferredName ?? item.central?.name ?? P.watchTeam
        const runs: PdfRun[] = [{ text: subject, font: "bold" }, { text: ` — ${item.title}` }]
        const above = item.agreementId && byAgreement.get(item.agreementId) === item ? item : byNote.get(item.member?.id ?? "") === item ? item : null
        if (above) {
          runs.push({ text: ` (${item.member ? fill(P.watchAbove, { name: item.member.preferredName }) : P.watchAboveDaily})`, font: "italic", gray: 0.4 })
        } else if (item.context?.trim() && heat !== "LOW") {
          runs.push({ text: `. ${clip(item.context, CONTEXT_MAX)}`, gray: 0.25 })
        }
        const status: string[] = []
        if (item.coldHighDays !== null) status.push(fill(P.watchColdHigh, { days: item.coldHighDays }))
        else if (item.unreviewedDays !== null) status.push(fill(P.watchUnreviewed, { days: item.unreviewedDays }))
        if (status.length) runs.push({ text: ` · ${status.join(" · ")}`, font: "italic", gray: 0.35 })
        doc.paragraph(runs, { bullet: true, after: 2 })
      }
      doc.space(6)
    }
  }

  const footer = fill(P.footer, { date: formatDateTime(generatedAt) })
  return doc.toBytes((page, total) => [footer, fill(P.page, { page, total })])
}

function section(doc: PdfDocument, title: string) {
  doc.ensure(32)
  doc.paragraph([{ text: title, font: "bold", gray: 0.25 }], { size: 9, after: 2 })
}
