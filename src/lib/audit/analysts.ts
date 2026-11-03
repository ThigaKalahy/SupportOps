import { nameKey } from "./parser.ts"

/**
 * C23 — quem é o analista de uma conversa. Ordem de confiança:
 * 1. apelido cadastrado no lote ("Analistas não reconhecidos");
 * 2. nome completo igual ao cadastro (sem acento, sem caixa);
 * 3. PRIMEIRO NOME — decisão do usuário em 05/11/2026: não há homônimos no time, então o primeiro
 *    nome basta. Vale o primeiro nome do nome completo e o nome preferido. Se um dia dois tiverem
 *    o mesmo primeiro nome, aquele nome fica ambíguo e NINGUÉM é escolhido (vira "não reconhecido",
 *    e o apelido resolve) — nunca se adivinha entre dois.
 */

export interface AnalystCandidate {
  id: string
  fullName: string
  preferredName: string
}

const firstToken = (name: string) => nameKey(name).split(" ")[0] ?? ""

export function buildAnalystMatcher(members: AnalystCandidate[], aliases: { aliasKey: string; memberId: string }[]) {
  const byAlias = new Map(aliases.map((a) => [a.aliasKey, a.memberId]))
  const byFull = new Map<string, string | null>()
  const byFirst = new Map<string, string | null>()
  const add = (map: Map<string, string | null>, key: string, id: string) => {
    if (!key) return
    const current = map.get(key)
    // Mesmo nome para duas pessoas: ambíguo (null). A mesma pessoa duas vezes não conta.
    map.set(key, current === undefined || current === id ? id : null)
  }
  for (const m of members) {
    add(byFull, nameKey(m.fullName), m.id)
    for (const key of new Set([firstToken(m.fullName), firstToken(m.preferredName)])) add(byFirst, key, m.id)
  }
  return (name: string | null | undefined): string | null => {
    if (!name) return null
    const key = nameKey(name)
    if (byAlias.has(key)) return byAlias.get(key)!
    const full = byFull.get(key)
    if (full) return full
    return byFirst.get(firstToken(name)) ?? null
  }
}
