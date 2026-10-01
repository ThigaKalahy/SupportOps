import type { Prisma } from "@prisma/client"

import { db } from "./db.ts"

/**
 * AuditLog: toda escrita grava uma entrada, sem exceção — Server Actions,
 * /settings, scripts de CLI e toda tentativa de login (CLAUDE.md).
 *
 * Nunca registre senha nem hash em `before`/`after`.
 */

/**
 * Qualquer cliente capaz de gravar no AuditLog: transação do cliente base ou
 * do cliente com extensão (`db`). Tipo estrutural de propósito — os dois têm
 * tipos de transação diferentes no Prisma.
 */
type AuditWriter = {
  auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown> }
}

export interface AuditEntry {
  action: string
  entity: string
  entityId?: string | null
  before?: Prisma.InputJsonValue | null
  after?: Prisma.InputJsonValue | null
}

export interface AuditContext {
  organizationId: string
  /** null para tentativa de login sem usuário e para os scripts de CLI. */
  userId: string | null
  /** Transação da escrita auditada, para a entrada nascer e morrer com ela. */
  tx?: AuditWriter
}

export async function writeAudit(entry: AuditEntry, context: AuditContext): Promise<void> {
  const client = context.tx ?? db
  await client.auditLog.create({
    data: {
      organizationId: context.organizationId,
      userId: context.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: entry.before ?? undefined,
      after: entry.after ?? undefined,
    },
  })
}

/** Organização padrão (DEFAULT_ORG_SLUG), para auditar o que não tem usuário. */
export async function defaultOrganizationId(): Promise<string> {
  const slug = process.env.DEFAULT_ORG_SLUG ?? "suporte"
  const org = await db.organization.findUnique({ where: { slug }, select: { id: true } })
  if (!org) throw new Error(`Organização "${slug}" (DEFAULT_ORG_SLUG) não existe.`)
  return org.id
}
