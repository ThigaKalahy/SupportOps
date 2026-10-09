import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, type ActionResult } from "../lib/validators/fields.ts"
import { grantTeamAccessSchema, revokeTeamAccessSchema, setTeamModuleSchema } from "../lib/validators/teams.ts"
import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { requirePlatformAdmin, type TeamContext } from "./scope.ts"

/**
 * Administração de times (P23, /settings/team): módulos e acesso. Só
 * `isPlatformAdmin`, só times e usuários da organização do contexto. O time
 * ALVO vem da tela e é conferido aqui; a auditoria grava o time alvo.
 *
 * - Desligar módulo não apaga dado (D32): só `isEnabled = false`.
 * - Revogar acesso preenche `revokedAt` e nunca apaga a linha (CLAUDE.md, regras
 *   de modelagem). Conceder de novo reabre a mesma linha (`@@unique([userId,
 *   teamId])`); a auditoria guarda cada concessão e revogação.
 */

const T = labels.settings.teamAdmin

async function teamInOrganization(ctx: TeamContext, teamId: string) {
  return db.team.findFirst({ where: { id: teamId, organizationId: ctx.organizationId }, select: { id: true, name: true } })
}

export async function setTeamModuleRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requirePlatformAdmin(ctx)
  const parsed = setTeamModuleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { teamId, moduleKey, enabled } = parsed.data
  const team = await teamInOrganization(ctx, teamId)
  if (!team) return { ok: false, error: labels.validation.generic }

  await db.$transaction(async (tx) => {
    const before = await tx.teamModule.findUnique({ where: { teamId_moduleKey: { teamId, moduleKey } }, select: { isEnabled: true } })
    await tx.teamModule.upsert({
      where: { teamId_moduleKey: { teamId, moduleKey } },
      create: { teamId, moduleKey, isEnabled: enabled, changedByUserId: ctx.userId },
      update: { isEnabled: enabled, changedByUserId: ctx.userId, ...(enabled && !before?.isEnabled ? { enabledAt: new Date() } : {}) },
    })
    await writeAudit(
      {
        action: enabled ? "team.module.enable" : "team.module.disable",
        entity: "TeamModule",
        entityId: `${teamId}:${moduleKey}`,
        before: before ? { isEnabled: before.isEnabled } : null,
        after: { isEnabled: enabled },
      },
      { organizationId: ctx.organizationId, teamId, userId: ctx.userId, tx },
    )
  })
  return { ok: true }
}

export async function grantTeamAccessRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requirePlatformAdmin(ctx)
  const parsed = grantTeamAccessSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const { teamId, userId, level } = parsed.data
  const [team, user] = await Promise.all([
    teamInOrganization(ctx, teamId),
    db.user.findFirst({ where: { id: userId, organizationId: ctx.organizationId }, select: { id: true } }),
  ])
  if (!team || !user) return { ok: false, error: labels.validation.generic }

  await db.$transaction(async (tx) => {
    const before = await tx.teamAccess.findUnique({
      where: { userId_teamId: { userId, teamId } },
      select: { id: true, level: true, revokedAt: true },
    })
    const row = await tx.teamAccess.upsert({
      where: { userId_teamId: { userId, teamId } },
      create: { userId, teamId, level, grantedByUserId: ctx.userId },
      // Reabrir um acesso revogado é uma concessão nova: nova data e novo autor.
      update:
        before && !before.revokedAt
          ? { level }
          : { level, revokedAt: null, grantedAt: new Date(), grantedByUserId: ctx.userId },
      select: { id: true },
    })
    await writeAudit(
      {
        action: before && !before.revokedAt ? "team.access.level" : "team.access.grant",
        entity: "TeamAccess",
        entityId: row.id,
        before: before ? { level: before.level, revoked: before.revokedAt !== null } : null,
        after: { userId, level },
      },
      { organizationId: ctx.organizationId, teamId, userId: ctx.userId, tx },
    )
  })
  return { ok: true }
}

export async function revokeTeamAccessRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requirePlatformAdmin(ctx)
  const parsed = revokeTeamAccessSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { teamId, userId } = parsed.data
  // Revogar a si mesmo trancaria a administração do lado de fora sem querer.
  if (userId === ctx.userId) return { ok: false, error: T.cannotRevokeSelf }
  const team = await teamInOrganization(ctx, teamId)
  if (!team) return { ok: false, error: labels.validation.generic }

  const revoked = await db.$transaction(async (tx) => {
    const access = await tx.teamAccess.findFirst({ where: { userId, teamId, revokedAt: null }, select: { id: true, level: true } })
    if (!access) return false
    await tx.teamAccess.update({ where: { id: access.id }, data: { revokedAt: new Date() } })
    await writeAudit(
      { action: "team.access.revoke", entity: "TeamAccess", entityId: access.id, before: { userId, level: access.level }, after: { revoked: true } },
      { organizationId: ctx.organizationId, teamId, userId: ctx.userId, tx },
    )
    return true
  })
  return revoked ? { ok: true } : { ok: false, error: labels.validation.generic }
}
