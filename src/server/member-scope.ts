import { cache } from "react"

import { lockCutoff } from "../lib/daily-lock.ts"
import { labels } from "../lib/labels.ts"

import { accountTier } from "./account-tier.ts"
import { isAllowedEmail } from "./allowlist.ts"
import { writeAudit, type AuditEntry } from "./audit.ts"
import { db } from "./db.ts"

/**
 * CONTEXTO DO COLABORADOR (P25, D37, D38) — o portal (/me) parte daqui, e só daqui.
 *
 * Arquivo separado de src/server/scope.ts, de propósito: o contexto do gestor
 * (`TeamContext`) e o do colaborador (`MemberContext`) não se convertem um no
 * outro. Um `MemberContext` passado a uma query do gestor faz `teamScope` lançar.
 *
 * Exige, a cada requisição: sessão, `User.isActive`, TeamAccess MEMBER não revogado
 * no time ativo e a pessoa (TeamMember) ATIVA ligada à conta. Pessoa desativada não
 * entra, mesmo com login válido — é o caminho de offboarding. O time ativo vem do
 * cookie, reconfirmado aqui; inválido, só resolve sozinho quando a conta é
 * colaboradora de exatamente um time (a mesma regra do lado do gestor). Nunca cai
 * num padrão nem no "primeiro time que achar" (D30).
 */

/** O mesmo nome do cookie de src/server/scope.ts, repetido para não importar de lá. */
const ACTIVE_TEAM_COOKIE = "active-team"

export interface MemberContext {
  /** Marca o contexto do portal: `teamScope` recusa qualquer objeto com `memberId`. */
  kind: "member"
  userId: string
  /** Organização do time — só para a auditoria. Nunca escopa (D36). */
  organizationId: string
  teamId: string
  /** A pessoa desta conta no time. */
  memberId: string
  preferredName: string
}

export type MemberAccessReason = "unauthenticated" | "inactive" | "no-access" | "no-member"

/** Sem contexto de colaborador. ERRO, nunca lista vazia. */
export class MemberAccessError extends Error {
  readonly reason: MemberAccessReason
  constructor(reason: MemberAccessReason) {
    super(reason === "no-member" ? labels.memberPortal.noMember : labels.access.noTeamAccess)
    this.name = "MemberAccessError"
    this.reason = reason
  }
}

/** Contexto do colaborador num time, conferido no banco. Lança `MemberAccessError`. */
export async function memberContextFor(userId: string, teamId: string): Promise<MemberContext> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { isActive: true } })
  if (!user?.isActive) throw new MemberAccessError("inactive")
  const access = await db.teamAccess.findFirst({
    where: { userId, teamId, level: "MEMBER", revokedAt: null, team: { isActive: true } },
    select: { team: { select: { organizationId: true } } },
  })
  if (!access) throw new MemberAccessError("no-access")
  const member = await db.teamMember.findFirst({
    where: { userId, teamId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, preferredName: true },
  })
  if (!member) throw new MemberAccessError("no-member")
  return { kind: "member", userId, organizationId: access.team.organizationId, teamId, memberId: member.id, preferredName: member.preferredName }
}

/** Times em que a conta é colaboradora (acesso não revogado, time ativo). */
export async function memberTeamIds(userId: string): Promise<string[]> {
  const rows = await db.teamAccess.findMany({
    where: { userId, level: "MEMBER", revokedAt: null, team: { isActive: true } },
    select: { teamId: true },
  })
  return rows.map((r) => r.teamId)
}

/**
 * O contexto do portal na requisição. Toda página e action do portal começa aqui.
 * Lança `MemberAccessError`; a página decide para onde mandar (login, home do gestor
 * ou o aviso de sem acesso).
 */
export const requireMemberContext = cache(async (): Promise<MemberContext> => {
  // Importações dinâmicas: este arquivo também é carregado pelos testes em Node puro.
  const { auth } = await import("./auth")
  const { cookies } = await import("next/headers")

  const session = await auth()
  const userId = session?.user?.id
  if (!userId) throw new MemberAccessError("unauthenticated")
  // Conta fora da allowlist só passa se for SÓ colaboradora (allowlist em dois níveis).
  if (!isAllowedEmail(session.user.email)) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true } })
    if (!user || (await accountTier(userId, user.isPlatformAdmin)) !== "member") throw new MemberAccessError("unauthenticated")
  }

  const requested = (await cookies()).get(ACTIVE_TEAM_COOKIE)?.value
  if (requested) {
    try {
      return await memberContextFor(userId, requested)
    } catch (error) {
      if (!(error instanceof MemberAccessError) || error.reason !== "no-access") throw error
      // Cookie de time onde a conta não é colaboradora: ignorado, nunca vira padrão.
    }
  }
  const teams = await memberTeamIds(userId)
  if (teams.length !== 1) throw new MemberAccessError("no-access")
  return memberContextFor(userId, teams[0]!)
})

/** Início de todo `where` do portal: o time E a pessoa, sempre juntos. */
export function memberOwnScope(ctx: Pick<MemberContext, "teamId" | "memberId">): { teamId: string; memberId: string } {
  return { teamId: ctx.teamId, memberId: ctx.memberId }
}

/** Estado de travamento do time (P26, D41, D43): DRAFT aberta há menos de 4 horas. */
export interface DailyLock {
  locked: boolean
  dailyId: string | null
  openedAt: Date | null
}

/**
 * Travado quando há Daily DRAFT no time aberta há menos de 4 horas. DRAFT mais antiga
 * é daily abandonada e não trava (derivado, sem cron — D41, D9). Toda escrita do portal
 * confere isto ANTES de escrever, dentro da transação (D43).
 */
export async function getDailyLock(teamId: string, client: Pick<typeof db, "daily"> = db): Promise<DailyLock> {
  const draft = await client.daily.findFirst({
    where: { teamId, status: "DRAFT", openedAt: { gte: lockCutoff() } },
    orderBy: { openedAt: "desc" },
    select: { id: true, openedAt: true },
  })
  return { locked: draft !== null, dailyId: draft?.id ?? null, openedAt: draft?.openedAt ?? null }
}

/** Auditoria de escrita do colaborador: time, organização e a conta dele. */
export function memberAudit(ctx: MemberContext, entry: AuditEntry, tx?: Parameters<typeof writeAudit>[1]["tx"]): Promise<void> {
  return writeAudit(entry, { organizationId: ctx.organizationId, teamId: ctx.teamId, userId: ctx.userId, ...(tx ? { tx } : {}) })
}
