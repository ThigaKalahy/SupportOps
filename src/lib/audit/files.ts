/**
 * C23 Fase C — leitura dos arquivos no NAVEGADOR (sem biblioteca): TXT soltos e ZIP com TXT.
 * Só o texto vai ao servidor, que valida tudo de novo. Proteções do ZIP: só `.txt`, nada de
 * caminho com `..`, absoluto ou de outra pasta escondida; sem criptografia; teto de arquivos,
 * de tamanho por arquivo, de total descomprimido e de taxa de compressão (ZIP bomb).
 */

export const AUDIT_FILE_LIMITS = {
  /** Arquivos por importação nesta fase (piloto). */
  maxFiles: 50,
  /** Tamanho máximo de um TXT (bytes). Uma conversa típica tem poucos KB. */
  maxFileBytes: 512 * 1024,
  /** Tamanho máximo do ZIP enviado (bytes). */
  maxZipBytes: 20 * 1024 * 1024,
  /** Soma descomprimida máxima de um ZIP (bytes). */
  maxZipTotalBytes: 30 * 1024 * 1024,
  /** Taxa máxima descomprimido/comprimido de um arquivo (acima disso, suspeita de ZIP bomb). */
  maxRatio: 100,
} as const

export interface ReadFile {
  name: string
  text: string
  encoding: string
  bytes: number
}

export interface RejectedFile {
  name: string
  reason: string
}

/** Decodifica bytes de TXT: UTF-8 (com ou sem BOM); se não for UTF-8 válido, Windows-1252. */
export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return { text: text.replace(/^﻿/, ""), encoding: "UTF-8" }
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "Windows-1252" }
  }
}

/** Nome de arquivo seguro: só `.txt`, sem caminho suspeito. Devolve o motivo da recusa, ou null. */
export function unsafeName(path: string): string | null {
  if (/\0/.test(path)) return "nome com caractere inválido"
  if (path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:/.test(path)) return "caminho absoluto"
  if (path.split(/[\\/]/).some((part) => part === "..")) return "caminho com \"..\" (path traversal)"
  if (!/\.txt$/i.test(path)) return "não é .txt"
  return null
}

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

async function inflateRaw(data: Uint8Array, expected: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    // Para no meio se passar do declarado: não confia no cabeçalho do ZIP.
    if (total > Math.min(expected, AUDIT_FILE_LIMITS.maxFileBytes)) {
      await reader.cancel()
      throw new Error("arquivo maior que o permitido")
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/** Lê os TXT de um ZIP (diretório central). Recusa o que não for seguro, com o motivo. */
export async function readZip(buffer: ArrayBuffer, zipName: string): Promise<{ files: ReadFile[]; rejected: RejectedFile[] }> {
  const files: ReadFile[] = []
  const rejected: RejectedFile[] = []
  if (buffer.byteLength > AUDIT_FILE_LIMITS.maxZipBytes) return { files, rejected: [{ name: zipName, reason: "ZIP maior que o permitido" }] }
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  // Fim do diretório central (assinatura 0x06054b50), procurado de trás para frente.
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd === -1) return { files, rejected: [{ name: zipName, reason: "ZIP inválido ou corrompido" }] }
  const count = view.getUint16(eocd + 10, true)
  let pointer = view.getUint32(eocd + 16, true)
  let total = 0
  for (let n = 0; n < count; n++) {
    if (pointer + 46 > bytes.length || view.getUint32(pointer, true) !== 0x02014b50) {
      rejected.push({ name: zipName, reason: "diretório do ZIP corrompido" })
      break
    }
    const flags = view.getUint16(pointer + 8, true)
    const method = view.getUint16(pointer + 10, true)
    const compressed = view.getUint32(pointer + 20, true)
    const size = view.getUint32(pointer + 24, true)
    const nameLength = view.getUint16(pointer + 28, true)
    const extraLength = view.getUint16(pointer + 30, true)
    const commentLength = view.getUint16(pointer + 32, true)
    const localOffset = view.getUint32(pointer + 42, true)
    const name = new TextDecoder(flags & 0x800 ? "utf-8" : "windows-1252").decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength))
    pointer += 46 + nameLength + extraLength + commentLength
    if (name.endsWith("/")) continue // pasta
    // Segurança primeiro: "../x.txt" começa com ponto e não pode passar por "arquivo oculto".
    const unsafe = unsafeName(name)
    if (unsafe) {
      rejected.push({ name, reason: unsafe })
      continue
    }
    // Metadados do macOS e arquivos ocultos: não são conversas, mas aparecem no relatório.
    if (/(^|\/)(__MACOSX\/|\.[^/]*$)/.test(name)) {
      rejected.push({ name, reason: "arquivo de sistema, ignorado" })
      continue
    }
    if (files.length + rejected.length >= AUDIT_FILE_LIMITS.maxFiles * 2) {
      rejected.push({ name, reason: "arquivos demais no ZIP" })
      continue
    }
    if (flags & 0x1) {
      rejected.push({ name, reason: "arquivo protegido por senha" })
      continue
    }
    if (size > AUDIT_FILE_LIMITS.maxFileBytes) {
      rejected.push({ name, reason: "arquivo maior que o permitido" })
      continue
    }
    if (compressed > 0 && size / compressed > AUDIT_FILE_LIMITS.maxRatio) {
      rejected.push({ name, reason: "taxa de compressão suspeita (possível ZIP bomb)" })
      continue
    }
    total += size
    if (total > AUDIT_FILE_LIMITS.maxZipTotalBytes) {
      rejected.push({ name, reason: "o ZIP descomprimido passa do limite" })
      continue
    }
    // Cabeçalho local: o nome e o extra podem ter tamanhos diferentes do diretório central.
    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      rejected.push({ name, reason: "entrada do ZIP corrompida" })
      continue
    }
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const data = bytes.subarray(dataStart, dataStart + compressed)
    try {
      const raw = method === 0 ? data.slice() : method === 8 ? await inflateRaw(data, size) : null
      if (!raw) {
        rejected.push({ name, reason: "compressão não suportada" })
        continue
      }
      const decoded = decodeText(raw)
      files.push({ name: baseName(name), text: decoded.text, encoding: decoded.encoding, bytes: raw.length })
    } catch (error) {
      rejected.push({ name, reason: error instanceof Error ? error.message : "não foi possível ler" })
    }
  }
  return { files, rejected }
}

/** Lê o que a pessoa escolheu (TXT e ZIP), com os limites. */
export async function readSelectedFiles(list: FileList | File[]): Promise<{ files: ReadFile[]; rejected: RejectedFile[] }> {
  const files: ReadFile[] = []
  const rejected: RejectedFile[] = []
  for (const file of Array.from(list)) {
    if (/\.zip$/i.test(file.name)) {
      const zip = await readZip(await file.arrayBuffer(), file.name)
      files.push(...zip.files)
      rejected.push(...zip.rejected)
      continue
    }
    const unsafe = unsafeName(file.name)
    if (unsafe) {
      rejected.push({ name: file.name, reason: unsafe })
      continue
    }
    if (file.size > AUDIT_FILE_LIMITS.maxFileBytes) {
      rejected.push({ name: file.name, reason: "arquivo maior que o permitido" })
      continue
    }
    const decoded = decodeText(new Uint8Array(await file.arrayBuffer()))
    files.push({ name: file.name, text: decoded.text, encoding: decoded.encoding, bytes: file.size })
  }
  if (files.length > AUDIT_FILE_LIMITS.maxFiles) {
    for (const extra of files.splice(AUDIT_FILE_LIMITS.maxFiles)) rejected.push({ name: extra.name, reason: `limite de ${AUDIT_FILE_LIMITS.maxFiles} arquivos por importação nesta fase` })
  }
  return { files, rejected }
}
