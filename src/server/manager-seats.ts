import { labels } from "../lib/labels.ts"
import { firstName, onlyManagerSeats, withManagerSeats } from "../lib/manager-seats.ts"
import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"

/**
 * C25 — lugares de gestor (decisão do usuário em 11/11/2026: os gestores também recebem
 * combinados, em todos os times). Ver `src/lib/manager-seats.ts`.
 *
 * `syncManagerSeats` deixa o time com exatamente um lugar ATIVO por gestor (TeamAccess
 * MANAGER não revogado, conta ativa), exceto o gestor que já é pessoa do time
 * (TeamMember.userId = a conta dele, como o Rodolfo no Suporte): esse recebe combinados como
 * pessoa. Quem deixou de ser gestor tem o lugar INATIVO — nunca apagado, porque os combinados
 * dele continuam apontando para lá (D10, D23). Chamado em toda escrita de TeamAccess e no
 * provisionamento; idempotente. Auditado só quando muda algo.
 */

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

export async function syncManagerSeats(
  tx: Tx,
  teamId: string,
  actor: { organizationId: string; userId: string },
): Promise<{ created: number; reactivated: number; deactivated: number }> {
  const [managers, persons, seats, seniority] = await Promise.all([
    tx.teamAccess.findMany({
      where: { teamId, level: "MANAGER", revokedAt: null, user: { isActive: true } },
      select: { userId: true, user: { select: { name: true, email: true } } },
    }),
    // Gestor que já é pessoa do time recebe combinado como pessoa.
    tx.teamMember.findMany({ where: { teamId, userId: { not: null }, deletedAt: undefined }, select: { userId: true } }),
    tx.teamMember.findMany({
      where: { teamId, ...withManagerSeats, managerUserId: { not: null }, deletedAt: undefined },
      select: { id: true, managerUserId: true, status: true },
    }),
    // TeamMember exige senioridade; no lugar de gestor ela não aparece em lugar nenhum.
    tx.seniority.findFirst({ where: { teamId }, orderBy: { order: "desc" }, select: { id: true } }),
  ])
  const asPerson = new Set(persons.map((p) => p.userId))
  const wanted = managers.filter((m) => !asPerson.has(m.userId))
  const wantedIds = new Set(wanted.map((m) => m.userId))
  const byUser = new Map(seats.map((s) => [s.managerUserId, s]))
  const result = { created: 0, reactivated: 0, deactivated: 0 }

  for (const m of wanted) {
    const seat = byUser.get(m.userId)
    const name = m.user.name.trim() || m.user.email
    if (!seat) {
      if (!seniority) continue
      const created = await tx.teamMember.create({
        data: {
          teamId,
          managerUserId: m.userId,
          fullName: name,
          preferredName: firstName(name),
          email: m.user.email,
          position: labels.managerSeats.position,
          seniorityId: seniority.id,
          joinedAt: new Date(new Date().toISOString().slice(0, 10)),
          avatarSeed: m.userId,
          status: "ACTIVE",
        },
        select: { id: true },
      })
      result.created++
      await writeAudit(
        { action: "team.managerSeat.create", entity: "TeamMember", entityId: created.id, after: { managerUserId: m.userId, name } },
        { organizationId: actor.organizationId, teamId, userId: actor.userId, tx },
      )
    } else if (seat.status !== "ACTIVE") {
      await tx.teamMember.update({ where: { id: seat.id, teamId }, data: { status: "ACTIVE", deletedAt: null } })
      result.reactivated++
      await writeAudit(
        { action: "team.managerSeat.activate", entity: "TeamMember", entityId: seat.id, before: { status: seat.status }, after: { status: "ACTIVE" } },
        { organizationId: actor.organizationId, teamId, userId: actor.userId, tx },
      )
    }
  }
  for (const seat of seats) {
    if (seat.managerUserId && !wantedIds.has(seat.managerUserId) && seat.status !== "INACTIVE") {
      await tx.teamMember.update({ where: { id: seat.id, teamId }, data: { status: "INACTIVE" } })
      result.deactivated++
      await writeAudit(
        { action: "team.managerSeat.deactivate", entity: "TeamMember", entityId: seat.id, before: { status: seat.status }, after: { status: "INACTIVE" } },
        { organizationId: actor.organizationId, teamId, userId: actor.userId, tx },
      )
    }
  }
  return result
}

/**
 * Lugares de gestor ATIVOS do time (id e nome), para escolher o responsável de um combinado
 * fora da presença: Seção 3 e troca da daily (gestor e scrum master). Recebe só o `teamId`
 * porque a ponte do scrum master (D46) não tem TeamContext.
 */
export async function listManagerSeats(teamId: string): Promise<{ id: string; preferredName: string }[]> {
  return db.teamMember.findMany({
    where: { teamId, ...onlyManagerSeats, status: "ACTIVE" },
    orderBy: { preferredName: "asc" },
    select: { id: true, preferredName: true },
  })
}
