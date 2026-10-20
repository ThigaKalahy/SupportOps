import type { AgreementPriority, AgreementStatus, CheckinOutcome, ProposalStatus } from "@prisma/client"

import { todayBusinessDate } from "../../lib/dates.ts"
import { deadlineSeverity, type DeadlineSeverity } from "../../lib/severity.ts"
import { db } from "../db.ts"
import { getDailyLock, memberOwnScope, type MemberContext } from "../member-scope.ts"

/**
 * PORTAL DO COLABORADOR (P25) — leituras de /me. Regra arquitetural, não estilo (D38):
 *
 * - Este arquivo NÃO importa nada das queries nem das actions do gestor, nem o escopo
 *   ou a timeline do gestor. Precisou de algo que existe lá? Duplica aqui. É o que
 *   garante que uma leitura nova do lado do gestor nunca fique alcançável daqui.
 * - Só toca: o combinado da própria pessoa (campos listados), as revisões dele nas
 *   dailies, os relatos e propostas dela, motivos de impeditivo e a daily (id, data,
 *   status). Nenhum registro gerencial, nem o que é sobre ela, nem o compartilhado (D40).
 * - Todo `where` começa com `memberOwnScope(ctx)` (time E pessoa) ou com o time do
 *   contexto, nunca só um dos dois.
 * - `select` explícito em toda leitura de combinado: campo novo não aparece sozinho.
 * - Nenhuma taxa, percentual ou agregado de desempenho, nem da própria pessoa (D7).
 */

const OPEN: AgreementStatus[] = ["OPEN", "IN_PROGRESS"]
const CLOSED: AgreementStatus[] = ["DONE", "CANCELLED"]

/* ─────────────────────────── Zona 1: combinados abertos ─────────────────────────── */

export interface MyOpenAgreement {
  id: string
  title: string
  description: string | null
  originalDueDate: Date
  dueDate: Date
  priority: AgreementPriority
  deadline: DeadlineSeverity
  /** Quantas vezes o prazo foi estendido numa daily. */
  reschedules: number
  /** Relato ainda não capturado por nenhuma daily (P26). */
  pendingReport: { outcome: CheckinOutcome; blockerText: string | null; reasonId: string | null; reason: string | null; suggestedDueDate: Date | null } | null
}

export async function getMyOpenAgreements(ctx: MemberContext): Promise<MyOpenAgreement[]> {
  const today = todayBusinessDate()
  const rows = await db.agreement.findMany({
    where: { ...memberOwnScope(ctx), deletedAt: null, status: { in: OPEN } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      originalDueDate: true,
      dueDate: true,
      priority: true,
      _count: { select: { checkins: { where: { teamId: ctx.teamId, newDueDate: { not: null } } } } },
      selfReports: {
        where: { ...memberOwnScope(ctx), dailyId: null },
        take: 1,
        select: { outcome: true, blockerText: true, blockerReasonId: true, suggestedDueDate: true, blockerReason: { select: { label: true } } },
      },
    },
  })
  return rows.map((a) => {
    const report = a.selfReports[0]
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      originalDueDate: a.originalDueDate,
      dueDate: a.dueDate,
      priority: a.priority,
      deadline: deadlineSeverity(a.dueDate, { today }),
      reschedules: a._count.checkins,
      pendingReport: report
        ? {
            outcome: report.outcome,
            blockerText: report.blockerText,
            reasonId: report.blockerReasonId,
            reason: report.blockerReason?.label ?? null,
            suggestedDueDate: report.suggestedDueDate,
          }
        : null,
    }
  })
}

/* ─────────────────────── Zona 2: registrado na última daily ─────────────────────── */

export interface MyLastDailyRecord {
  daily: { id: string; date: Date }
  /** Os combinados DELA revisados naquela daily. */
  reviewed: {
    agreementId: string
    title: string
    outcome: CheckinOutcome
    blockerText: string | null
    reason: string | null
    newDueDate: Date | null
    /** O que ela relatou, só quando o desfecho registrado foi outro (D44). */
    reportedOutcome: CheckinOutcome | null
  }[]
  /** Combinados novos atribuídos a ela naquela daily. */
  created: { id: string; title: string; dueDate: Date; status: AgreementStatus }[]
  /** Propostas dela capturadas por aquela daily, com a resposta do gestor. */
  proposals: { id: string; title: string; status: ProposalStatus; suggestedDueDate: Date | null; reply: string | null }[]
}

export async function getMyLastDailyRecord(ctx: MemberContext): Promise<MyLastDailyRecord | null> {
  const daily = await db.daily.findFirst({
    where: { teamId: ctx.teamId, status: "CLOSED" },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, date: true, status: true },
  })
  if (!daily) return null
  const [checkins, reports, created, proposals] = await Promise.all([
    db.agreementCheckin.findMany({
      where: { teamId: ctx.teamId, dailyId: daily.id, agreement: { ...memberOwnScope(ctx) } },
      orderBy: { createdAt: "asc" },
      select: {
        outcome: true,
        blockerText: true,
        newDueDate: true,
        blockerReason: { select: { label: true } },
        agreement: { select: { id: true, title: true } },
      },
    }),
    db.agreementSelfReport.findMany({
      where: { ...memberOwnScope(ctx), dailyId: daily.id },
      select: { agreementId: true, outcome: true },
    }),
    db.agreement.findMany({
      where: { ...memberOwnScope(ctx), sourceDailyId: daily.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, dueDate: true, status: true },
    }),
    db.memberProposal.findMany({
      where: { ...memberOwnScope(ctx), dailyId: daily.id },
      orderBy: { createdAt: "asc" },
      // `managerNote` da PROPOSTA é a resposta à pessoa; sai como `reply`.
      select: { id: true, title: true, status: true, suggestedDueDate: true, managerNote: true },
    }),
  ])
  const reported = new Map(reports.map((r) => [r.agreementId, r.outcome]))
  return {
    daily: { id: daily.id, date: daily.date },
    reviewed: checkins.map((c) => {
      const mine = reported.get(c.agreement.id) ?? null
      return {
        agreementId: c.agreement.id,
        title: c.agreement.title,
        outcome: c.outcome,
        blockerText: c.blockerText,
        reason: c.blockerReason?.label ?? null,
        newDueDate: c.newDueDate,
        reportedOutcome: mine && mine !== c.outcome ? mine : null,
      }
    }),
    created: created.map((a) => ({ id: a.id, title: a.title, dueDate: a.dueDate, status: a.status })),
    proposals: proposals.map((p) => ({ id: p.id, title: p.title, status: p.status, suggestedDueDate: p.suggestedDueDate, reply: p.managerNote })),
  }
}

/* ──────────────────────────────── Zona 3: histórico ──────────────────────────────── */

export interface MyClosedAgreement {
  id: string
  title: string
  status: AgreementStatus
  originalDueDate: Date
  dueDate: Date
  completedAt: Date | null
  outcome: string | null
}

/** Os últimos combinados encerrados dela, só para olhar para trás. Sem taxa, sem agregado. */
export async function getMyAgreementHistory(ctx: MemberContext, limit = 20): Promise<MyClosedAgreement[]> {
  const rows = await db.agreement.findMany({
    where: { ...memberOwnScope(ctx), deletedAt: null, status: { in: CLOSED } },
    orderBy: [{ completedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: Math.min(Math.max(limit, 1), 50),
    select: { id: true, title: true, status: true, originalDueDate: true, dueDate: true, completedAt: true, outcome: true },
  })
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    originalDueDate: a.originalDueDate,
    dueDate: a.dueDate,
    completedAt: a.completedAt,
    outcome: a.outcome,
  }))
}

/* ───────────────────────────── P26: escrita do colaborador ───────────────────────────── */

/** Motivos de impeditivo ativos do time (para o relato Parcial / Não feito). */
export async function getMyBlockerReasons(ctx: MemberContext): Promise<{ id: string; label: string }[]> {
  return db.blockerReason.findMany({
    where: { teamId: ctx.teamId, isActive: true },
    orderBy: { order: "asc" },
    select: { id: true, label: true },
  })
}

export interface MyPortalState {
  /** A daily do time está aberta agora (DRAFT há menos de 4 horas — D41). */
  locked: boolean
  /** A última daily registrada do time: quando muda, a tela pede para atualizar. */
  lastClosedDailyId: string | null
  lastClosedAt: Date | null
}

/** Estado leve que o portal consulta a cada 25 segundos (sem rota de API — D8). */
export async function getMyPortalState(ctx: MemberContext): Promise<MyPortalState> {
  const [lock, last] = await Promise.all([
    getDailyLock(ctx.teamId),
    db.daily.findFirst({
      where: { teamId: ctx.teamId, status: "CLOSED" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { id: true, date: true },
    }),
  ])
  return { locked: lock.locked, lastClosedDailyId: last?.id ?? null, lastClosedAt: last?.date ?? null }
}
