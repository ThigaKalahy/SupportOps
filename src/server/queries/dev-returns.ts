import type { DevReturnCategory, Prisma, ValidationOutcome } from "@prisma/client"

import { centralWhere } from "../../lib/centrals.ts"
import { businessRangeInstants, todayBusinessDate } from "../../lib/dates.ts"
import { periodRange } from "../../lib/validation-filters.ts"
import type { DevReturnFilters } from "../../lib/dev-return-filters.ts"
import { devReturnStats, type DevReturnStats } from "../../lib/dev-returns.ts"
import { db } from "../db.ts"
import { memberScope, type Viewer } from "../visibility.ts"

import { listActiveCentrals } from "./centrals.ts"

/**
 * Leituras de devolução do desenvolvimento (P20, D21, D22). Registro
 * operacional, sem visibilidade própria e fora da timeline: segue o escopo de
 * organização e de pessoas.
 *
 * Toda taxa sai com o denominador — chamados validados (PriorityValidation)
 * no mesmo período e no mesmo recorte — e com `lowConfidence` abaixo de 20
 * (D19). A taxa atribuível ao analista sempre acompanha a total, nunca a
 * substitui. Nenhuma função ordena pessoas por taxa (D7).
 *
 * Período: devolução pela data da devolução (`returnedAt`, data de negócio);
 * validação pelo instante da validação, no fuso de São Paulo.
 */

/* ───────────────────────────── Formulário ───────────────────────────── */

export interface DevReturnFormData {
  members: { id: string; preferredName: string }[]
  /** Ativos: atribuíveis ao analista primeiro, depois processo; na ordem do catálogo. */
  reasons: { id: string; label: string; category: DevReturnCategory; requiresDetail: boolean }[]
  patterns: { id: string; label: string; regex: string; captureGroup: number }[]
  centrals: { id: string; name: string }[]
}

export async function getDevReturnFormData(viewer: Viewer): Promise<DevReturnFormData> {
  const [members, reasons, patterns, centrals] = await Promise.all([
    db.teamMember.findMany({
      where: { ...memberScope(viewer), status: { in: ["ACTIVE", "OFFBOARDING"] } },
      orderBy: { preferredName: "asc" },
      select: { id: true, preferredName: true },
    }),
    db.devReturnReason.findMany({
      where: { organizationId: viewer.organizationId, isActive: true },
      orderBy: [{ category: "asc" }, { order: "asc" }, { label: "asc" }],
      select: { id: true, label: true, category: true, requiresDetail: true },
    }),
    db.ticketUrlPattern.findMany({
      where: { organizationId: viewer.organizationId, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, label: true, regex: true, captureGroup: true },
    }),
    listActiveCentrals(viewer),
  ])
  return { members, reasons, patterns, centrals }
}

export interface TicketContext {
  /** A validação mais recente do chamado (a que será ligada), ou null. */
  validation: {
    id: string
    validatedAt: Date
    analystPriority: string
    supervisorPriority: string | null
    outcome: ValidationOutcome
    member: { id: string; preferredName: string }
    central: { id: string; name: string } | null
  } | null
  /** Quantas validações o chamado teve. */
  validations: number
  /** Devoluções já registradas para o chamado (exceto a que está sendo editada). */
  previousReturns: number
}

/** Contexto do chamado colado no formulário: a validação mais recente e quantas devoluções ele já teve. */
export async function getTicketContext(viewer: Viewer, ticketRef: string, exceptId?: string): Promise<TicketContext> {
  const where = { organizationId: viewer.organizationId, ticketRef, member: memberScope(viewer) }
  const [latest, validations, previousReturns] = await Promise.all([
    db.priorityValidation.findFirst({
      where,
      orderBy: [{ validatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        validatedAt: true,
        outcome: true,
        analystPriority: { select: { label: true } },
        supervisorPriority: { select: { label: true } },
        member: { select: { id: true, preferredName: true } },
        central: { select: { id: true, name: true, isActive: true } },
      },
    }),
    db.priorityValidation.count({ where }),
    db.devReturn.count({ where: { ...where, ...(exceptId ? { id: { not: exceptId } } : {}) } }),
  ])
  return {
    validation: latest
      ? {
          id: latest.id,
          validatedAt: latest.validatedAt,
          analystPriority: latest.analystPriority.label,
          supervisorPriority: latest.supervisorPriority?.label ?? null,
          outcome: latest.outcome,
          member: latest.member,
          // Central desativada não é pré-selecionada (o formulário só aceita ativa).
          central: latest.central?.isActive ? { id: latest.central.id, name: latest.central.name } : null,
        }
      : null,
    validations,
    previousReturns,
  }
}

/* ───────────────────────────── Números ───────────────────────────── */

interface Scope {
  memberId: string | null
  /** id, "none" ou null. */
  central?: string | null
}

function returnWhere(viewer: Viewer, scope: Scope, from: Date, to: Date): Prisma.DevReturnWhereInput {
  return {
    organizationId: viewer.organizationId,
    deletedAt: null,
    returnedAt: { gte: from, lte: to },
    member: memberScope(viewer),
    ...(scope.memberId ? { memberId: scope.memberId } : {}),
    ...centralWhere(scope.central ?? null),
  }
}

function validationWhere(viewer: Viewer, scope: Scope, from: Date, to: Date): Prisma.PriorityValidationWhereInput {
  return {
    organizationId: viewer.organizationId,
    deletedAt: null,
    validatedAt: businessRangeInstants(from, to),
    member: memberScope(viewer),
    ...(scope.memberId ? { memberId: scope.memberId } : {}),
    ...centralWhere(scope.central ?? null),
  }
}

/** Devoluções e o denominador (chamados validados) de um recorte. */
export async function getDevReturns(viewer: Viewer, memberId: string | null, from: Date, to: Date, central: string | null = null): Promise<DevReturnStats> {
  const scope = { memberId, central }
  const [returns, ticketsValidated] = await Promise.all([
    db.devReturn.findMany({
      where: returnWhere(viewer, scope, from, to),
      select: { returnedAt: true, resolvedAt: true, reason: { select: { category: true } } },
    }),
    db.priorityValidation.count({ where: validationWhere(viewer, scope, from, to) }),
  ])
  return devReturnStats(
    returns.map((r) => ({ category: r.reason.category, returnedAt: r.returnedAt, resolvedAt: r.resolvedAt })),
    ticketsValidated,
  )
}

export interface DevReturnMonth {
  /** Primeiro dia do mês (data de negócio). */
  month: Date
  stats: DevReturnStats
}

/** Mês a mês (o corrente até hoje), do mais antigo ao mais recente, para tendência. */
export async function getDevReturnSeries(viewer: Viewer, memberId: string | null, months: number, today = todayBusinessDate()): Promise<DevReturnMonth[]> {
  const out: DevReturnMonth[] = []
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))
    const end = i === 0 ? today : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
    out.push({ month: start, stats: await getDevReturns(viewer, memberId, start, end) })
  }
  return out
}

export interface ReasonBreakdown {
  byReason: { id: string; label: string; category: DevReturnCategory; count: number }[]
  byCategory: Record<DevReturnCategory, number>
}

/** Por motivo (do mais frequente) e por categoria. */
export async function getReasonBreakdown(viewer: Viewer, memberId: string | null, from: Date, to: Date): Promise<ReasonBreakdown> {
  const rows = await db.devReturn.groupBy({
    by: ["reasonId"],
    where: returnWhere(viewer, { memberId }, from, to),
    _count: { _all: true },
  })
  const reasons = await db.devReturnReason.findMany({
    where: { id: { in: rows.map((r) => r.reasonId) } },
    select: { id: true, label: true, category: true },
  })
  const byId = new Map(reasons.map((r) => [r.id, r]))
  const byReason = rows
    .flatMap((r) => {
      const reason = byId.get(r.reasonId)
      return reason ? [{ ...reason, count: r._count._all }] : []
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"))
  const byCategory: Record<DevReturnCategory, number> = { ANALYST: 0, PROCESS: 0 }
  for (const r of byReason) byCategory[r.category] += r.count
  return { byReason, byCategory }
}

/** Por pessoa ativa (em ordem alfabética, nunca por taxa — D7), mais o total do time. */
export async function getTeamDevReturns(viewer: Viewer, from: Date, to: Date) {
  const members = await db.teamMember.findMany({
    where: { ...memberScope(viewer), status: { not: "INACTIVE" } },
    orderBy: { preferredName: "asc" },
    select: { id: true, preferredName: true },
  })
  const [perMember, team] = await Promise.all([
    Promise.all(members.map(async (m) => ({ member: m, stats: await getDevReturns(viewer, m.id, from, to) }))),
    getDevReturns(viewer, null, from, to),
  ])
  return { from, to, members: perMember, team }
}

export interface OverlapRow {
  ticketRef: string
  member: { id: string; preferredName: string }
  /** Resultado da validação mais recente com alteração. */
  outcome: ValidationOutcome
  returns: number
  lastReturnedAt: Date
}

/**
 * Chamados com prioridade ALTERADA na validação (elevada, rebaixada ou
 * devolvida) E devolvidos pelo desenvolvimento no período: a interseção que
 * aponta problema de triagem, não dois problemas separados.
 */
export async function getReturnOverlap(viewer: Viewer, from: Date, to: Date, memberId: string | null = null): Promise<OverlapRow[]> {
  const returns = await db.devReturn.findMany({
    where: returnWhere(viewer, { memberId }, from, to),
    select: { ticketRef: true, returnedAt: true, member: { select: { id: true, preferredName: true } } },
  })
  if (returns.length === 0) return []
  const refs = [...new Set(returns.map((r) => r.ticketRef))]
  const changed = await db.priorityValidation.findMany({
    where: { organizationId: viewer.organizationId, ticketRef: { in: refs }, outcome: { not: "MAINTAINED" }, member: memberScope(viewer) },
    orderBy: { validatedAt: "desc" },
    select: { ticketRef: true, outcome: true },
  })
  const outcomeByRef = new Map<string, ValidationOutcome>()
  for (const v of changed) if (!outcomeByRef.has(v.ticketRef)) outcomeByRef.set(v.ticketRef, v.outcome)
  const byRef = new Map<string, OverlapRow>()
  for (const r of returns) {
    const outcome = outcomeByRef.get(r.ticketRef)
    if (!outcome) continue
    const row = byRef.get(r.ticketRef) ?? { ticketRef: r.ticketRef, member: r.member, outcome, returns: 0, lastReturnedAt: r.returnedAt }
    row.returns++
    if (r.returnedAt > row.lastReturnedAt) row.lastReturnedAt = r.returnedAt
    byRef.set(r.ticketRef, row)
  }
  return [...byRef.values()].sort((a, b) => b.lastReturnedAt.getTime() - a.lastReturnedAt.getTime())
}

/* ───────────────────────────── Lista ───────────────────────────── */

export interface DevReturnRow {
  id: string
  ticketUrl: string
  ticketRef: string
  returnedAt: Date
  member: { id: string; preferredName: string }
  central: { id: string; name: string } | null
  reason: { id: string; label: string; category: DevReturnCategory }
  reasonOther: string | null
  devContact: string | null
  note: string | null
  resolvedAt: Date | null
  resolutionNote: string | null
  /** Validação ligada (a mais recente do chamado no momento do registro). */
  validation: { outcome: ValidationOutcome } | null
}

/**
 * Devoluções do período e dos filtros, da mais recente para a mais antiga.
 * O resumo segue período, pessoa e central — não motivo, categoria nem
 * "apenas em aberto", que só recortam a tabela (filtrar por "Processo" faria
 * o resumo dizer sempre "0 atribuíveis").
 */
export async function listDevReturns(viewer: Viewer, filters: DevReturnFilters, today = todayBusinessDate()) {
  const { from, to } = periodRange(filters, today)
  const scope = { memberId: filters.memberId, central: filters.central }
  const [rows, summary, overlap] = await Promise.all([
    db.devReturn.findMany({
      where: {
        ...returnWhere(viewer, scope, from, to),
        ...(filters.reasonId ? { reasonId: filters.reasonId } : {}),
        ...(filters.category ? { reason: { category: filters.category } } : {}),
        ...(filters.openOnly ? { resolvedAt: null } : {}),
      },
      orderBy: [{ returnedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        ticketUrl: true,
        ticketRef: true,
        returnedAt: true,
        reasonOther: true,
        devContact: true,
        note: true,
        resolvedAt: true,
        resolutionNote: true,
        member: { select: { id: true, preferredName: true } },
        central: { select: { id: true, name: true } },
        reason: { select: { id: true, label: true, category: true } },
        priorityValidation: { select: { outcome: true, deletedAt: true } },
      },
    }),
    getDevReturns(viewer, filters.memberId, from, to, filters.central),
    getReturnOverlap(viewer, from, to, filters.memberId),
  ])
  const list: DevReturnRow[] = rows.map(({ priorityValidation, ...r }) => ({
    ...r,
    validation: priorityValidation && !priorityValidation.deletedAt ? { outcome: priorityValidation.outcome } : null,
  }))
  return { from, to, rows: list, summary, overlap }
}

/* ───────────────────────────── Perfil ───────────────────────────── */

export const PROFILE_DEV_RETURN_DAYS = 90

export interface MemberDevReturnProfile {
  days: number
  stats: DevReturnStats
  topReason: { label: string; count: number } | null
  /** Devoluções por mês, 6 meses, do mais antigo ao atual. */
  series: number[]
}

/** Bloco do perfil: 90 dias com o total de chamados ao lado, motivo mais frequente e a série de 6 meses. */
export async function getMemberDevReturnProfile(viewer: Viewer, memberId: string, today = todayBusinessDate()): Promise<MemberDevReturnProfile> {
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - (PROFILE_DEV_RETURN_DAYS - 1))
  const [stats, breakdown, series] = await Promise.all([
    getDevReturns(viewer, memberId, from, today),
    getReasonBreakdown(viewer, memberId, from, today),
    getDevReturnSeries(viewer, memberId, 6, today),
  ])
  const top = breakdown.byReason[0]
  return {
    days: PROFILE_DEV_RETURN_DAYS,
    stats,
    topReason: top ? { label: top.label, count: top.count } : null,
    series: series.map((m) => m.stats.total),
  }
}
