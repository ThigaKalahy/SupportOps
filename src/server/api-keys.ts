import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, type ActionResult } from "../lib/validators/fields.ts"
import { createApiKeySchema, revokeApiKeySchema } from "../lib/validators/teams.ts"

import { isAllowedEmail } from "./allowlist.ts"
import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { requirePlatformAdmin, teamContextFor, ScopeError, type TeamContext } from "./scope.ts"

/**
 * C22 — chaves da API de combinados (exceção à D8 autorizada pelo usuário em 03/11/2026).
 *
 * - Criar e revogar: só `isPlatformAdmin` (Configurações › Times e acessos), para um time da
 *   organização e um DONO com nível MANAGER nesse time. A chave age em nome do dono.
 * - Formato `mo_<prefixo>_<segredo>`: o prefixo (visível na lista) acha a chave; o segredo
 *   (32 bytes aleatórios) só é mostrado uma vez. No banco, só o SHA-256 da chave inteira —
 *   alta entropia, então hash rápido basta (não é senha escolhida por gente).
 * - Cada chamada monta o contexto do DONO pelo caminho normal (`teamContextFor`: TeamAccess
 *   não revogado, conta ativa) e confere a allowlist dele: tirar o e-mail de ALLOWED_EMAILS,
 *   revogar o acesso ou desativar a conta derruba a chave junto. Nunca há contexto sem dono.
 */

const T = labels.settings.teamAdmin.apiKeys

function hash(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

export type CreatedApiKey = { ok: true; id: string; key: string; prefix: string }

/** Gera a chave de um time para um dono (MANAGER no time). A chave volta UMA vez. */
export async function createApiKeyRecord(ctx: TeamContext, input: unknown): Promise<CreatedApiKey | Extract<ActionResult, { ok: false }>> {
  requirePlatformAdmin(ctx)
  const parsed = createApiKeySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const { teamId, userId, name } = parsed.data
  const team = await db.team.findFirst({ where: { id: teamId, organizationId: ctx.organizationId }, select: { id: true } })
  if (!team) return { ok: false, error: labels.validation.generic }
  const owner = await db.teamAccess.findFirst({
    where: { teamId, userId, level: "MANAGER", revokedAt: null, user: { isActive: true } },
    select: { userId: true },
  })
  if (!owner) return { ok: false, error: T.ownerMustManage, fieldErrors: { userId: T.ownerMustManage } }

  const prefix = randomBytes(5).toString("hex")
  const key = `mo_${prefix}_${randomBytes(32).toString("base64url")}`
  const created = await db.$transaction(async (tx) => {
    const row = await tx.apiKey.create({
      data: { teamId, name, prefix, keyHash: hash(key), userId, createdByUserId: ctx.userId },
      select: { id: true },
    })
    // Nunca a chave nem o hash no log: só o prefixo, o dono e o nome.
    await writeAudit(
      { action: "api.key.create", entity: "ApiKey", entityId: row.id, after: { name, prefix, ownerUserId: userId } },
      { organizationId: ctx.organizationId, teamId, userId: ctx.userId, tx },
    )
    return row
  })
  return { ok: true, id: created.id, key, prefix }
}

/** Revoga: preenche `revokedAt` (nunca apaga) — a chave para de funcionar na hora. */
export async function revokeApiKeyRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requirePlatformAdmin(ctx)
  const parsed = revokeApiKeySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const row = await db.apiKey.findFirst({
    where: { id: parsed.data.id, teamId: parsed.data.teamId, revokedAt: null, team: { organizationId: ctx.organizationId } },
    select: { id: true, teamId: true, prefix: true },
  })
  if (!row) return { ok: false, error: labels.validation.generic }
  await db.$transaction(async (tx) => {
    await tx.apiKey.updateMany({ where: { id: row.id, teamId: row.teamId, revokedAt: null }, data: { revokedAt: new Date() } })
    await writeAudit(
      { action: "api.key.revoke", entity: "ApiKey", entityId: row.id, before: { prefix: row.prefix } },
      { organizationId: ctx.organizationId, teamId: row.teamId, userId: ctx.userId, tx },
    )
  })
  return { ok: true }
}

export type ApiAuth = { ok: true; ctx: TeamContext; keyId: string } | { ok: false; status: 401 | 403; error: string }

/**
 * Autentica uma chamada da API pelo cabeçalho `Authorization: Bearer mo_…`. Chave errada,
 * revogada ou de dono sem acesso: 401, sempre com a mesma mensagem (não diz qual parte falhou).
 */
export async function authenticateApiKey(authorization: string | null): Promise<ApiAuth> {
  const denied = { ok: false as const, status: 401 as const, error: T.unauthorized }
  const key = authorization?.match(/^Bearer\s+(mo_([0-9a-f]{10})_[A-Za-z0-9_-]{20,})$/)
  if (!key) return denied
  // A chave identifica o time: a busca pelo prefixo é o que ESTABELECE o escopo (exceção explícita no teste estrutural).
  const row = await db.apiKey.findUnique({
    where: { prefix: key[2]! },
    select: { id: true, teamId: true, keyHash: true, revokedAt: true, lastUsedAt: true, user: { select: { id: true, email: true } } },
  })
  if (!row || row.revokedAt) return denied
  const given = Buffer.from(hash(key[1]!), "hex")
  const stored = Buffer.from(row.keyHash, "hex")
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return denied
  if (!isAllowedEmail(row.user.email)) return denied

  let ctx: TeamContext
  try {
    ctx = await teamContextFor(row.user.id, row.teamId)
  } catch (error) {
    if (error instanceof ScopeError) return denied
    throw error
  }
  // Uso registrado no máximo uma vez por minuto (a lista mostra "último uso").
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.apiKey.updateMany({ where: { id: row.id, teamId: row.teamId }, data: { lastUsedAt: new Date() } })
  }
  return { ok: true, ctx, keyId: row.id }
}
