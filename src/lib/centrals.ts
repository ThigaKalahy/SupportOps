/**
 * Central de atendimento (P19, D20): regras puras, usadas no cliente e no
 * servidor. A UI parece texto livre; o armazenamento é normalizado pelo slug.
 */

import { labels } from "./labels.ts"

export const CENTRAL_NAME_MAX = 80
export const CENTRAL_EXTERNAL_ID_MAX = 80

/**
 * Chave de deduplicação: minúsculas, sem acento, espaços e pontuação
 * colapsados em hífen, sem hífen nas pontas. "Central Alfa", "central alfa" e
 * "Central  Alfa " dão "central-alfa". Vazio quando o nome não tem letra nem número.
 */
export function centralSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Nome como será gravado: espaços colapsados nas pontas e no meio. */
export function cleanCentralName(name: string): string {
  return name.replace(/\s+/g, " ").trim()
}

/** Busca do combobox: sem acento e sem caso, por trecho do nome. */
export function matchesCentral(name: string, query: string): boolean {
  const norm = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()
  const q = norm(query)
  return q === "" || norm(name).includes(q)
}

export interface ExistingCentral {
  id: string
  name: string
  slug: string
  isActive: boolean
}

export interface ImportPreview {
  /** Serão criadas. */
  created: { name: string; slug: string; externalId: string | null }[]
  /** Já existem pelo slug (inclusive desativadas, que NÃO são reativadas) ou repetidas na colagem: ignoradas. */
  existing: { name: string; existingName: string; inactive: boolean }[]
  /** Linhas em branco. */
  empty: number
  /** Linhas que não viram central, com o número da linha (1 = primeira). */
  invalid: { line: number; text: string; reason: "noName" | "tooLong" | "tooManyFields" | "header" }[]
}

const HEADERS = new Set(["nome", "name", "central", "centrais", "nome;externalid", "name;externalid", "nome;id", "central;id"])

/** Tira aspas de CSV simples ("Central Alfa" → Central Alfa; "" vira ") e espaços. */
function unquote(cell: string): string {
  const t = cell.trim()
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/""/g, '"').trim() : t
}

/**
 * Pré-visualização da importação por colagem: uma central por linha, em CSV de
 * uma coluna ou no formato "nome;externalId". Nunca sobrescreve nem reativa:
 * o que já existe pelo slug é ignorado. A mesma função roda no servidor na hora
 * de importar, contra a lista lida do banco.
 */
export function previewCentralImport(text: string, existing: readonly ExistingCentral[]): ImportPreview {
  const bySlug = new Map(existing.map((c) => [c.slug, c]))
  const seen = new Map<string, string>()
  const preview: ImportPreview = { created: [], existing: [], empty: 0, invalid: [] }

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1
    if (raw.trim() === "") {
      preview.empty++
      return
    }
    if (index === 0 && HEADERS.has(raw.replace(/["\s]/g, "").toLowerCase())) {
      preview.invalid.push({ line, text: raw.trim(), reason: "header" })
      return
    }
    const cells = raw.split(";")
    if (cells.length > 2) {
      preview.invalid.push({ line, text: raw.trim(), reason: "tooManyFields" })
      return
    }
    const name = cleanCentralName(unquote(cells[0] ?? ""))
    const externalId = cells.length === 2 ? unquote(cells[1] ?? "") || null : null
    const slug = centralSlug(name)
    if (!slug) {
      preview.invalid.push({ line, text: raw.trim(), reason: "noName" })
      return
    }
    if (name.length > CENTRAL_NAME_MAX || (externalId?.length ?? 0) > CENTRAL_EXTERNAL_ID_MAX) {
      preview.invalid.push({ line, text: raw.trim(), reason: "tooLong" })
      return
    }
    const known = bySlug.get(slug)
    if (known) {
      preview.existing.push({ name, existingName: known.name, inactive: !known.isActive })
      return
    }
    const repeated = seen.get(slug)
    if (repeated) {
      preview.existing.push({ name, existingName: repeated, inactive: false })
      return
    }
    seen.set(slug, name)
    preview.created.push({ name, slug, externalId })
  })
  return preview
}

/** Valor do filtro de listagem para "sem central informada" (na URL: ?central=none). */
export const CENTRAL_NONE = "none"

/** Filtro de central (id, "none" ou nada) → condição de where do Prisma. */
export function centralWhere(central: string | null): { centralId?: string | null } {
  if (!central) return {}
  return { centralId: central === CENTRAL_NONE ? null : central }
}

/** Opções do filtro de central: "sem central informada" primeiro, depois as centrais (desativada marcada). */
export function centralFilterOptions(centrals: readonly { id: string; name: string; isActive: boolean }[]): { value: string; label: string }[] {
  return [
    { value: CENTRAL_NONE, label: labels.centrals.filterNone },
    ...centrals.map((c) => ({ value: c.id, label: c.isActive ? c.name : `${c.name} (${labels.centrals.metrics.inactive})` })),
  ]
}
