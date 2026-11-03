/**
 * C23 Fase D — minimização e mascaramento do texto que vai à IA (documento do módulo, seção 14).
 * Puro, sem banco. Ligado por padrão (`AuditConfig.maskPersonalData`).
 *
 * Mascara: e-mail, CPF, CNPJ, telefone, CEP, placa de veículo (antiga e Mercosul), IMEI/números
 * longos e os NOMES conhecidos da conversa (analista e quem fala pelo cliente). A avaliação não
 * precisa de nenhum deles: o marcador ([CPF], [PLACA]…) preserva o sentido ("o analista pediu a
 * placa"). Nome solto no meio do texto que não seja um desses fica — o mascaramento é de
 * padrões, não promete pegar tudo; por isso a tela mostra o texto exato que seria enviado.
 */

export type MaskKind = "EMAIL" | "CPF" | "CNPJ" | "TELEFONE" | "CEP" | "PLACA" | "NUMERO" | "ANALISTA" | "CLIENTE"

export type MaskCounts = Partial<Record<MaskKind, number>>

/** Ordem importa: o mais específico antes (CNPJ antes de CPF, CPF antes de telefone…). */
const PATTERNS: [MaskKind, RegExp][] = [
  ["EMAIL", /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu],
  ["CNPJ", /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g],
  ["CPF", /\b\d{3}\.\d{3}\.\d{3}-?\d{2}\b|\b\d{3}\d{3}\d{3}\d{2}\b/g],
  ["NUMERO", /\b\d{12,}\b/g],
  ["TELEFONE", /(?:\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?(?:9[\s-]?)?\d{4}[\s-]?\d{4}\b/g],
  ["CEP", /\b\d{5}-\d{3}\b/g],
  ["PLACA", /\b[A-Za-z]{3}-?\d[A-Za-z0-9]\d{2}\b/g],
]

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Nome sem o que vem entre parênteses ("Joana (Atendimento)" → "Joana"). */
function bareName(name: string): string {
  return name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Variações de um nome conhecido que serão trocadas pelo marcador: o nome completo e o primeiro
 * nome (com 3+ letras). Mais longas primeiro, para "Pablo Arregue" não virar "[ANALISTA] Arregue".
 */
export function nameVariants(name: string | null | undefined): string[] {
  if (!name) return []
  const full = bareName(name)
  if (full.length < 3) return []
  const first = full.split(" ")[0] ?? ""
  return [...new Set([full, first.length >= 3 ? first : ""].filter(Boolean))].sort((a, b) => b.length - a.length)
}

export interface MaskOptions {
  analystName?: string | null
  customerContact?: string | null
}

export function maskText(text: string, options: MaskOptions = {}, counts: MaskCounts = {}): string {
  let out = text
  for (const [kind, pattern] of PATTERNS) {
    out = out.replace(pattern, () => {
      counts[kind] = (counts[kind] ?? 0) + 1
      return `[${kind}]`
    })
  }
  const names: [MaskKind, string[]][] = [
    ["ANALISTA", nameVariants(options.analystName)],
    ["CLIENTE", nameVariants(options.customerContact)],
  ]
  for (const [kind, variants] of names) {
    for (const variant of variants) {
      // Fronteira de palavra que entende acento (\b do JS não entende).
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(variant)}(?![\\p{L}\\p{N}])`, "giu")
      out = out.replace(pattern, () => {
        counts[kind] = (counts[kind] ?? 0) + 1
        return `[${kind}]`
      })
    }
  }
  return out
}
