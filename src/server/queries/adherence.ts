import type { BlockerCategory } from "@prisma/client"

import {
  ADHERENCE,
  clampPeriod,
  computeAdherence,
  lastMonths,
  makeRate,
  makeTrend,
  trendWindows,
  type Adherence,
  type AdherenceAgreement,
  type Rate,
  type Trend,
} from "../../lib/adherence.ts"
import { todayBusinessDate } from "../../lib/dates.ts"
import { db } from "../db.ts"
import { teamScope, type TeamContext } from "../scope.ts"

/**
 * Cumprimento de combinados ao longo do tempo. Nenhuma taxa é persistida
 * (D19): tudo é calculado aqui, sobre originalDueDate (D17), completedAt e
 * AgreementCheckin, com as regras de src/lib/adherence.ts. Toda taxa vem com
 * o denominador e o aviso de amostra pequena. Combinado não tem visibilidade
 * própria: segue o escopo de pessoas do usuário.
 *
 * Métrica não é avaliação: nada aqui escreve TimelineEvent nem aparece
 * sozinho em superfície de feedback.
 */

type Row = AdherenceAgreement & { memberId: string }

/** Combinados com prazo original no intervalo, já com reagendamentos e o último impeditivo. */
async function loadAgreements(ctx: TeamContext, memberId: string | null, from: Date, to: Date): Promise<Row[]> {
  if (from.getTime() > to.getTime()) return []
  const rows = await db.agreement.findMany({
    where: {
      ...teamScope(ctx),
      originalDueDate: { gte: from, lte: to },
      ...(memberId ? { memberId } : {}),
    },
    select: {
      id: true,
      memberId: true,
      status: true,
      originalDueDate: true,
      completedAt: true,
      checkins: {
        orderBy: [{ daily: { date: "asc" } }, { createdAt: "asc" }],
        select: { newDueDate: true, blockerReason: { select: { category: true } } },
      },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    status: r.status,
    originalDueDate: r.originalDueDate,
    completedAt: r.completedAt,
    reschedules: r.checkins.filter((c) => c.newDueDate !== null).length,
    lastBlockerCategory: r.checkins.findLast((c) => c.blockerReason !== null)?.blockerReason?.category ?? null,
  }))
}

/** Cumprimento de uma pessoa (ou do escopo inteiro, com memberId null) no período. */
export async function getAdherence(
  ctx: TeamContext,
  memberId: string | null,
  from: Date,
  to: Date,
  today = todayBusinessDate(),
): Promise<Adherence> {
  const period = clampPeriod(from, to, today)
  return computeAdherence(await loadAgreements(ctx, memberId, period.from, period.to), period, today)
}

export type MonthlyAdherence = Adherence & { month: Date }

/** A mesma medida, mês a mês, nos últimos N meses (o corrente até hoje). "No decorrer do tempo". */
export async function getAdherenceSeries(
  ctx: TeamContext,
  memberId: string | null,
  months: number,
  today = todayBusinessDate(),
): Promise<MonthlyAdherence[]> {
  const ranges = lastMonths(today, months)
  const first = ranges[0]
  if (!first) return []
  const rows = await loadAgreements(ctx, memberId, first.from, today)
  return ranges.map((range) => {
    const inMonth = rows.filter((r) => r.originalDueDate >= range.from && r.originalDueDate <= range.to)
    return { month: range.from, ...computeAdherence(inMonth, range, today) }
  })
}

/** Tendência: últimos 30 dias contra os 30 anteriores. */
function trendOf(rows: Row[], today: Date): Trend {
  const w = trendWindows(today)
  const inWindow = (r: Row, win: { from: Date; to: Date }) => r.originalDueDate >= win.from && r.originalDueDate <= win.to
  const current = computeAdherence(rows.filter((r) => inWindow(r, w.current)), w.current, today)
  const previous = computeAdherence(rows.filter((r) => inWindow(r, w.previous)), w.previous, today)
  return makeTrend(current.adherenceRate, previous.adherenceRate)
}

export async function getAdherenceTrend(ctx: TeamContext, memberId: string, today = todayBusinessDate()): Promise<Trend> {
  const w = trendWindows(today)
  return trendOf(await loadAgreements(ctx, memberId, w.previous.from, today), today)
}

export interface BlockerBreakdown {
  /** Checkins Parcial/Não feito com data da daily no período. */
  total: number
  byReason: { reasonId: string | null; label: string | null; category: BlockerCategory | null; count: number }[]
  byCategory: { category: BlockerCategory | null; count: number }[]
}

/**
 * Impeditivos do período, por motivo e por categoria (D18): o que separa "não
 * cumpre" de "é bloqueado". Conta cada revisão Parcial/Não feito pela data da
 * daily. Impeditivo sem motivo registrado aparece com label null.
 */
export async function getBlockerBreakdown(
  ctx: TeamContext,
  memberId: string | null,
  from: Date,
  to: Date,
  today = todayBusinessDate(),
): Promise<BlockerBreakdown> {
  const period = clampPeriod(from, to, today)
  const checkins = await db.agreementCheckin.findMany({
    where: {
      ...teamScope(ctx),
      outcome: { in: ["PARTIAL", "NOT_DONE"] },
      daily: { date: { gte: period.from, lte: period.to } },
      agreement: { deletedAt: null, ...(memberId ? { memberId } : {}) },
    },
    select: { blockerReason: { select: { id: true, label: true, category: true, order: true } } },
  })
  const reasons = new Map<string, BlockerBreakdown["byReason"][number] & { order: number }>()
  const categories = new Map<BlockerCategory | null, number>()
  for (const { blockerReason: r } of checkins) {
    const key = r?.id ?? "none"
    const entry = reasons.get(key) ?? {
      reasonId: r?.id ?? null,
      label: r?.label ?? null,
      category: r?.category ?? null,
      count: 0,
      order: r?.order ?? Number.MAX_SAFE_INTEGER,
    }
    entry.count++
    reasons.set(key, entry)
    categories.set(r?.category ?? null, (categories.get(r?.category ?? null) ?? 0) + 1)
  }
  return {
    total: checkins.length,
    byReason: [...reasons.values()]
      .sort((a, b) => b.count - a.count || a.order - b.order)
      .map((r) => ({ reasonId: r.reasonId, label: r.label, category: r.category, count: r.count })),
    byCategory: [...categories.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
  }
}

export interface MemberAdherenceRow {
  member: { id: string; preferredName: string; fullName: string; seniorityLabel: string; seniorityOrder: number }
  adherence: Adherence
  trend: Trend
}

export interface TeamAdherence {
  from: Date
  to: Date
  members: MemberAdherenceRow[]
  /** Soma de todas as pessoas, inclusive as de amostra pequena. */
  totalDue: number
  /**
   * Taxa do time: só pessoas com amostra suficiente (totalDue >= 5) entram,
   * no numerador e no denominador. Quem ficou de fora é contado.
   */
  teamRate: Rate
  teamAdjustedRate: Rate
  excludedMembers: number
  topBlocker: BlockerBreakdown["byReason"][number] | null
}

/**
 * Cumprimento por pessoa no período, com a tendência de 30 dias, e o
 * agregado do time. Pessoas ativas do escopo (desligadas ficam de fora).
 * Ordem alfabética; quem ordena por taxa é a tela, a pedido.
 */
export async function getTeamAdherence(ctx: TeamContext, from: Date, to: Date, today = todayBusinessDate()): Promise<TeamAdherence> {
  const period = clampPeriod(from, to, today)
  const w = trendWindows(today)
  const [members, periodRows, trendRows, blockers] = await Promise.all([
    db.teamMember.findMany({
      where: teamScope(ctx),
      orderBy: { preferredName: "asc" },
      select: { id: true, preferredName: true, fullName: true, seniority: { select: { label: true, order: true } } },
    }),
    loadAgreements(ctx, null, period.from, period.to),
    loadAgreements(ctx, null, w.previous.from, today),
    getBlockerBreakdown(ctx, null, period.from, period.to, today),
  ])

  const rows: MemberAdherenceRow[] = members.map((m) => ({
    member: {
      id: m.id,
      preferredName: m.preferredName,
      fullName: m.fullName,
      seniorityLabel: m.seniority.label,
      seniorityOrder: m.seniority.order,
    },
    adherence: computeAdherence(periodRows.filter((r) => r.memberId === m.id), period, today),
    trend: trendOf(trendRows.filter((r) => r.memberId === m.id), today),
  }))

  const sufficient = rows.filter((r) => r.adherence.totalDue >= ADHERENCE.minSample)
  const sum = (list: MemberAdherenceRow[], pick: (a: Adherence) => number) => list.reduce((s, r) => s + pick(r.adherence), 0)
  return {
    from: period.from,
    to: period.to,
    members: rows,
    totalDue: sum(rows, (a) => a.totalDue),
    teamRate: makeRate(sum(sufficient, (a) => a.doneOnTime), sum(sufficient, (a) => a.totalDue)),
    teamAdjustedRate: makeRate(sum(sufficient, (a) => a.doneOnTime), sum(sufficient, (a) => a.adjustedTotal)),
    excludedMembers: rows.filter((r) => r.adherence.totalDue > 0 && r.adherence.totalDue < ADHERENCE.minSample).length,
    topBlocker: blockers.byReason[0] ?? null,
  }
}

/** Títulos dos combinados (ex.: os crônicos do período), para os links do bloco. */
export async function getAgreementTitles(ctx: TeamContext, ids: string[]): Promise<{ id: string; title: string }[]> {
  if (ids.length === 0) return []
  return db.agreement.findMany({
    where: { id: { in: ids }, ...teamScope(ctx) },
    orderBy: { originalDueDate: "asc" },
    select: { id: true, title: true },
  })
}

export const PROFILE_ADHERENCE_DAYS = 90
export const PROFILE_SERIES_MONTHS = 6

/** Tudo o que o perfil mostra de cumprimento: 90 dias, 6 meses, tendência, impeditivos e crônicos. */
export async function getMemberAdherenceProfile(ctx: TeamContext, memberId: string, today = todayBusinessDate()) {
  const from = new Date(today)
  from.setUTCDate(from.getUTCDate() - (PROFILE_ADHERENCE_DAYS - 1))
  const [adherence, series, trend, breakdown] = await Promise.all([
    getAdherence(ctx, memberId, from, today, today),
    getAdherenceSeries(ctx, memberId, PROFILE_SERIES_MONTHS, today),
    getAdherenceTrend(ctx, memberId, today),
    getBlockerBreakdown(ctx, memberId, from, today, today),
  ])
  const chronic = await getAgreementTitles(ctx, adherence.chronicIds)
  return { days: PROFILE_ADHERENCE_DAYS, adherence, series, trend, breakdown, chronic }
}
