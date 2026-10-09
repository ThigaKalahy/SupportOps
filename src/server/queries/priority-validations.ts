import { Prisma, type ValidationOutcome } from "@prisma/client"

import { businessRangeInstants, todayBusinessDate } from "../../lib/dates.ts"
import { isChanged, rate } from "../../lib/priority-validation.ts"
import { periodRange, type ValidationFilters } from "../../lib/validation-filters.ts"
import { centralWhere } from "../../lib/centrals.ts"
import { db } from "../db.ts"
import { listActiveCentrals } from "./centrals.ts"
import { memberScope, type Viewer } from "../visibility.ts"

/**
 * Leituras de validação de prioridade. PriorityValidation não tem
 * visibilidade própria (é registro operacional, não de prontuário) e não
 * entra na timeline (D15); segue o escopo de organização e de pessoas.
 *
 * Os quatro resumos de relatório recebem um intervalo de datas de negócio
 * (inclusivo) e rodam sobre os índices do schema — `(organizationId,
 * validatedAt)` filtra o período; tests/priority-validations.test.ts confere
 * o plano de execução. Nenhum ordena pessoas por taxa (D7).
 */

/* ───────────────────────────── Formulário ───────────────────────────── */

export interface ValidationFormData {
  members: { id: string; preferredName: string }[]
  /** Ativos, do rank mais alto para o mais baixo. */
  levels: { id: string; label: string; rank: number }[]
  reasons: { id: string; label: string; requiresDetail: boolean }[]
  patterns: { id: string; label: string; regex: string; captureGroup: number }[]
  /** Centrais ativas (P19). */
  centrals: { id: string; name: string }[]
}

export async function getValidationFormData(viewer: Viewer): Promise<ValidationFormData> {
  const [members, levels, reasons, patterns, centrals] = await Promise.all([
    db.teamMember.findMany({
      where: { ...memberScope(viewer), status: { in: ["ACTIVE", "OFFBOARDING"] } },
      orderBy: { preferredName: "asc" },
      select: { id: true, preferredName: true },
    }),
    db.priorityLevel.findMany({
      where: { organizationId: viewer.organizationId, isActive: true },
      orderBy: { rank: "desc" },
      select: { id: true, label: true, rank: true },
    }),
    db.reclassificationReason.findMany({
      where: { organizationId: viewer.organizationId, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, label: true, requiresDetail: true },
    }),
    db.ticketUrlPattern.findMany({
      where: { organizationId: viewer.organizationId, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, label: true, regex: true, captureGroup: true },
    }),
    listActiveCentrals(viewer),
  ])
  return { members, levels, reasons, patterns, centrals }
}

/* ──────────────────────────── Lista do período ──────────────────────────── */

export interface ValidationRow {
  id: string
  validatedAt: Date
  ticketUrl: string
  ticketRef: string
  member: { id: string; preferredName: string }
  analystPriority: { id: string; label: string }
  supervisorPriority: { id: string; label: string } | null
  outcome: ValidationOutcome
  reason: { id: string; label: string } | null
  /** Central do chamado (P19); null = sem central informada. */
  central: { id: string; name: string } | null
  reasonOther: string | null
  note: string | null
  returned: boolean
  /** Ranks do momento da validação (D14); a edição os preserva se as prioridades não mudarem. */
  analystRankSnapshot: number
  supervisorRankSnapshot: number | null
}

function rangeWhere(viewer: Viewer, from: Date, to: Date): Prisma.PriorityValidationWhereInput {
  return {
    organizationId: viewer.organizationId,
    deletedAt: null,
    validatedAt: businessRangeInstants(from, to),
    member: memberScope(viewer),
  }
}

/**
 * Validações do período e dos filtros, da mais recente para a mais antiga.
 * O resumo segue o período e a pessoa, não o filtro de resultado ou motivo —
 * filtrado por "Elevada", ele diria sempre "100% alterados".
 */
export async function listValidations(viewer: Viewer, filters: ValidationFilters, today = todayBusinessDate()) {
  const { from, to } = periodRange(filters, today)
  const rows = await db.priorityValidation.findMany({
    where: {
      ...rangeWhere(viewer, from, to),
      ...(filters.memberId ? { memberId: filters.memberId } : {}),
      // Central filtra como a pessoa: o resumo passa a ser o da central.
      ...centralWhere(filters.central),
    },
    orderBy: [{ validatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      validatedAt: true,
      ticketUrl: true,
      ticketRef: true,
      outcome: true,
      reasonOther: true,
      note: true,
      analystRankSnapshot: true,
      supervisorRankSnapshot: true,
      member: { select: { id: true, preferredName: true } },
      analystPriority: { select: { id: true, label: true } },
      supervisorPriority: { select: { id: true, label: true } },
      reason: { select: { id: true, label: true } },
      central: { select: { id: true, name: true } },
    },
  })
  const all: ValidationRow[] = rows.map((r) => ({ ...r, returned: r.outcome === "RETURNED" }))
  const list = all.filter(
    (r) => (!filters.outcome || r.outcome === filters.outcome) && (!filters.reasonId || r.reason?.id === filters.reasonId),
  )
  return { from, to, rows: list, total: all.length, summary: summarize(all.map((r) => r.outcome)) }
}

export interface ValidationSummary {
  total: number
  maintained: number
  raised: number
  lowered: number
  returned: number
  /** Elevados + rebaixados + devolvidos. */
  changed: number
  /** % inteiro de alterados sobre o total; null sem validações. */
  changeRate: number | null
}

export function summarize(outcomes: ValidationOutcome[]): ValidationSummary {
  const count = (o: ValidationOutcome) => outcomes.filter((x) => x === o).length
  const changed = outcomes.filter(isChanged).length
  return {
    total: outcomes.length,
    maintained: count("MAINTAINED"),
    raised: count("RAISED"),
    lowered: count("LOWERED"),
    returned: count("RETURNED"),
    changed,
    changeRate: rate(changed, outcomes.length),
  }
}

/* ───────────────────────── Resumos para relatório ───────────────────────── */

/** Escopo comum dos resumos: organização, período e pessoas visíveis (alias "pv"). */
function scopeSql(viewer: Viewer, from: Date, to: Date): Prisma.Sql {
  const { gte, lt } = businessRangeInstants(from, to)
  const manager =
    viewer.role === "MANAGER"
      ? Prisma.sql`AND pv."memberId" IN (
          SELECT m."id" FROM "TeamMember" m JOIN "Team" t ON t."id" = m."teamId"
          WHERE t."managerUserId" = ${viewer.id})`
      : Prisma.empty
  return Prisma.sql`pv."organizationId" = ${viewer.organizationId}
    AND pv."validatedAt" >= ${gte} AND pv."validatedAt" < ${lt}
    AND pv."deletedAt" IS NULL ${manager}`
}

const outcomeCounts = Prisma.sql`
  count(*)::int AS "total",
  count(*) FILTER (WHERE pv."outcome" = 'MAINTAINED')::int AS "maintained",
  count(*) FILTER (WHERE pv."outcome" = 'RAISED')::int AS "raised",
  count(*) FILTER (WHERE pv."outcome" = 'LOWERED')::int AS "lowered",
  count(*) FILTER (WHERE pv."outcome" = 'RETURNED')::int AS "returned"`

type CountRow = Omit<ValidationSummary, "changed" | "changeRate">

function withRate<T extends CountRow>(row: T): T & Pick<ValidationSummary, "changed" | "changeRate"> {
  const changed = row.raised + row.lowered + row.returned
  return { ...row, changed, changeRate: rate(changed, row.total) }
}

/** SQL de cada resumo, exposto para o teste de plano de execução. */
export const summarySql = {
  byPeriod: (viewer: Viewer, from: Date, to: Date) => Prisma.sql`
    SELECT ${outcomeCounts} FROM "PriorityValidation" pv WHERE ${scopeSql(viewer, from, to)}`,
  byMember: (viewer: Viewer, from: Date, to: Date) => Prisma.sql`
    SELECT pv."memberId", m."preferredName", ${outcomeCounts}
    FROM "PriorityValidation" pv JOIN "TeamMember" m ON m."id" = pv."memberId"
    WHERE ${scopeSql(viewer, from, to)}
    GROUP BY pv."memberId", m."preferredName"
    ORDER BY m."preferredName"`,
  byReason: (viewer: Viewer, from: Date, to: Date) => Prisma.sql`
    SELECT pv."reasonId", r."label", count(*)::int AS "count"
    FROM "PriorityValidation" pv JOIN "ReclassificationReason" r ON r."id" = pv."reasonId"
    WHERE ${scopeSql(viewer, from, to)}
    GROUP BY pv."reasonId", r."label", r."order"
    ORDER BY "count" DESC, r."order"`,
  byTransition: (viewer: Viewer, from: Date, to: Date) => Prisma.sql`
    SELECT pv."analystPriorityId" AS "fromId", pv."supervisorPriorityId" AS "toId",
           pv."analystRankSnapshot" AS "fromRank", pv."supervisorRankSnapshot" AS "toRank",
           pv."outcome", count(*)::int AS "count"
    FROM "PriorityValidation" pv
    WHERE ${scopeSql(viewer, from, to)}
    GROUP BY pv."analystPriorityId", pv."supervisorPriorityId", pv."analystRankSnapshot", pv."supervisorRankSnapshot", pv."outcome"
    ORDER BY pv."analystRankSnapshot" DESC, pv."supervisorRankSnapshot" DESC NULLS LAST, pv."outcome",
             pv."analystPriorityId", pv."supervisorPriorityId"`,
}

/** Totais do intervalo: avaliados, por resultado, alterados e taxa. */
export async function summaryByPeriod(viewer: Viewer, from: Date, to: Date): Promise<ValidationSummary> {
  const [row] = await db.$queryRaw<CountRow[]>(summarySql.byPeriod(viewer, from, to))
  return withRate(row ?? { total: 0, maintained: 0, raised: 0, lowered: 0, returned: 0 })
}

export type MemberValidationSummary = ValidationSummary & { memberId: string; preferredName: string }

/** Por analista, com taxa de alteração e o total ao lado (D19). Ordem por nome, nunca por taxa (D7). */
export async function summaryByMember(viewer: Viewer, from: Date, to: Date): Promise<MemberValidationSummary[]> {
  const rows = await db.$queryRaw<(CountRow & { memberId: string; preferredName: string })[]>(
    summarySql.byMember(viewer, from, to),
  )
  return rows.map(withRate)
}

/** Motivos mais frequentes (só validações com motivo), do mais ao menos usado. */
export async function summaryByReason(
  viewer: Viewer,
  from: Date,
  to: Date,
): Promise<{ reasonId: string; label: string; count: number }[]> {
  return db.$queryRaw(summarySql.byReason(viewer, from, to))
}

export interface PriorityTransition {
  from: { id: string; label: string; rank: number }
  /** null = devolvida para reanálise (sem prioridade validada). */
  to: { id: string; label: string; rank: number } | null
  outcome: ValidationOutcome
  count: number
}

/**
 * Matriz origem × destino: quantas vezes cada prioridade do analista virou
 * cada prioridade validada. Os ranks são os do momento da validação (D14) —
 * reordenar os níveis em /settings não muda a matriz histórica.
 */
export async function summaryByPriorityTransition(viewer: Viewer, from: Date, to: Date): Promise<PriorityTransition[]> {
  const rows = await db.$queryRaw<
    { fromId: string; toId: string | null; fromRank: number; toRank: number | null; outcome: ValidationOutcome; count: number }[]
  >(summarySql.byTransition(viewer, from, to))
  const levels = await db.priorityLevel.findMany({
    where: { organizationId: viewer.organizationId },
    select: { id: true, label: true },
  })
  const label = new Map(levels.map((l) => [l.id, l.label]))
  return rows.map((r) => ({
    from: { id: r.fromId, label: label.get(r.fromId) ?? r.fromId, rank: r.fromRank },
    to: r.toId === null || r.toRank === null ? null : { id: r.toId, label: label.get(r.toId) ?? r.toId, rank: r.toRank },
    outcome: r.outcome,
    count: r.count,
  }))
}

/* ─────────────────────────────── Perfil ─────────────────────────────── */

export const PROFILE_VALIDATION_DAYS = 90

/** Bloco do perfil: validações dos últimos 90 dias, taxa com o total e o motivo mais frequente. */
export async function memberValidationSummary(viewer: Viewer, memberId: string, today = todayBusinessDate()) {
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - (PROFILE_VALIDATION_DAYS - 1))
  const where = { ...rangeWhere(viewer, from, today), memberId }
  const [outcomes, reasons] = await Promise.all([
    db.priorityValidation.groupBy({ by: ["outcome"], where, _count: { _all: true } }),
    db.priorityValidation.groupBy({
      by: ["reasonId"],
      where: { ...where, reasonId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { reasonId: "desc" } },
      take: 1,
    }),
  ])
  const list = outcomes.flatMap((o) => Array<ValidationOutcome>(o._count._all).fill(o.outcome))
  const top = reasons[0]
  const topReason =
    top?.reasonId != null
      ? {
          label: (await db.reclassificationReason.findUnique({ where: { id: top.reasonId }, select: { label: true } }))?.label ?? "",
          count: top._count._all,
        }
      : null
  return { days: PROFILE_VALIDATION_DAYS, summary: summarize(list), topReason }
}
