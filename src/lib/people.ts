/**
 * Iniciais e cor determinística do avatar de uma pessoa.
 *
 * A cor deriva do id (mesma pessoa, mesma cor em todo o produto). Os tons são
 * dessaturados e de luminosidade fixa — fundo L 93%, texto L 30%, contraste
 * acima de 7:1 — para o avatar identificar sem competir com a cor de
 * severidade, que é a única cor com significado (DESIGN.md).
 */

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return (first + last).toUpperCase()
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Estilo inline (fundo e texto) do avatar de iniciais. */
export function avatarColors(seed: string): { backgroundColor: string; color: string } {
  const hue = hash(seed) % 360
  return { backgroundColor: `hsl(${hue} 28% 93%)`, color: `hsl(${hue} 32% 30%)` }
}
