import { z } from "zod"

import { isModuleKey, MODULE_KEYS, type ModuleKey } from "../lib/modules.ts"
import { DEFAULT_BLOCKER_REASONS, DEFAULT_SENIORITIES, DEFAULT_WATCH_CADENCES } from "../lib/team-defaults.ts"
import { normalizeEmail } from "./allowlist.ts"
import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { generatePassword, hashPassword } from "./password.ts"

/**
 * Provisionamento de time (P24) — usado por `pnpm team:create` e
 * `pnpm team:access`, testável sem terminal.
 *
 * Abrir um time é UMA transação: o time, o gestor (reaproveitado se o e-mail já
 * existe), o acesso MANAGER dele, o VIEWER de quem já vê todos os outros times, os
 * módulos escolhidos e o mínimo para o sistema funcionar. Nada de pessoa, competência,
 * responsabilidade, registro ou demonstração (D33).
 */

export const teamCreateSchema = z.object({
  name: z.string().trim().min(2, "o nome do time é obrigatório.").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "o slug usa minúsculas, números e hífens (ex.: treinamento)."),
  managerEmail: z.string().trim().email("e-mail do gestor inválido.").transform(normalizeEmail),
  managerName: z.string().trim().max(120).default(""),
  modules: z.array(z.string()).default([]),
})

export type TeamCreateInput = z.input<typeof teamCreateSchema>

export interface TeamCreateResult {
  teamId: string
  managerUserId: string
  /** Senha gerada para o gestor — só quando a conta foi criada agora. Mostrada UMA vez. */
  managerPassword: string | null
  /** Quem ganhou VIEWER automaticamente por ser VIEWER em todos os outros times. */
  viewers: { id: string; email: string }[]
  modules: ModuleKey[]
}

export class ProvisioningError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProvisioningError"
  }
}

/** Lê a lista de módulos digitada ("PRIORITY_VALIDATION, CENTRALS"), recusando chave desconhecida. */
export function parseModuleList(raw: string): ModuleKey[] {
  const keys = raw
    .split(/[\s,;]+/)
    .map((k) => k.trim().toUpperCase())
    .filter(Boolean)
  const unknown = keys.filter((k) => !isModuleKey(k))
  if (unknown.length) throw new ProvisioningError(`módulo desconhecido: ${unknown.join(", ")}. Válidos: ${MODULE_KEYS.join(", ")}.`)
  return [...new Set(keys)] as ModuleKey[]
}

/**
 * Usuários que são VIEWER (acesso não revogado) em TODOS os times ativos da
 * organização — e há ao menos um. Quem é VIEWER de só alguns, ou MANAGER em algum,
 * fica de fora.
 */
async function viewersOfEveryTeam(tx: Tx, organizationId: string): Promise<{ id: string; email: string }[]> {
  const teams = await tx.team.findMany({ where: { organizationId, isActive: true }, select: { id: true } })
  if (teams.length === 0) return []
  const access = await tx.teamAccess.findMany({
    where: { revokedAt: null, team: { organizationId, isActive: true } },
    select: { teamId: true, level: true, user: { select: { id: true, email: true } } },
  })
  const byUser = new Map<string, { email: string; viewerTeams: Set<string>; manages: boolean }>()
  for (const a of access) {
    const entry = byUser.get(a.user.id) ?? { email: a.user.email, viewerTeams: new Set<string>(), manages: false }
    if (a.level === "VIEWER") entry.viewerTeams.add(a.teamId)
    else entry.manages = true
    byUser.set(a.user.id, entry)
  }
  return [...byUser.entries()]
    .filter(([, e]) => !e.manages && teams.every((t) => e.viewerTeams.has(t.id)))
    .map(([id, e]) => ({ id, email: e.email }))
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

export async function createTeam(
  input: TeamCreateInput,
  actor: { organizationId: string; adminUserId: string },
): Promise<TeamCreateResult> {
  const parsed = teamCreateSchema.safeParse(input)
  if (!parsed.success) throw new ProvisioningError(parsed.error.issues[0]?.message ?? "dados inválidos.")
  const { name, slug, managerEmail, managerName } = parsed.data
  const modules = parseModuleList(parsed.data.modules.join(","))
  const { organizationId, adminUserId } = actor

  const admin = await db.user.findFirst({ where: { id: adminUserId, organizationId, isPlatformAdmin: true }, select: { id: true } })
  if (!admin) throw new ProvisioningError("só quem administra a plataforma (isPlatformAdmin) abre time.")

  // Senha gerada fora da transação (bcrypt é lento); usada só se a conta for nova.
  const existingManager = await db.user.findUnique({ where: { email: managerEmail }, select: { id: true, organizationId: true } })
  if (existingManager && existingManager.organizationId !== organizationId) {
    throw new ProvisioningError("este e-mail pertence a outra organização.")
  }
  if (!existingManager && !managerName) throw new ProvisioningError("o nome do gestor é obrigatório para criar a conta.")
  const password = existingManager ? null : generatePassword()
  const passwordHash = password ? await hashPassword(password) : null

  return db.$transaction(async (tx) => {
    if (await tx.team.findFirst({ where: { organizationId, slug }, select: { id: true } })) {
      throw new ProvisioningError(`já existe um time com o slug "${slug}".`)
    }
    // Quem vê todos os times ANTES deste passa a ver este também.
    const viewers = (await viewersOfEveryTeam(tx, organizationId)).filter((v) => v.email !== managerEmail)

    const manager =
      existingManager ??
      (await tx.user.create({
        // `role` é obsoleto (P22) e não decide nada; MANAGER só documenta a origem.
        data: { email: managerEmail, name: managerName, role: "MANAGER", organizationId, passwordHash, passwordUpdatedAt: new Date() },
        select: { id: true },
      }))

    const team = await tx.team.create({
      data: { organizationId, name, slug, isActive: true, managerUserId: manager.id, createdByUserId: adminUserId },
      select: { id: true },
    })
    const teamId = team.id
    const base = { organizationId, teamId }

    await tx.teamAccess.create({ data: { userId: manager.id, teamId, level: "MANAGER", grantedByUserId: adminUserId } })
    if (viewers.length) {
      await tx.teamAccess.createMany({ data: viewers.map((v) => ({ userId: v.id, teamId, level: "VIEWER" as const, grantedByUserId: adminUserId })) })
    }
    if (modules.length) {
      await tx.teamModule.createMany({ data: modules.map((moduleKey) => ({ teamId, moduleKey, changedByUserId: adminUserId })) })
    }

    await tx.seniority.createMany({ data: DEFAULT_SENIORITIES.map((s) => ({ ...base, ...s })) })
    await tx.blockerReason.createMany({ data: DEFAULT_BLOCKER_REASONS.map((b, i) => ({ ...base, ...b, order: i + 1 })) })
    await tx.alertThreshold.createMany({ data: Object.entries(DEFAULT_WATCH_CADENCES).map(([key, value]) => ({ ...base, key, value })) })

    if (!existingManager) {
      await writeAudit(
        { action: "user.create", entity: "User", entityId: manager.id, after: { email: managerEmail, name: managerName, via: "team:create" } },
        { organizationId, teamId, userId: adminUserId, tx },
      )
    }
    await writeAudit(
      {
        action: "team.create",
        entity: "Team",
        entityId: teamId,
        after: {
          name,
          slug,
          manager: managerEmail,
          managerCreated: !existingManager,
          modules,
          viewers: viewers.map((v) => v.email),
          seeded: { seniorities: DEFAULT_SENIORITIES.length, blockerReasons: DEFAULT_BLOCKER_REASONS.length, watchCadences: DEFAULT_WATCH_CADENCES },
          via: "cli",
        },
      },
      { organizationId, teamId, userId: adminUserId, tx },
    )

    return { teamId, managerUserId: manager.id, managerPassword: password, viewers, modules }
  })
}

/**
 * Concede (ou muda o nível de) acesso de um usuário a um time, por e-mail e slug.
 * Revogado antes? Reabre a mesma linha (`@@unique([userId, teamId])`) com data e autor novos.
 */
export async function grantAccess(
  input: { email: string; teamSlug: string; level: "MANAGER" | "VIEWER" },
  actor: { organizationId: string; adminUserId: string },
): Promise<"granted" | "changed" | "unchanged"> {
  const { user, team } = await resolveUserAndTeam(input.email, input.teamSlug, actor.organizationId)
  return db.$transaction(async (tx) => {
    const before = await tx.teamAccess.findUnique({ where: { userId_teamId: { userId: user.id, teamId: team.id } } })
    if (before && !before.revokedAt && before.level === input.level) return "unchanged"
    const reopened = !before || before.revokedAt !== null
    const row = await tx.teamAccess.upsert({
      where: { userId_teamId: { userId: user.id, teamId: team.id } },
      create: { userId: user.id, teamId: team.id, level: input.level, grantedByUserId: actor.adminUserId },
      update: reopened
        ? { level: input.level, revokedAt: null, grantedAt: new Date(), grantedByUserId: actor.adminUserId }
        : { level: input.level },
      select: { id: true },
    })
    await writeAudit(
      {
        action: reopened ? "team.access.grant" : "team.access.level",
        entity: "TeamAccess",
        entityId: row.id,
        before: before ? { level: before.level, revoked: before.revokedAt !== null } : null,
        after: { email: user.email, level: input.level, via: "cli" },
      },
      { organizationId: actor.organizationId, teamId: team.id, userId: actor.adminUserId, tx },
    )
    return reopened ? "granted" : "changed"
  })
}

/** Revoga: preenche `revokedAt`, nunca apaga a linha (é registro de quem pôde ver o quê). */
export async function revokeAccess(
  input: { email: string; teamSlug: string },
  actor: { organizationId: string; adminUserId: string },
): Promise<"revoked" | "none"> {
  const { user, team } = await resolveUserAndTeam(input.email, input.teamSlug, actor.organizationId)
  return db.$transaction(async (tx) => {
    const access = await tx.teamAccess.findFirst({ where: { userId: user.id, teamId: team.id, revokedAt: null }, select: { id: true, level: true } })
    if (!access) return "none"
    await tx.teamAccess.update({ where: { id: access.id }, data: { revokedAt: new Date() } })
    await writeAudit(
      { action: "team.access.revoke", entity: "TeamAccess", entityId: access.id, before: { email: user.email, level: access.level }, after: { revoked: true, via: "cli" } },
      { organizationId: actor.organizationId, teamId: team.id, userId: actor.adminUserId, tx },
    )
    return "revoked"
  })
}

async function resolveUserAndTeam(email: string, teamSlug: string, organizationId: string) {
  const [user, team] = await Promise.all([
    db.user.findFirst({ where: { email: normalizeEmail(email), organizationId }, select: { id: true, email: true } }),
    db.team.findFirst({ where: { slug: teamSlug.trim().toLowerCase(), organizationId }, select: { id: true } }),
  ])
  if (!user) throw new ProvisioningError(`não existe usuário com o e-mail ${normalizeEmail(email)} nesta organização.`)
  if (!team) throw new ProvisioningError(`não existe time com o slug "${teamSlug}".`)
  return { user, team }
}

/** O administrador que roda o script: o único `isPlatformAdmin` da organização, ou o do e-mail dado. */
export async function resolveAdmin(organizationId: string, email?: string): Promise<string> {
  const admins = await db.user.findMany({
    where: { organizationId, isPlatformAdmin: true, ...(email ? { email: normalizeEmail(email) } : {}) },
    select: { id: true },
  })
  if (admins.length === 1) return admins[0]!.id
  if (admins.length === 0) throw new ProvisioningError(email ? "este e-mail não administra a plataforma." : "nenhum usuário com isPlatformAdmin nesta organização.")
  throw new ProvisioningError("há mais de um administrador: informe o e-mail em ADMIN_EMAIL.")
}
