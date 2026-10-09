import { Prisma, type Visibility } from "@prisma/client"

import type { TeamContext } from "./scope.ts"

/**
 * VISIBILIDADE (P22, D29, D34) — o segundo gate, macio, INDEPENDENTE do escopo de
 * time: este arquivo não chama nada de src/server/scope.ts e vice-versa (só o tipo
 * do contexto é compartilhado). A composição acontece no ponto de uso:
 * `where: { ...teamScope(ctx), ...visibilityFilter(ctx), ... }`.
 *
 * MANAGER no time vê PRIVATE e SHARED; VIEWER vê só SHARED, em nenhuma superfície
 * lê PRIVATE. O nível vem de TeamAccess (`ctx.level`); `User.role` é obsoleto.
 */

/**
 * `where` de visibilidade para OneOnOne, Feedback, Note, TimelineEvent e WatchItem.
 * TODA leitura desses models passa por aqui — tests/visibility.test.ts falha se
 * alguma não passar.
 */
export function visibilityFilter(ctx: Pick<TeamContext, "level">): { visibility?: Visibility } {
  return ctx.level === "MANAGER" ? {} : { visibility: "SHARED" }
}

/**
 * Versão SQL de `visibilityFilter`, para $queryRaw. `alias` é o apelido da tabela
 * no próprio SQL (constante do código, nunca entrada do usuário).
 */
export function visibilitySql(ctx: Pick<TeamContext, "level">, alias: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Alias SQL inválido: ${alias}`)
  return ctx.level === "MANAGER" ? Prisma.empty : Prisma.sql`AND ${Prisma.raw(`"${alias}"`)}."visibility" = 'SHARED'`
}
