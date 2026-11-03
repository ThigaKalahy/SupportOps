/**
 * C23 Fase C — leitor das conversas exportadas do SSX Desk (um TXT por conversa). Puro, sem
 * banco: roda no navegador (pré-visualização) e de novo no servidor (o servidor nunca confia
 * no que o navegador leu). Formato validado com arquivos reais em 04/11/2026:
 *
 *   Chat: #6113                      → identificador
 *   Cliente: IM SAT TELEMETRIA       → empresa cliente (a central)
 *   Funcionário: Italo               → quem fala PELO CLIENTE (não é o nosso analista)
 *   Equipe: Pablo Arregue            → o ANALISTA do Suporte
 *   Início: 30/10/26, 16:11 · Fim: … · 1ª resposta: 0m 24s · Avaliação: Positiva · Tags: A, B
 *   ===== HISTÓRICO DO CHAT =====
 *   [16:11] Italo: Boa tarde          → mensagem; linha sem "[HH:MM]" continua a anterior
 *   [16:19] SSX Desk: …               → mensagem automática
 *   ===== FIM DO HISTÓRICO =====
 *   Chat finalizado em: 30/10/2026, 17:34:26
 *
 * Nada é inventado: campo ausente fica nulo e vira aviso. Remetente que não é o cliente, o
 * analista nem o sistema fica "não identificado" e a conversa vai para revisão — nunca é
 * atribuído a alguém por aproximação. Horários são de São Paulo (UTC−3, sem horário de verão).
 */

export type AuditSenderKind = "CUSTOMER" | "ANALYST" | "SYSTEM" | "UNKNOWN"

export interface ParsedMessage {
  position: number
  sender: AuditSenderKind
  authorName: string
  sentAt: Date | null
  text: string
  /** Áudio transcrito automaticamente pelo SSX (pode ter erros de transcrição). */
  audio: boolean
  /** Mensagem sem texto no export: anexo, imagem ou figurinha. */
  attachment: boolean
}

export interface ParsedMeta {
  externalId: string | null
  customerCompany: string | null
  customerContact: string | null
  analystName: string | null
  startedAt: Date | null
  endedAt: Date | null
  finishedAt: Date | null
  firstResponse: string | null
  customerRating: string | null
  tags: string[]
  /** Chamados abertos durante a conversa (ex.: "#6145"). */
  tickets: string[]
  /** Mensagens do sistema que indicam transferência de atendimento. */
  transfers: string[]
  audioCount: number
  attachmentCount: number
  /** Remetentes que não são o cliente, o analista nem o sistema. */
  unknownSenders: string[]
}

export type ParseResult =
  | { ok: true; meta: ParsedMeta; messages: ParsedMessage[]; warnings: string[]; needsReview: boolean; multipleAnalysts: boolean }
  | { ok: false; error: string; warnings: string[] }

const HISTORY_START = "===== HISTÓRICO DO CHAT ====="
const HISTORY_END = "===== FIM DO HISTÓRICO ====="
/** Remetentes automáticos do SSX Desk. */
export const SYSTEM_SENDERS = ["SSX Desk"]
const MESSAGE = /^\[(\d{2}):(\d{2})\] (.+?): ?(.*)$/

/** "30/10/26, 16:11" ou "30/10/2026, 17:34:26" → instante (horário de São Paulo, UTC−3). */
export function parseSsxDateTime(value: string | null | undefined): Date | null {
  const m = value?.trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4}),?\s+(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const iso = `${year}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? "00"}-03:00`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

const clean = (value: string | undefined) => {
  const v = value?.trim()
  return v ? v : null
}

/** Remove o BOM e normaliza quebras de linha (CRLF/CR → LF). */
export function normalizeText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
}

export function parseConversation(input: string): ParseResult {
  const text = normalizeText(input)
  const warnings: string[] = []
  const start = text.indexOf(HISTORY_START)
  if (start === -1) return { ok: false, error: "Formato não reconhecido: falta a linha \"===== HISTÓRICO DO CHAT =====\".", warnings }
  const endIndex = text.indexOf(HISTORY_END, start)
  if (endIndex === -1) warnings.push("Arquivo sem \"===== FIM DO HISTÓRICO =====\": pode estar incompleto.")

  // Cabeçalho "Chave: valor" até o histórico.
  const header = new Map<string, string>()
  for (const line of text.slice(0, start).split("\n")) {
    const i = line.indexOf(":")
    if (i > 0) header.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim())
  }
  const footer = endIndex === -1 ? "" : text.slice(endIndex + HISTORY_END.length)
  const finishedLine = footer.match(/Chat finalizado em:\s*(.+)/)

  const meta: ParsedMeta = {
    externalId: clean(header.get("chat")?.replace(/^#/, "")),
    customerCompany: clean(header.get("cliente")),
    customerContact: clean(header.get("funcionário") ?? header.get("funcionario")),
    analystName: clean(header.get("equipe")),
    startedAt: parseSsxDateTime(header.get("início") ?? header.get("inicio")),
    endedAt: parseSsxDateTime(header.get("fim")),
    finishedAt: parseSsxDateTime(finishedLine?.[1]),
    firstResponse: clean(header.get("1ª resposta") ?? header.get("1a resposta")),
    customerRating: clean(header.get("avaliação") ?? header.get("avaliacao")),
    tags: (header.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    tickets: [],
    transfers: [],
    audioCount: 0,
    attachmentCount: 0,
    unknownSenders: [],
  }
  if (!meta.externalId) warnings.push("Sem o número do chat (\"Chat: #…\").")
  if (!meta.analystName) warnings.push("Sem o analista (\"Equipe: …\"): a conversa não pode ser atribuída.")
  if (!meta.customerContact) warnings.push("Sem quem fala pelo cliente (\"Funcionário: …\").")
  if (!meta.startedAt) warnings.push("Sem data de início reconhecível (\"Início: DD/MM/AA, HH:mm\").")

  // Mensagens: "[HH:MM] Nome: texto"; linhas seguintes sem o prefixo continuam a mensagem.
  const body = text.slice(start + HISTORY_START.length, endIndex === -1 ? undefined : endIndex)
  const raw: { hh: number; mm: number; author: string; lines: string[] }[] = []
  for (const line of body.split("\n")) {
    const m = line.match(MESSAGE)
    if (m) raw.push({ hh: Number(m[1]), mm: Number(m[2]), author: m[3]!.trim(), lines: [m[4] ?? ""] })
    else if (raw.length) raw[raw.length - 1]!.lines.push(line)
    else if (line.trim()) warnings.push("Texto antes da primeira mensagem foi ignorado.")
  }
  if (!raw.length) return { ok: false, error: "Nenhuma mensagem encontrada no histórico.", warnings }

  // Data de cada mensagem: a do início; virada de meia-noite quando o horário volta.
  const base = meta.startedAt
  let dayOffset = 0
  let last = -1
  const messages: ParsedMessage[] = raw.map((r, index) => {
    const minutes = r.hh * 60 + r.mm
    if (last !== -1 && minutes < last - 60) dayOffset++
    last = minutes
    let sentAt: Date | null = null
    if (base) {
      const day = new Date(base.getTime() - 3 * 3_600_000)
      const iso = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}T${String(r.hh).padStart(2, "0")}:${String(r.mm).padStart(2, "0")}:00-03:00`
      sentAt = new Date(new Date(iso).getTime() + dayOffset * 86_400_000)
    }
    const body = r.lines.join("\n").replace(/\s+$/, "")
    const sender: AuditSenderKind = SYSTEM_SENDERS.includes(r.author)
      ? "SYSTEM"
      : r.author === meta.analystName
        ? "ANALYST"
        : r.author === meta.customerContact
          ? "CUSTOMER"
          : "UNKNOWN"
    const audio = /^\[Áudio\]/i.test(body)
    const attachment = body.trim() === ""
    if (audio) meta.audioCount++
    if (attachment) meta.attachmentCount++
    if (sender === "UNKNOWN" && !meta.unknownSenders.includes(r.author)) meta.unknownSenders.push(r.author)
    if (sender === "SYSTEM") {
      for (const t of body.matchAll(/chamado gerado\s+#(\d+)/gi)) meta.tickets.push(`#${t[1]}`)
      if (/transferi|transferência|atribuiu|atribuída/i.test(body)) meta.transfers.push(body.split("\n")[0]!.slice(0, 200))
    }
    return { position: index + 1, sender, authorName: r.author, sentAt, text: body, audio, attachment }
  })

  // Chamados citados pelo analista ("chamado #4925") também entram.
  for (const m of messages) {
    if (m.sender !== "ANALYST") continue
    for (const t of m.text.matchAll(/chamado\s+#(\d+)/gi)) if (!meta.tickets.includes(`#${t[1]}`)) meta.tickets.push(`#${t[1]}`)
  }

  if (meta.unknownSenders.length) warnings.push(`Remetente não identificado: ${meta.unknownSenders.join(", ")}. Nada foi atribuído a ele por aproximação.`)
  if (meta.audioCount) warnings.push(`${meta.audioCount} áudio(s) transcrito(s) automaticamente: a transcrição pode ter erros.`)
  if (meta.transfers.length) warnings.push("Houve transferência de atendimento: mais de um analista pode ter participado.")
  if (!messages.some((m) => m.sender === "ANALYST")) warnings.push("Nenhuma mensagem do analista do cabeçalho.")

  const multipleAnalysts = meta.transfers.length > 0
  // Revisão: só quando o leitor não tem certeza de quem disse o quê (ou a quem atribuir).
  const needsReview = meta.unknownSenders.length > 0 || !meta.analystName || multipleAnalysts
  return { ok: true, meta, messages, warnings, needsReview, multipleAnalysts }
}

/** Chave de busca de um nome (alias do analista): minúsculas, sem acento, espaços únicos. */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}
