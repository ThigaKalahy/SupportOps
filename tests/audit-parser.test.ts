/**
 * C23 Fase C — leitor das conversas do SSX Desk e proteções de arquivo. Sem banco e sem IA.
 * Conversas FICTÍCIAS no mesmo formato dos arquivos reais (nada de dado de cliente aqui).
 */
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { decodeText, unsafeName } from "../src/lib/audit/files.ts"
import { nameKey, parseConversation, parseSsxDateTime } from "../src/lib/audit/parser.ts"

const CHAT = `Chat: #1001
Cliente: CENTRAL EXEMPLO
Funcionário: Joana (Atendimento)
Equipe: Carlos Teste
Início: 03/11/26, 23:50
Fim: 04/11/26, 00:20
1ª resposta: 0m 30s
Avaliação: Positiva
Tags: Dúvida, APP Mobile

===== HISTÓRICO DO CHAT =====
[23:50] Joana (Atendimento): Boa noite
O app não mostra a ignição.
Placa ABC1D23
[23:51] Carlos Teste: Boa noite, Joana. Vou verificar.
[23:58] Joana (Atendimento):
[00:05] Carlos Teste: [Áudio] "consegui ver aqui, vou abrir um chamado"
[00:06] SSX Desk: 📄 Novo chamado gerado #9001

📌 Assunto:
Ignição no app
[00:07] Fulano Externo: alguém pode me ajudar?
[00:10] Carlos Teste: Registrei no chamado #9001. Retorno em até 24h.
===== FIM DO HISTÓRICO =====

Chat finalizado em: 04/11/2026, 00:20:10
`

describe("C23 — leitor das conversas do SSX Desk", () => {
  const r = parseConversation(CHAT)

  test("lê o cabeçalho sem confundir quem fala pelo cliente com o analista", () => {
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.meta.externalId, "1001")
    assert.equal(r.meta.customerCompany, "CENTRAL EXEMPLO")
    assert.equal(r.meta.customerContact, "Joana (Atendimento)")
    assert.equal(r.meta.analystName, "Carlos Teste")
    assert.equal(r.meta.customerRating, "Positiva")
    assert.deepEqual(r.meta.tags, ["Dúvida", "APP Mobile"])
    assert.equal(r.meta.startedAt?.toISOString(), "2026-11-04T02:50:00.000Z", "23:50 de São Paulo")
  })

  test("mensagens em ordem, com remetente, continuação de linhas e virada de meia-noite", () => {
    assert.ok(r.ok)
    if (!r.ok) return
    assert.deepEqual(
      r.messages.map((m) => m.sender),
      ["CUSTOMER", "ANALYST", "CUSTOMER", "ANALYST", "SYSTEM", "UNKNOWN", "ANALYST"],
    )
    assert.deepEqual(r.messages.map((m) => m.position), [1, 2, 3, 4, 5, 6, 7])
    assert.equal(r.messages[0]!.text, "Boa noite\nO app não mostra a ignição.\nPlaca ABC1D23")
    assert.equal(r.messages[3]!.sentAt?.toISOString(), "2026-11-04T03:05:00.000Z", "00:05 já é o dia seguinte")
  })

  test("anexo sem texto, áudio transcrito e chamados (gerados e citados) são reconhecidos", () => {
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.messages[2]!.attachment, true)
    assert.equal(r.messages[3]!.audio, true)
    assert.equal(r.meta.audioCount, 1)
    assert.deepEqual(r.meta.tickets, ["#9001"])
  })

  test("remetente desconhecido não é atribuído a ninguém: vai para revisão, com aviso", () => {
    assert.ok(r.ok)
    if (!r.ok) return
    assert.deepEqual(r.meta.unknownSenders, ["Fulano Externo"])
    assert.equal(r.needsReview, true)
    assert.ok(r.warnings.some((w) => w.includes("Fulano Externo")))
  })

  test("arquivo fora do formato falha com o motivo (nunca some calado)", () => {
    const bad = parseConversation("só um texto qualquer")
    assert.equal(bad.ok, false)
    if (bad.ok) return
    assert.match(bad.error, /HISTÓRICO DO CHAT/)
    const empty = parseConversation("Chat: #1\n===== HISTÓRICO DO CHAT =====\n===== FIM DO HISTÓRICO =====\n")
    assert.equal(empty.ok, false)
  })

  test("campos ausentes ficam nulos e viram aviso (nada é inventado)", () => {
    const partial = parseConversation("===== HISTÓRICO DO CHAT =====\n[10:00] Alguém: oi\n===== FIM DO HISTÓRICO =====\n")
    assert.ok(partial.ok)
    if (!partial.ok) return
    assert.equal(partial.meta.analystName, null)
    assert.equal(partial.meta.startedAt, null)
    assert.equal(partial.messages[0]!.sentAt, null)
    assert.equal(partial.needsReview, true)
  })

  test("CRLF e BOM não atrapalham", () => {
    const crlf = parseConversation("\uFEFF" + CHAT.replace(/\n/g, "\r\n"))
    assert.ok(crlf.ok)
    if (!crlf.ok) return
    assert.equal(crlf.meta.externalId, "1001")
    assert.equal(crlf.messages.length, 7)
  })

  test("datas do SSX e chave de nome", () => {
    assert.equal(parseSsxDateTime("30/10/2026, 17:34:26")?.toISOString(), "2026-10-30T20:34:26.000Z")
    assert.equal(parseSsxDateTime("31/10/26, 10:22")?.toISOString(), "2026-10-31T13:22:00.000Z")
    assert.equal(parseSsxDateTime("ontem"), null)
    assert.equal(nameKey("  Pablo   Arregué "), "pablo arregue")
  })
})

describe("C23 — proteções de arquivo", () => {
  test("só .txt, sem caminho absoluto nem ..", () => {
    assert.equal(unsafeName("chat_1.txt"), null)
    assert.equal(unsafeName("pasta/chat_1.TXT"), null)
    assert.match(unsafeName("../../etc/passwd.txt")!, /path traversal/)
    assert.match(unsafeName("/tmp/a.txt")!, /absoluto/)
    assert.match(unsafeName("C:/a.txt")!, /absoluto/)
    assert.match(unsafeName("virus.exe")!, /\.txt/)
  })

  test("UTF-8 com BOM e Windows-1252", () => {
    const utf8 = decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Ignição")]))
    assert.deepEqual(utf8, { text: "Ignição", encoding: "UTF-8" })
    const latin = decodeText(new Uint8Array([0x49, 0x67, 0x6e, 0x69, 0xe7, 0xe3, 0x6f])) // "Ignição" em Windows-1252
    assert.deepEqual(latin, { text: "Ignição", encoding: "Windows-1252" })
  })
})

/** ZIP mínimo (deflate) montado no próprio teste: cabeçalhos locais + diretório central. */
async function buildZip(entries: { name: string; data: Uint8Array; store?: boolean }[]): Promise<ArrayBuffer> {
  const { deflateRawSync } = await import("node:zlib")
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.name)
    const body = e.store ? e.data : new Uint8Array(deflateRawSync(e.data))
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, e.store ? 0 : 8, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, e.data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(8, 0x800, true)
    cv.setUint16(10, e.store ? 0 : 8, true)
    cv.setUint32(20, body.length, true)
    cv.setUint32(24, e.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local, body)
    centrals.push(central)
    offset += local.length + body.length
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const all = [...locals, ...centrals, end]
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of all) {
    out.set(p, at)
    at += p.length
  }
  return out.buffer
}

describe("C23 — leitura de ZIP no navegador (sem biblioteca)", () => {
  test("lê os TXT e recusa, com o motivo, o que não é seguro", async () => {
    const { readZip } = await import("../src/lib/audit/files.ts")
    const enc = new TextEncoder()
    const zip = await buildZip([
      { name: "lote/chat_1.txt", data: enc.encode(CHAT) },
      { name: "chat_2.txt", data: enc.encode("texto guardado"), store: true },
      { name: "../fora.txt", data: enc.encode("x") },
      { name: "programa.exe", data: enc.encode("MZ") },
      { name: "__MACOSX/._chat_1.txt", data: enc.encode("lixo") },
    ])
    const result = await readZip(zip, "lote.zip")
    assert.deepEqual(result.files.map((f) => f.name), ["chat_1.txt", "chat_2.txt"])
    assert.equal(result.files[0]!.text, CHAT)
    assert.deepEqual(
      result.rejected.map((r) => [r.name, r.reason]),
      [
        ["../fora.txt", 'caminho com ".." (path traversal)'],
        ["programa.exe", "não é .txt"],
        ["__MACOSX/._chat_1.txt", "arquivo de sistema, ignorado"],
      ],
      "nada some calado: tudo que não entra aparece com o motivo",
    )
  })

  test("ZIP bomb (taxa de compressão absurda) é recusado sem descomprimir", async () => {
    const { readZip } = await import("../src/lib/audit/files.ts")
    const zip = await buildZip([{ name: "bomba.txt", data: new Uint8Array(400_000) }])
    const result = await readZip(zip, "bomba.zip")
    assert.equal(result.files.length, 0)
    assert.match(result.rejected[0]!.reason, /compressão suspeita/)
  })

  test("arquivo que não é ZIP vira recusa, não erro", async () => {
    const { readZip } = await import("../src/lib/audit/files.ts")
    const result = await readZip(new TextEncoder().encode("não sou zip").buffer as ArrayBuffer, "falso.zip")
    assert.equal(result.files.length, 0)
    assert.match(result.rejected[0]!.reason, /inválido/)
  })
})

describe("C23 — reconhecimento do analista (primeiro nome único no time)", () => {
  test("apelido > nome completo > primeiro nome; repetido no time não escolhe ninguém", async () => {
    const { buildAnalystMatcher } = await import("../src/lib/audit/analysts.ts")
    const match = buildAnalystMatcher(
      [
        { id: "m1", fullName: "Carlos Teste da Silva", preferredName: "Carlos" },
        { id: "m2", fullName: "Ana Exemplo", preferredName: "Aninha" },
        { id: "m3", fullName: "Bruno Um", preferredName: "Bruno" },
        { id: "m4", fullName: "Bruno Dois", preferredName: "Bruno D." },
      ],
      [{ aliasKey: "suporte noturno", memberId: "m2" }],
    )
    assert.equal(match("Carlos Teste"), "m1", "primeiro nome do nome completo")
    assert.equal(match("carlos"), "m1")
    assert.equal(match("Aninha Qualquer"), "m2", "primeiro nome do preferido")
    assert.equal(match("Ána Exemplo"), "m2", "nome completo sem acento")
    assert.equal(match("Suporte Noturno"), "m2", "apelido cadastrado")
    assert.equal(match("Bruno Três"), null, "primeiro nome repetido no time: ninguém")
    assert.equal(match("Bruno Dois"), "m4", "o nome completo ainda desempata")
    assert.equal(match("Desconhecido"), null)
    assert.equal(match(null), null)
  })
})
