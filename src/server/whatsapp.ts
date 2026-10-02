/**
 * Gerador do texto da daily para colar no grupo de WhatsApp.
 *
 * EXCEÇÃO EXPLÍCITA À REGRA DE EMOJI (D16): a proibição vale para a interface.
 * Este texto vai para o WhatsApp, onde emoji é idioma nativo e ajuda a varrer a
 * mensagem no grupo. ✅ ⚠️ 🔴 existem SÓ neste arquivo — nenhum componente de
 * UI usa emoji.
 *
 * Função pura, sem acesso a banco: o formulário da daily (antes de salvar) e a
 * daily já registrada geram o texto com ela. Por isso pode ser importada no
 * cliente.
 *
 * Regras: formatação nativa (*negrito*, _itálico_); seção vazia some por
 * completo; nome preferido, nunca o completo; datas em DD/MM; sem cabeçalho
 * institucional, assinatura ou rodapé. Sem link wa.me — o WhatsApp não aceita
 * texto pré-preenchido para grupos.
 */

export interface WhatsAppReview {
  name: string
  title: string
  outcome: "DONE" | "PARTIAL" | "NOT_DONE"
  blockerText?: string | null
  /** Data de negócio do novo prazo, quando reagendado. */
  newDueDate?: Date | null
  /** Combinado que substituiu este, quando substituído. */
  replacement?: { title: string; dueDate: Date } | null
}

export interface WhatsAppDaily {
  /** Data de negócio da daily. */
  date: Date
  reviewed: WhatsAppReview[]
  created: { name: string; title: string; dueDate: Date }[]
  blockers: { name: string; text: string }[]
}

const pad = (n: number) => String(n).padStart(2, "0")

/** DD/MM de uma data de negócio (meia-noite UTC). */
function dayMonth(date: Date): string {
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}`
}

function fullDate(date: Date): string {
  return `${dayMonth(date)}/${date.getUTCFullYear()}`
}

/** Remove os marcadores do WhatsApp de dentro de um texto livre, para não quebrar a formatação. */
function clean(text: string): string {
  return text.replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim()
}

const MARK = { DONE: "✅", PARTIAL: "⚠️", NOT_DONE: "⚠️" } as const

export function buildDailyWhatsApp(daily: WhatsAppDaily): string {
  const sections: string[] = [`*Daily — ${fullDate(daily.date)}*`]

  if (daily.reviewed.length) {
    const lines = ["*Combinados de ontem*"]
    for (const r of daily.reviewed) {
      lines.push(`${MARK[r.outcome]} ${clean(r.name)} — ${clean(r.title)}`)
      if (r.outcome === "DONE") continue
      if (r.blockerText) lines.push(`_Impeditivo: ${clean(r.blockerText)}_`)
      if (r.replacement) lines.push(`_Substituído por: ${clean(r.replacement.title)} — ${dayMonth(r.replacement.dueDate)}_`)
      else if (r.newDueDate) lines.push(`_Novo prazo: ${dayMonth(r.newDueDate)}_`)
    }
    sections.push(lines.join("\n"))
  }

  if (daily.created.length) {
    sections.push(
      ["*Combinados de hoje*", ...daily.created.map((c) => `- ${clean(c.name)} — ${clean(c.title)} — ${dayMonth(c.dueDate)}`)].join(
        "\n",
      ),
    )
  }

  if (daily.blockers.length) {
    sections.push(["*Bloqueios*", ...daily.blockers.map((b) => `🔴 ${clean(b.name)} — ${clean(b.text)}`)].join("\n"))
  }

  return sections.join("\n\n")
}
