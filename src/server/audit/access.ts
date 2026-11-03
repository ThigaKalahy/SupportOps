import { notFound } from "next/navigation"

import { labels } from "../../lib/labels.ts"
import { MODULES } from "../../lib/modules.ts"
import { db } from "../db.ts"
import { hasModule, requireTeamContext, ScopeError, type TeamContext } from "../scope.ts"

/**
 * C23 — porta de entrada da Auditoria de Atendimentos (D47). Três travas, todas no servidor:
 * 1. contexto de GESTOR no time ativo (TeamAccess, revalidado a cada requisição — D30);
 * 2. módulo ATTENDANCE_AUDIT ligado no time (D32) — é o interruptor geral;
 * 3. a conta na lista de acesso do módulo (`AuditAccess`, pelo id, gravada só por script).
 * Esconder a aba não é proteção: toda página, action, query e exportação do módulo começa
 * por `requireAuditContext` / `auditContextFor` (teste estrutural garante).
 */

/** Contexto da auditoria: o do gestor, conferido pelas três travas. Marca de tipo própria. */
export type AuditContext = TeamContext & { readonly audit: true }

export class AuditAccessError extends ScopeError {
  constructor() {
    super(labels.audit.noAccess)
    this.name = "AuditAccessError"
  }
}

/** A conta pode abrir o módulo neste time? (para mostrar ou não a aba — nunca como única proteção) */
export async function canSeeAudit(ctx: TeamContext): Promise<boolean> {
  if (ctx.level !== "MANAGER" || !hasModule(ctx, MODULES.ATTENDANCE_AUDIT)) return false
  const access = await db.auditAccess.findFirst({ where: { teamId: ctx.teamId, userId: ctx.userId, revokedAt: null }, select: { id: true } })
  return access !== null
}

/** As três travas sobre um contexto já montado. Lança `AuditAccessError`. */
export async function auditContextFor(ctx: TeamContext): Promise<AuditContext> {
  if (!(await canSeeAudit(ctx))) throw new AuditAccessError()
  return { ...ctx, audit: true }
}

/** Para as páginas: sem acesso, a rota não existe (404) — nem confirma que o módulo existe. */
export async function requireAuditPage(): Promise<AuditContext> {
  const ctx = await requireTeamContext()
  if (!(await canSeeAudit(ctx))) notFound()
  return { ...ctx, audit: true }
}

/** Para as actions e exportações: sem acesso, ERRO (nunca lista vazia). */
export async function requireAuditContext(): Promise<AuditContext> {
  return auditContextFor(await requireTeamContext())
}
