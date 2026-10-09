import type { TeamAccessLevel } from "@prisma/client"

import { MODULE_KEYS, type ModuleKey } from "../../lib/modules.ts"
import { db } from "../db.ts"
import { requirePlatformAdmin, type TeamContext } from "../scope.ts"

/**
 * Administração de times (P23, /settings/team): só para `isPlatformAdmin`.
 *
 * É a única leitura de `src/server/queries` que olha vários times de propósito —
 * e devolve só o que é da PLATAFORMA (nome, identificador, ativo, módulos, quem tem
 * acesso) mais a contagem de pessoas. Nenhum registro de time sai daqui:
 * administrar não dá acesso a dado (CLAUDE.md, "Modelo de acesso").
 */

export interface AdminTeamAccess {
  userId: string
  name: string
  email: string
  level: TeamAccessLevel
  grantedAt: Date
}

export interface AdminTeam {
  id: string
  name: string
  slug: string
  isActive: boolean
  members: number
  modules: { key: ModuleKey; enabled: boolean }[]
  access: AdminTeamAccess[]
}

export interface TeamAdminData {
  teams: AdminTeam[]
  /** Usuários da organização, para conceder acesso. */
  users: { id: string; name: string; email: string }[]
}

export async function listTeamsForAdmin(ctx: TeamContext): Promise<TeamAdminData> {
  requirePlatformAdmin(ctx)
  const teams = await db.team.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      modules: { select: { moduleKey: true, isEnabled: true } },
      accesses: {
        where: { revokedAt: null },
        orderBy: { grantedAt: "asc" },
        select: { level: true, grantedAt: true, user: { select: { id: true, name: true, email: true } } },
      },
    },
  })
  const teamIds = teams.map((t) => t.id)
  const [counts, users] = await Promise.all([
    teamIds.length
      ? db.teamMember.groupBy({ by: ["teamId"], where: { teamId: { in: teamIds }, status: { not: "INACTIVE" } }, _count: { _all: true } })
      : [],
    db.user.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ])
  const members = new Map(counts.map((c) => [c.teamId, c._count._all]))
  return {
    teams: teams.map((t) => {
      const enabled = new Set(t.modules.filter((m) => m.isEnabled).map((m) => m.moduleKey))
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        isActive: t.isActive,
        members: members.get(t.id) ?? 0,
        modules: MODULE_KEYS.map((key) => ({ key, enabled: enabled.has(key) })),
        access: t.accesses.map((a) => ({ userId: a.user.id, name: a.user.name, email: a.user.email, level: a.level, grantedAt: a.grantedAt })),
      }
    }),
    users,
  }
}
