/**
 * Gerador mínimo de PDF, sem biblioteca: só texto e linhas, A4, com as três
 * fontes padrão do leitor (Helvetica, negrito e itálico) em WinAnsiEncoding —
 * que cobre todos os acentos do português. Não embute fonte, imagem nem
 * hiperlink: o suficiente para um relatório de leitura.
 *
 * Uso: `const doc = new PdfDocument(); doc.heading(...); doc.paragraph(...);
 * doc.toBytes()`. A quebra de linha e de página é feita aqui, pela largura
 * das fontes (tabela AFM da Helvetica).
 */

export type PdfFont = "regular" | "bold" | "italic"

/** Trecho de texto com a sua fonte; um parágrafo é uma lista deles. */
export interface PdfRun {
  text: string
  font?: PdfFont
  /** Cinza de 0 (preto) a 1 (branco). */
  gray?: number
}

const PAGE = { width: 595.28, height: 841.89 }
const MARGIN = { x: 56, top: 56, bottom: 64 }
const FONT_REF: Record<PdfFont, string> = { regular: "F1", bold: "F2", italic: "F3" }
const FONT_NAME: Record<PdfFont, string> = { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" }

// Larguras AFM (milésimos do corpo) dos caracteres 32–126.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
  611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

/** Caracteres fora do Latin-1 que o WinAnsi tem, com o byte e a largura. */
const WIN_ANSI_EXTRA: Record<string, [number, number]> = {
  "—": [0x97, 1000],
  "–": [0x96, 556],
  "•": [0x95, 350],
  "…": [0x85, 1000],
  "‘": [0x91, 222],
  "’": [0x92, 222],
  "“": [0x93, 333],
  "”": [0x94, 333],
  "€": [0x80, 556],
}

/** Sinais do Latin-1 que não são letra acentuada (a largura não vem da letra base). */
const LATIN1_WIDTH: Record<string, number> = { "·": 278, "º": 365, "ª": 370, "°": 400, "«": 556, "»": 556, "§": 556, " ": 278 }

/** Troca o que o WinAnsi não representa (emoji, setas, aspas raras) por equivalente ou "?". */
export function toWinAnsi(text: string): string {
  return [...text.normalize("NFC").replace(/\s+/g, " ")]
    .map((ch) => {
      if (ch === "→") return "->"
      const code = ch.codePointAt(0)!
      if (code >= 32 && code <= 126) return ch
      if (code >= 0xa0 && code <= 0xff) return ch
      if (ch in WIN_ANSI_EXTRA) return ch
      return "?"
    })
    .join("")
}

function charWidth(ch: string, font: PdfFont): number {
  const table = font === "bold" ? BOLD : REGULAR
  const code = ch.charCodeAt(0)
  if (code >= 32 && code <= 126) return table[code - 32]!
  const extra = WIN_ANSI_EXTRA[ch]
  if (extra) return extra[1]
  const latin = LATIN1_WIDTH[ch]
  if (latin) return latin
  // Letra acentuada: a largura da letra base.
  const base = ch.normalize("NFD")[0]!
  const baseCode = base.charCodeAt(0)
  if (baseCode >= 32 && baseCode <= 126) return table[baseCode - 32]!
  return 556
}

export function textWidth(text: string, font: PdfFont, size: number): number {
  let total = 0
  for (const ch of text) total += charWidth(ch, font)
  return (total * size) / 1000
}

/** String literal de PDF: só ASCII no arquivo, o resto em octal (byte do WinAnsi). */
function pdfString(text: string): string {
  let out = "("
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    const byte = WIN_ANSI_EXTRA[ch]?.[0] ?? code
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`
    else if (byte >= 32 && byte <= 126) out += ch
    else out += `\\${byte.toString(8).padStart(3, "0")}`
  }
  return `${out})`
}

/** Texto de metadado (Info): UTF-16BE em hexadecimal, aceita qualquer caractere. */
function pdfUnicode(text: string): string {
  let hex = "FEFF"
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase()
  return `<${hex}>`
}

const num = (n: number) => (Math.round(n * 100) / 100).toString()

interface Word {
  text: string
  font: PdfFont
  gray: number
  /** Espaço antes da palavra (falso na primeira de um trecho colado ao anterior). */
  space: boolean
}

export class PdfDocument {
  private pages: string[][] = []
  private y = 0
  readonly contentWidth = PAGE.width - MARGIN.x * 2
  private readonly title: string

  constructor(title: string) {
    this.title = title
    this.newPage()
  }

  private get ops(): string[] {
    return this.pages[this.pages.length - 1]!
  }

  private newPage() {
    this.pages.push([])
    this.y = PAGE.height - MARGIN.top
  }

  /** Garante `height` pontos livres na página; senão, começa outra. */
  ensure(height: number) {
    if (this.y - height < MARGIN.bottom) this.newPage()
  }

  space(points: number) {
    this.y -= points
  }

  private drawText(x: number, baseline: number, text: string, font: PdfFont, size: number, gray: number) {
    this.ops.push(`BT ${num(gray)} g /${FONT_REF[font]} ${num(size)} Tf ${num(x)} ${num(baseline)} Td ${pdfString(text)} Tj ET`)
  }

  /**
   * Parágrafo com quebra automática. `indent` desloca o bloco; `bullet`
   * desenha um marcador na margem do bloco e recua o texto (recuo pendente).
   */
  paragraph(runs: PdfRun[], options: { size?: number; indent?: number; bullet?: boolean; leading?: number; after?: number } = {}) {
    const size = options.size ?? 10
    const leading = options.leading ?? size * 1.4
    const indent = options.indent ?? 0
    const textIndent = indent + (options.bullet ? 12 : 0)
    const maxWidth = this.contentWidth - textIndent

    const words: Word[] = []
    for (const run of runs) {
      const text = toWinAnsi(run.text)
      const parts = text.split(" ")
      parts.forEach((part, i) => {
        if (!part) return
        const glued = i === 0 && !text.startsWith(" ") && words.length > 0
        words.push({ text: part, font: run.font ?? "regular", gray: run.gray ?? 0, space: !glued })
      })
    }
    if (words.length === 0) return

    const lines: Word[][] = [[]]
    let lineWidth = 0
    for (const word of words) {
      const line = lines[lines.length - 1]!
      const spaceWidth = line.length && word.space ? textWidth(" ", word.font, size) : 0
      const width = textWidth(word.text, word.font, size)
      if (line.length && lineWidth + spaceWidth + width > maxWidth) {
        lines.push([{ ...word, space: false }])
        lineWidth = width
      } else {
        line.push(line.length ? word : { ...word, space: false })
        lineWidth += spaceWidth + width
      }
    }

    lines.forEach((line, index) => {
      this.ensure(leading)
      const baseline = this.y - size
      if (index === 0 && options.bullet) this.drawText(MARGIN.x + indent + 2, baseline, "•", "regular", size, 0.35)
      let x = MARGIN.x + textIndent
      for (const word of line) {
        if (word.space) x += textWidth(" ", word.font, size)
        this.drawText(x, baseline, word.text, word.font, size, word.gray)
        x += textWidth(word.text, word.font, size)
      }
      this.y -= leading
    })
    this.space(options.after ?? 0)
  }

  /** Linha horizontal de largura total, logo abaixo da posição atual. */
  rule(gray = 0.8, width = 1) {
    this.ensure(4)
    const y = this.y - 2
    this.ops.push(`${num(gray)} G ${num(width)} w ${MARGIN.x} ${num(y)} m ${num(PAGE.width - MARGIN.x)} ${num(y)} l S`)
    this.y -= 4
  }

  /** O arquivo pronto. `footer(page, total)` devolve o texto da esquerda e da direita do rodapé. */
  toBytes(footer?: (page: number, total: number) => [string, string]): Uint8Array {
    const total = this.pages.length
    const objects: string[] = []
    const add = (body: string) => objects.push(body) // número do objeto = índice + 1

    add("<< /Type /Catalog /Pages 2 0 R >>")
    add("") // Pages, preenchido depois de saber os ids das páginas
    for (const font of ["regular", "bold", "italic"] as const) {
      add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAME[font]} /Encoding /WinAnsiEncoding >>`)
    }
    add(`<< /Title ${pdfUnicode(this.title)} /Producer ${pdfUnicode("Prontuário")} /CreationDate (D:${pdfDate(new Date())}) >>`)
    const infoId = objects.length

    const pageIds: number[] = []
    this.pages.forEach((ops, index) => {
      const content = [...ops]
      if (footer) {
        const [left, right] = footer(index + 1, total).map(toWinAnsi) as [string, string]
        const y = MARGIN.bottom - 32
        content.push(`BT 0.45 g /F1 8 Tf ${MARGIN.x} ${y} Td ${pdfString(left)} Tj ET`)
        const rx = PAGE.width - MARGIN.x - textWidth(right, "regular", 8)
        content.push(`BT 0.45 g /F1 8 Tf ${num(rx)} ${y} Td ${pdfString(right)} Tj ET`)
      }
      const stream = content.join("\n")
      add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
      const contentId = objects.length
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`,
      )
      pageIds.push(objects.length)
    })
    objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`

    // Tudo é ASCII (pdfString escapa o resto), então comprimento de string = bytes.
    let out = "%PDF-1.4\n"
    const offsets: number[] = []
    objects.forEach((body, index) => {
      offsets.push(out.length)
      out += `${index + 1} 0 obj\n${body}\nendobj\n`
    })
    const xref = out.length
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return new TextEncoder().encode(out)
  }
}

function pdfDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
}
