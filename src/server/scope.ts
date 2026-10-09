import { Prisma, type TeamAccessLevel } from "@prisma/client"
import { cache } from "react"

import { labels } from "../lib/labels.ts"
import type { ModuleKey } from "../lib/modules.ts"
import { db } from "./db.ts"

/**
 * ESCOPO DE TIME (P22, D29–D32, D36) — o primeiro gate, duro: sem TeamAccess, o
 * dado não existe.
 *
 * - O time ativo vem do cookie `active-team`, que é PREFERÊNCIA de navegação, não
 *   credencial: a cada requisição ele é reconfirmado contra TeamAccess
 *   (`userId`, `teamId`, `revokedAt` nulo, time ativo). Nunca é confiado do cookie
 *   nem do JWT, e a validação não é guardada na sessão (D30). O `cache` do React só
 *   evita repetir as mesmas consultas dentro de UMA requisição.
 * - Cookie ausente, inválido ou de time sem acesso: com exatamente um time, resolve
 *   para ele; com mais de um, ou com nenhum, manda para /select-team (P23), que
 *   lista os times para escolher ou diz que a conta não tem acesso. Nunca cai num
 *   padrão nem no "primeiro time que encontrar".
 * - O middleware não faz esse redirecionamento: ele roda no Edge, sem Prisma, e não
 *   tem como consultar TeamAccess. Quem decide é esta função, no servidor.
 *
 * Este arquivo NÃO conhece visibilidade, e src/server/visibility.ts não conhece
 * escopo (D29): os dois gates se compõem no ponto de uso —
 * `where: { ...teamScope(ctx), ...visibilityFilter(ctx), ... }`.
 */

export const ACTIVE_TEAM_COOKIE = "active-team"

/** Tela de escolha do time ativo (P23). Fora do shell: não depende de time ativo. */
export const SELECT_TEAM_PATH = "/select-team"

export interface TeamContext {
  userId: string
  /** Organização do time — para colunas que ainda a guardam e para a auditoria. NUNCA escopa sozinha (D36). */
  organizationId: string
  teamId: string
  level: TeamAccessLevel
  isPlatformAdmin: boolean
  /** Chaves dos módulos LIGADOS no time (src/lib/modules.ts). */
  modules: ReadonlySet<string>
}

/** Base dos erros de acesso: a mensagem é pt-BR e pode ir para a tela. */
export class ScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ScopeError"
  }
}

/** Nível ou módulo sem permissão (VIEWER escrevendo, módulo desligado). */
export class ForbiddenError extends ScopeError {
  constructor(message: string = labels.access.forbidden) {
    super(message)
    this.name = "ForbiddenError"
  }
}

/** Contexto pedido para um time sem TeamAccess válido. Erro, nunca lista vazia. */
export class TeamAccessError extends ScopeError {
  constructor() {
    super(labels.access.noTeamAccess)
    this.name = "TeamAccessError"
  }
}

/** Módulo opcional desligado no time (D32). */
export class ModuleDisabledError extends ForbiddenError {
  constructor() {
    super(labels.access.moduleDisabled)
    this.name = "ModuleDisabledError"
  }
}

/**
 * Contexto do usuário no time, conferido no banco: TeamAccess não revogado e time
 * ativo. Sem acesso, LANÇA `TeamAccessError`. Uma consulta.
 */
export async function teamContextFor(userId: string, teamId: string): Promise<TeamContext> {
  const access = await db.teamAccess.findFirst({
    where: { userId, teamId, revokedAt: null, team: { isActive: true } },
    select: {
      level: true,
      user: { select: { isPlatformAdmin: true } },
      team: { select: { organizationId: true, modules: { where: { isEnabled: true }, select: { moduleKey: true } } } },
    },
  })
  if (!access) throw new TeamAccessError()
  return {
    userId,
    organizationId: access.team.organizationId,
    teamId,
    level: access.level,
    isPlatformAdmin: access.user.isPlatformAdmin,
    modules: new Set(access.team.modules.map((m) => m.moduleKey)),
  }
}

/** Times que o usuário pode abrir agora (acesso não revogado, time ativo). */
export async function accessibleTeamIds(userId: string): Promise<string[]> {
  const rows = await db.teamAccess.findMany({
    where: { userId, revokedAt: null, team: { isActive: true } },
    select: { teamId: true },
    orderBy: { grantedAt: "asc" },
  })
  return rows.map((r) => r.teamId)
}

/** Um time que o usuário pode abrir, para a seleção e o seletor da sidebar (P23). */
export interface AccessibleTeam {
  id: string
  name: string
  level: TeamAccessLevel
  /** Pessoas ativas no time — só o número, nenhum dado delas. */
  members: number
}

/**
 * Times do usuário (TeamAccess não revogado, time ativo), em ordem de nome, com o
 * nível e a contagem de pessoas. É a única leitura que atravessa times: devolve
 * só nome e contagem dos times aos quais o próprio usuário tem acesso.
 */
export async function listAccessibleTeams(userId: string): Promise<AccessibleTeam[]> {
  const access = await db.teamAccess.findMany({
    where: { userId, revokedAt: null, team: { isActive: true } },
    select: { level: true, team: { select: { id: true, name: true } } },
  })
  const teamIds = access.map((a) => a.team.id)
  const counts = teamIds.length
    ? await db.teamMember.groupBy({ by: ["teamId"], where: { teamId: { in: teamIds }, status: { not: "INACTIVE" } }, _count: { _all: true } })
    : []
  const byTeam = new Map(counts.map((c) => [c.teamId, c._count._all]))
  return access
    .map((a) => ({ id: a.team.id, name: a.team.name, level: a.level, members: byTeam.get(a.team.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

export const ACTIVE_TEAM_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
}

/**
 * O contexto de time da requisição. Toda página, Server Action e leitura de dado de
 * time começa por aqui; queries e núcleos RECEBEM o contexto, nunca o obtêm.
 * Sem sessão, manda para /login (o `redirect` do Next lança).
 */
export const requireTeamContext = cache(async (): Promise<TeamContext> => {
  // Importações dinâmicas: este arquivo também é carregado pelos testes em Node puro,
  // onde não há sessão nem cookies de requisição.
  const { getCurrentUser } = await import("./access")
  const { cookies } = await import("next/headers")
  const { redirect } = await import("next/navigation")

  const user = await getCurrentUser()
  if (!user) return redirect("/login")

  const store = await cookies()
  const requested = store.get(ACTIVE_TEAM_COOKIE)?.value
  if (requested) {
    try {
      return await teamContextFor(user.id, requested)
    } catch (error) {
      if (!(error instanceof TeamAccessError)) throw error
      // Cookie de time sem acesso: ignorado — nunca vira credencial nem padrão.
    }
  }

  const teams = await accessibleTeamIds(user.id)
  // Nenhum time, ou mais de um sem escolha válida: a tela de seleção resolve (P23).
  if (teams.length !== 1) return redirect(SELECT_TEAM_PATH)
  const ctx = await teamContextFor(user.id, teams[0]!)
  try {
    store.set(ACTIVE_TEAM_COOKIE, ctx.teamId, ACTIVE_TEAM_COOKIE_OPTIONS)
  } catch {
    // Server Component não grava cookie; a resolução acima se repete na próxima requisição.
  }
  return ctx
})

/**
 * Contexto de quem vai ESCREVER: o time da requisição + nível MANAGER. Toda Server
 * Action de escrita começa por aqui (o núcleo confere de novo com `requireManager`).
 */
export async function requireWriteContext(): Promise<TeamContext> {
  const ctx = await requireTeamContext()
  requireManager(ctx)
  return ctx
}

/**
 * Contexto de quem administra a plataforma (P23, /settings/team): o time da
 * requisição + `isPlatformAdmin`. Não exige MANAGER no time ativo — administrar
 * times não é escrever dado de time — e não dá acesso a dado de time nenhum.
 */
export async function requireAdminContext(): Promise<TeamContext> {
  const ctx = await requireTeamContext()
  requirePlatformAdmin(ctx)
  return ctx
}

/** Só quem tem `isPlatformAdmin` cria time, concede acesso e liga módulo. */
export function requirePlatformAdmin(ctx: Pick<TeamContext, "isPlatformAdmin">): void {
  if (!ctx.isPlatformAdmin) throw new ForbiddenError()
}

/** Início de todo `where` (leitura e escrita) e de todo `data` de criação em dado de time. */
export function teamScope(ctx: Pick<TeamContext, "teamId">): { teamId: string } {
  return { teamId: ctx.teamId }
}

/**
 * Versão SQL de `teamScope`, para $queryRaw: `AND "<alias>"."teamId" = <id>`.
 * `alias` é constante do código, nunca entrada do usuário.
 */
export function teamSql(ctx: Pick<TeamContext, "teamId">, alias: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Alias SQL inválido: ${alias}`)
  return Prisma.sql`${Prisma.raw(`"${alias}"`)}."teamId" = ${ctx.teamId}`
}

/** Só MANAGER escreve. Toda Server Action e todo núcleo de escrita chamam. */
export function requireManager(ctx: Pick<TeamContext, "level">): void {
  if (ctx.level !== "MANAGER") throw new ForbiddenError()
}

/** Para a interface: ação de escrita fica AUSENTE (não desabilitada) para quem não escreve. */
export function canWrite(ctx: Pick<TeamContext, "level">): boolean {
  return ctx.level === "MANAGER"
}

/** Módulo opcional ligado no time? Para a navegação e para esconder campos. */
export function hasModule(ctx: Pick<TeamContext, "modules">, moduleKey: ModuleKey): boolean {
  return ctx.modules.has(moduleKey)
}

/** Lança se o módulo estiver desligado. No topo de toda rota, query e action do módulo (D32). */
export function requireModule(ctx: Pick<TeamContext, "modules">, moduleKey: ModuleKey): void {
  if (!ctx.modules.has(moduleKey)) throw new ModuleDisabledError()
}
