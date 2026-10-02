import { Prisma, type Role, type Visibility } from "@prisma/client"

/**
 * Regras de leitura por papel. Puro, sem dependência de sessão: usado por
 * src/server/queries e pelos testes. Reexportado por src/server/access.ts.
 */

export interface Viewer {
  id: string
  role: Role
  organizationId: string
}

/**
 * `where` de visibilidade para OneOnOne, Feedback, Note e TimelineEvent.
 * VIEWER nunca lê registro PRIVATE, em nenhuma superfície (CLAUDE.md).
 * TODA leitura desses quatro models passa por aqui — o teste
 * tests/visibility.test.ts falha se alguma leitura não passar.
 */
export function visibilityFilter(viewer: Pick<Viewer, "role">): { visibility?: Visibility } {
  return viewer.role === "VIEWER" ? { visibility: "SHARED" } : {}
}

/**
 * Escopo de pessoas visíveis: sempre a organização do usuário. MANAGER
 * (reservado) só enxerga o próprio time.
 */
export function memberScope(viewer: Viewer): Prisma.TeamMemberWhereInput {
  if (viewer.role === "MANAGER") return { team: { organizationId: viewer.organizationId, managerUserId: viewer.id } }
  return { team: { organizationId: viewer.organizationId } }
}

/** OWNER e MANAGER escrevem; VIEWER só lê. */
export function canWrite(viewer: Pick<Viewer, "role">): boolean {
  return viewer.role === "OWNER" || viewer.role === "MANAGER"
}

/**
 * Versão SQL de `visibilityFilter`, para leituras em $queryRaw. `alias` é o
 * apelido da tabela no próprio SQL (constante do código, nunca entrada do
 * usuário). Toda consulta crua que toque OneOnOne, Feedback, Note ou
 * TimelineEvent usa esta função — o teste tests/visibility.test.ts verifica.
 */
export function visibilitySql(viewer: Pick<Viewer, "role">, alias: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Alias SQL inválido: ${alias}`)
  return viewer.role === "VIEWER"
    ? Prisma.sql`AND ${Prisma.raw(`"${alias}"`)}."visibility" = 'SHARED'`
    : Prisma.empty
}
