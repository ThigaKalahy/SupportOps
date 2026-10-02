import type { AgreementOrigin, AgreementPriority, AgreementStatus, CheckinOutcome, BlockerCategory } from "@prisma/client"

import {
  createdSince,
  DUE_SOON_DAYS,
  type AgreementFilters,
  type AgreementView,
} from "../../lib/agreement-filters.ts"
import { businessDaysBetween, todayBusinessDate } from "../../lib/dates.ts"
import { deadlineSeverity, type DeadlineSeverity } from "../../lib/severity.ts"
import { db } from "../db.ts"
import { memberScope, type Viewer } from "../visibility.ts"

/**
 * Leituras de combinados. Combinado não tem visibilidade própria (não é
 * registro privado), mas segue o escopo de organização/time do usuário.
 *
 * A central busca os combinados que passam pelos filtros (menos a aba) em UMA
 * consulta e reparte em memória: assim cada aba mostra a sua contagem sem
 * consultas extras. O volume é de dezenas por mês — não justifica paginação.
 */

export interface AgreementRow {
  id: string
  title: string
  member: { id: string; preferredName: string; fullName: string; seniorityLabel: string }
  origin: AgreementOrigin
  createdAt: Date
  originalDueDate: Date
  dueDate: Date
  priority: AgreementPriority
  status: AgreementStatus
  completedAt: Date | null
  /** Quantas vezes o prazo foi movido (checkins com novo prazo). */
  reschedules: number
  open: boolean
  /** Severidade do prazo; combinado encerrado é "resolved". */
  deadline: DeadlineSeverity
}

export type AgreementCounts = Record<AgreementView, number>

function inView(row: AgreementRow, view: AgreementView): boolean {
  const days = row.deadline.daysUntilDue
  if (view === "all") return true
  if (view === "done") return row.status === "DONE"
  if (!row.open) return false
  if (view === "open") return true
  if (view === "overdue") return days !== null && days < 0
  return days !== null && days >= 0 && days <= DUE_SOON_DAYS
}

/**
 * Ordem padrão: abertos primeiro, por prazo (vencidos, depois vencendo, depois
 * o resto); encerrados depois, do mais recente para o mais antigo.
 */
function compare(a: AgreementRow, b: AgreementRow): number {
  if (a.open !== b.open) return a.open ? -1 : 1
  if (a.open) return a.dueDate.getTime() - b.dueDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime()
  const closedA = (a.completedAt ?? a.createdAt).getTime()
  const closedB = (b.completedAt ?? b.createdAt).getTime()
  return closedB - closedA
}

export async function listAgreements(
  viewer: Viewer,
  filters: AgreementFilters,
): Promise<{ rows: AgreementRow[]; counts: AgreementCounts }> {
  const since = createdSince(filters.created)
  const agreements = await db.agreement.findMany({
    where: {
      member: {
        ...memberScope(viewer),
        ...(filters.seniority ? { seniority: { key: filters.seniority } } : {}),
      },
      ...(filters.memberId ? { memberId: filters.memberId } : {}),
      ...(filters.origin ? { origin: filters.origin } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: {
      id: true,
      title: true,
      origin: true,
      createdAt: true,
      originalDueDate: true,
      dueDate: true,
      priority: true,
      status: true,
      completedAt: true,
      member: { select: { id: true, preferredName: true, fullName: true, seniority: { select: { label: true } } } },
      _count: { select: { checkins: { where: { newDueDate: { not: null } } } } },
    },
  })

  const today = todayBusinessDate()
  const all = agreements.map((a): AgreementRow => {
    const open = a.status === "OPEN" || a.status === "IN_PROGRESS"
    return {
      id: a.id,
      title: a.title,
      member: {
        id: a.member.id,
        preferredName: a.member.preferredName,
        fullName: a.member.fullName,
        seniorityLabel: a.member.seniority.label,
      },
      origin: a.origin,
      createdAt: a.createdAt,
      originalDueDate: a.originalDueDate,
      dueDate: a.dueDate,
      priority: a.priority,
      status: a.status,
      completedAt: a.completedAt,
      reschedules: a._count.checkins,
      open,
      deadline: deadlineSeverity(a.dueDate, { resolved: !open, today }),
    }
  })

  const counts = Object.fromEntries(
    (["overdue", "due-soon", "open", "done", "all"] as const).map((view) => [view, all.filter((r) => inView(r, view)).length]),
  ) as AgreementCounts

  return { rows: all.filter((r) => inView(r, filters.view)).sort(compare), counts }
}

/** Pessoas ativas para filtros e para o responsável do combinado. */
export async function listAgreementMembers(viewer: Viewer) {
  const members = await db.teamMember.findMany({
    where: { ...memberScope(viewer), status: { not: "INACTIVE" } },
    orderBy: { preferredName: "asc" },
    select: { id: true, preferredName: true, seniority: { select: { key: true, label: true, order: true } } },
  })
  return members.map((m) => ({ id: m.id, preferredName: m.preferredName, seniorityKey: m.seniority.key }))
}

export type AgreementMemberOption = Awaited<ReturnType<typeof listAgreementMembers>>[number]

export interface AgreementCheckinRow {
  id: string
  dailyDate: Date
  outcome: CheckinOutcome
  blockerText: string | null
  blockerReason: { label: string; category: BlockerCategory } | null
  newDueDate: Date | null
  author: string
}

/** Combinado com o histórico completo de revisões, em ordem cronológica. */
export async function getAgreementDetail(viewer: Viewer, id: string) {
  const agreement = await db.agreement.findFirst({
    where: { id, member: memberScope(viewer) },
    include: {
      member: { select: { id: true, preferredName: true, fullName: true } },
      author: { select: { name: true } },
      sourceDaily: { select: { id: true, date: true } },
      replaces: { select: { id: true, title: true, status: true } },
      replacedBy: { select: { id: true, title: true, status: true } },
      checkins: {
        orderBy: [{ daily: { date: "asc" } }, { createdAt: "asc" }],
        select: {
          id: true,
          outcome: true,
          blockerText: true,
          newDueDate: true,
          daily: { select: { date: true } },
          blockerReason: { select: { label: true, category: true } },
          author: { select: { name: true } },
        },
      },
    },
  })
  if (!agreement) return null
  const open = agreement.status === "OPEN" || agreement.status === "IN_PROGRESS"
  const today = todayBusinessDate()
  const checkins: AgreementCheckinRow[] = agreement.checkins.map((c) => ({
    id: c.id,
    dailyDate: c.daily.date,
    outcome: c.outcome,
    blockerText: c.blockerText,
    blockerReason: c.blockerReason,
    newDueDate: c.newDueDate,
    author: c.author.name,
  }))
  return {
    id: agreement.id,
    title: agreement.title,
    description: agreement.description,
    member: agreement.member,
    origin: agreement.origin,
    sourceDaily: agreement.sourceDaily,
    createdAt: agreement.createdAt,
    originalDueDate: agreement.originalDueDate,
    dueDate: agreement.dueDate,
    priority: agreement.priority,
    status: agreement.status,
    completedAt: agreement.completedAt,
    outcome: agreement.outcome,
    author: agreement.author.name,
    replaces: agreement.replaces,
    replacedBy: agreement.replacedBy,
    open,
    deadline: deadlineSeverity(agreement.dueDate, { resolved: !open, today }),
    /** Dias entre o prazo original e o atual (arrasto acumulado). */
    slipDays: businessDaysBetween(agreement.originalDueDate, agreement.dueDate),
    reschedules: checkins.filter((c) => c.newDueDate !== null).length,
    checkins,
  }
}

export type AgreementDetail = NonNullable<Awaited<ReturnType<typeof getAgreementDetail>>>
