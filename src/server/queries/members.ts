import { Prisma, type MemberStatus } from "@prisma/client"

import { trendWindows } from "../../lib/adherence.ts"
import { todayBusinessDate } from "../../lib/dates.ts"
import { memberAttention, ATTENTION_THRESHOLDS, type MemberAttention } from "../alerts.ts"
import { db } from "../db.ts"
import { visibilitySql, type Viewer } from "../visibility.ts"

/**
 * Leituras de pessoas do time. A listagem de /team sai de UMA consulta SQL,
 * com os agregados (último 1:1, combinados abertos e os fatos de atenção)
 * em subconsultas correlacionadas — uma ida ao banco, sem N+1.
 */

export interface TeamListFilters {
  /** Chave da senioridade (JUNIOR, PLENO, SENIOR...). */
  seniority?: string
  /** "current" (padrão: ativos, afastados e em desligamento) ou "inactive". */
  status?: "current" | "inactive"
  needsAttention?: boolean
  /** Uma pessoa só (perfil), ativa ou não — ignora o filtro de status. */
  id?: string
}

export interface TeamListRow {
  id: string
  fullName: string
  preferredName: string
  position: string
  email: string | null
  status: MemberStatus
  joinedAt: Date
  seniorityId: string
  seniorityKey: string
  seniorityLabel: string
  seniorityOrder: number
  lastOneOnOne: Date | null
  openAgreements: number
  attention: MemberAttention | null
}

interface RawRow {
  id: string
  fullName: string
  preferredName: string
  position: string
  email: string | null
  status: MemberStatus
  joinedAt: Date
  seniorityId: string
  seniorityKey: string
  seniorityLabel: string
  seniorityOrder: number
  lastOneOnOne: Date | null
  openAgreements: number
  overdueAgreements: number
  oldestOverdueDue: Date | null
  dueSoonAgreements: number
  chronicAgreements: number
  oldestPlanReview: Date | null
  dueCurrent: number
  onTimeCurrent: number
  duePrevious: number
  onTimePrevious: number
}

/**
 * Pessoas do time com agregados. Ordem: senioridade (mais alta primeiro) e
 * nome — nunca por métrica de desempenho (sem ranking, D7).
 */
export async function listTeamMembers(viewer: Viewer, filters: TeamListFilters = {}): Promise<TeamListRow[]> {
  const today = todayBusinessDate()
  const dueSoonLimit = new Date(today)
  dueSoonLimit.setUTCDate(dueSoonLimit.getUTCDate() + ATTENTION_THRESHOLDS.dueSoonDays)

  // Janelas da tendência de cumprimento (mesmas regras de src/lib/adherence.ts, conferidas em teste).
  const windows = trendWindows(today)
  const dueIn = (from: Date, to: Date, onTime: boolean) => Prisma.sql`
      (SELECT count(*)::int FROM "Agreement" a
        WHERE a."memberId" = m."id" AND a."deletedAt" IS NULL
          AND a."originalDueDate" BETWEEN ${from} AND ${to}
          AND NOT (a."status" IN ('OPEN', 'IN_PROGRESS') AND a."originalDueDate" >= ${today})
          ${onTime ? Prisma.sql`AND a."status" = 'DONE' AND a."completedAt" <= a."originalDueDate"` : Prisma.empty})`

  const inactive = filters.status === "inactive"
  const scope =
    viewer.role === "MANAGER" ? Prisma.sql`AND t."managerUserId" = ${viewer.id}` : Prisma.empty

  const rows = await db.$queryRaw<RawRow[]>`
    SELECT
      m."id", m."fullName", m."preferredName", m."position", m."email", m."status", m."joinedAt",
      s."id" AS "seniorityId", s."key" AS "seniorityKey", s."label" AS "seniorityLabel", s."order" AS "seniorityOrder",
      (SELECT max(o."date") FROM "OneOnOne" o
        WHERE o."memberId" = m."id" AND o."deletedAt" IS NULL ${visibilitySql(viewer, "o")}) AS "lastOneOnOne",
      (SELECT count(*)::int FROM "Agreement" a
        WHERE a."memberId" = m."id" AND a."deletedAt" IS NULL AND a."status" IN ('OPEN', 'IN_PROGRESS')) AS "openAgreements",
      (SELECT count(*)::int FROM "Agreement" a
        WHERE a."memberId" = m."id" AND a."deletedAt" IS NULL AND a."status" IN ('OPEN', 'IN_PROGRESS')
          AND a."dueDate" < ${today}) AS "overdueAgreements",
      (SELECT min(a."dueDate") FROM "Agreement" a
        WHERE a."memberId" = m."id" AND a."deletedAt" IS NULL AND a."status" IN ('OPEN', 'IN_PROGRESS')
          AND a."dueDate" < ${today}) AS "oldestOverdueDue",
      (SELECT count(*)::int FROM "Agreement" a
        WHERE a."memberId" = m."id" AND a."deletedAt" IS NULL AND a."status" IN ('OPEN', 'IN_PROGRESS')
          AND a."dueDate" >= ${today} AND a."dueDate" <= ${dueSoonLimit}) AS "dueSoonAgreements",
      (SELECT count(*)::int FROM "Agreement" a
        WHERE a."memberId" = m."id" AND a."deletedAt" IS NULL AND a."status" IN ('OPEN', 'IN_PROGRESS')
          AND (SELECT count(*) FROM "AgreementCheckin" c
                WHERE c."agreementId" = a."id" AND c."newDueDate" IS NOT NULL) >= ${ATTENTION_THRESHOLDS.chronicReschedules}
      ) AS "chronicAgreements",
      (SELECT min(coalesce((p."lastReviewedAt" AT TIME ZONE 'America/Sao_Paulo')::date, p."startedAt"))
        FROM "DevelopmentPlan" p
        WHERE p."memberId" = m."id" AND p."deletedAt" IS NULL AND p."status" = 'ACTIVE') AS "oldestPlanReview",
      ${dueIn(windows.current.from, windows.current.to, false)} AS "dueCurrent",
      ${dueIn(windows.current.from, windows.current.to, true)} AS "onTimeCurrent",
      ${dueIn(windows.previous.from, windows.previous.to, false)} AS "duePrevious",
      ${dueIn(windows.previous.from, windows.previous.to, true)} AS "onTimePrevious"
    FROM "TeamMember" m
    JOIN "Team" t ON t."id" = m."teamId"
    JOIN "Seniority" s ON s."id" = m."seniorityId"
    WHERE t."organizationId" = ${viewer.organizationId}
      ${scope}
      ${
        filters.id
          ? Prisma.sql`AND m."id" = ${filters.id}`
          : inactive
            ? Prisma.sql`AND m."deletedAt" IS NOT NULL`
            : Prisma.sql`AND m."deletedAt" IS NULL`
      }
      ${filters.seniority ? Prisma.sql`AND s."key" = ${filters.seniority}` : Prisma.empty}
    ORDER BY s."order" DESC, m."preferredName" ASC
  `

  const result = rows.map((row): TeamListRow => {
    const attention =
      inactive || row.status === "INACTIVE"
        ? null
        : memberAttention(
            {
              seniorityKey: row.seniorityKey,
              seniorityLabel: row.seniorityLabel,
              joinedAt: row.joinedAt,
              lastOneOnOne: row.lastOneOnOne,
              overdueAgreements: row.overdueAgreements,
              oldestOverdueDue: row.oldestOverdueDue,
              dueSoonAgreements: row.dueSoonAgreements,
              chronicAgreements: row.chronicAgreements,
              oldestPlanReview: row.oldestPlanReview,
              adherenceWindows: {
                current: { due: row.dueCurrent, onTime: row.onTimeCurrent },
                previous: { due: row.duePrevious, onTime: row.onTimePrevious },
              },
            },
            today,
          )
    return {
      id: row.id,
      fullName: row.fullName,
      preferredName: row.preferredName,
      position: row.position,
      email: row.email,
      status: row.status,
      joinedAt: row.joinedAt,
      seniorityId: row.seniorityId,
      seniorityKey: row.seniorityKey,
      seniorityLabel: row.seniorityLabel,
      seniorityOrder: row.seniorityOrder,
      lastOneOnOne: row.lastOneOnOne,
      openAgreements: row.openAgreements,
      attention,
    }
  })

  return filters.needsAttention ? result.filter((r) => r.attention !== null) : result
}

/** Catálogos do formulário de cadastro (senioridades, responsabilidades, competências). */
export async function getMemberFormCatalogs(viewer: Viewer) {
  const [seniorities, responsibilities, competencies] = await Promise.all([
    db.seniority.findMany({ where: { organizationId: viewer.organizationId }, orderBy: { order: "desc" } }),
    db.responsibility.findMany({ where: { organizationId: viewer.organizationId }, orderBy: { name: "asc" } }),
    db.competency.findMany({ where: { organizationId: viewer.organizationId, isActive: true }, orderBy: { name: "asc" } }),
  ])
  return {
    seniorities: seniorities.map((s) => ({ id: s.id, key: s.key, label: s.label })),
    responsibilities: responsibilities.map((r) => ({ id: r.id, name: r.name })),
    competencies: competencies.map((c) => ({ id: c.id, name: c.name })),
  }
}

export type MemberFormCatalogs = Awaited<ReturnType<typeof getMemberFormCatalogs>>

/** Cadastro de uma pessoa para o formulário de edição (responsabilidades vigentes e níveis). */
export async function getMemberForEdit(viewer: Viewer, memberId: string) {
  const member = await db.teamMember.findFirst({
    where: { id: memberId, team: { organizationId: viewer.organizationId } },
    include: {
      responsibilities: { where: { endedAt: null }, select: { responsibilityId: true } },
      competencies: { select: { competencyId: true, currentLevel: true } },
    },
  })
  if (!member) return null
  return {
    id: member.id,
    fullName: member.fullName,
    preferredName: member.preferredName,
    position: member.position,
    seniorityId: member.seniorityId,
    joinedAt: member.joinedAt,
    status: member.status,
    email: member.email,
    responsibilityIds: member.responsibilities.map((r) => r.responsibilityId),
    competencies: member.competencies.map((c) => ({ competencyId: c.competencyId, level: c.currentLevel })),
  }
}

export type MemberForEdit = NonNullable<Awaited<ReturnType<typeof getMemberForEdit>>>

/** Cadastros para edição de todas as pessoas listadas, numa única consulta. */
export async function listMembersForEdit(viewer: Viewer, ids: string[]): Promise<Record<string, MemberForEdit>> {
  if (ids.length === 0) return {}
  const members = await db.teamMember.findMany({
    where: { id: { in: ids }, team: { organizationId: viewer.organizationId } },
    include: {
      responsibilities: { where: { endedAt: null }, select: { responsibilityId: true } },
      competencies: { select: { competencyId: true, currentLevel: true } },
    },
  })
  return Object.fromEntries(
    members.map((m) => [
      m.id,
      {
        id: m.id,
        fullName: m.fullName,
        preferredName: m.preferredName,
        position: m.position,
        seniorityId: m.seniorityId,
        joinedAt: m.joinedAt,
        status: m.status,
        email: m.email,
        responsibilityIds: m.responsibilities.map((r) => r.responsibilityId),
        competencies: m.competencies.map((c) => ({ competencyId: c.competencyId, level: c.currentLevel })),
      },
    ]),
  )
}
