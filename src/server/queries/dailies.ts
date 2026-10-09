import type { CheckinOutcome } from "@prisma/client"

import { todayBusinessDate } from "../../lib/dates.ts"
import { deadlineSeverity, type DeadlineSeverity } from "../../lib/severity.ts"
import { db } from "../db.ts"
import { listActiveCentrals } from "./centrals.ts"
import { activeWatchByLink } from "./watch.ts"
import { memberScope, type Viewer } from "../visibility.ts"
import type { WhatsAppDaily } from "../whatsapp.ts"

/**
 * Leituras de dailies. Daily e combinado não têm visibilidade própria (não são
 * registro privado); seguem o escopo de organização/time do usuário.
 */

/** Time do usuário: MANAGER vê o próprio; OWNER e VIEWER, o primeiro da organização. */
export async function teamFor(viewer: Viewer) {
  return db.team.findFirst({
    where: viewer.role === "MANAGER" ? { managerUserId: viewer.id } : { organizationId: viewer.organizationId },
    orderBy: { name: "asc" },
    select: { id: true },
  })
}

export interface ReviewItem {
  id: string
  title: string
  dueDate: Date
  reschedules: number
  deadline: DeadlineSeverity
  /** Criado na daily anterior (e não só vencido). */
  fromPreviousDaily: boolean
}

export interface ReviewGroup {
  member: { id: string; preferredName: string }
  items: ReviewItem[]
}

/**
 * Tudo o que /dailies/new precisa ao abrir: os combinados a revisar —
 * (a) criados na daily anterior, qualquer prazo, ainda abertos, mais
 * (b) abertos com prazo até a data da daily — sem repetição e agrupados por
 * pessoa; os membros ativos; e os motivos de impeditivo.
 */
export async function getDailyForm(viewer: Viewer, date: Date = todayBusinessDate()) {
  const team = await teamFor(viewer)
  if (!team) return null
  const scope = { ...memberScope(viewer), teamId: team.id }

  const previous = await db.daily.findFirst({
    where: { teamId: team.id, date: { lt: date } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, date: true },
  })

  const [agreements, members, reasons, sameDay, centrals] = await Promise.all([
    db.agreement.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        member: { ...scope, deletedAt: null },
        OR: [...(previous ? [{ sourceDailyId: previous.id }] : []), { dueDate: { lte: date } }],
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        dueDate: true,
        sourceDailyId: true,
        member: { select: { id: true, preferredName: true } },
        _count: { select: { checkins: { where: { newDueDate: { not: null } } } } },
      },
    }),
    db.teamMember.findMany({
      where: { ...scope, status: { in: ["ACTIVE", "OFFBOARDING"] } },
      orderBy: { preferredName: "asc" },
      select: { id: true, preferredName: true },
    }),
    db.blockerReason.findMany({
      where: { organizationId: viewer.organizationId, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, label: true, category: true },
    }),
    // Já existe daily nesta data? A tela avisa, mas não impede (pode haver duas no dia).
    db.daily.findMany({
      where: { teamId: team.id, date },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true },
    }),
    listActiveCentrals(viewer),
  ])

  const groups = new Map<string, ReviewGroup>()
  for (const a of agreements) {
    const group = groups.get(a.member.id) ?? { member: a.member, items: [] }
    group.items.push({
      id: a.id,
      title: a.title,
      dueDate: a.dueDate,
      reschedules: a._count.checkins,
      deadline: deadlineSeverity(a.dueDate, { today: date }),
      fromPreviousDaily: previous !== null && a.sourceDailyId === previous.id,
    })
    groups.set(a.member.id, group)
  }

  return {
    teamId: team.id,
    date,
    previousDaily: previous?.date ?? null,
    review: [...groups.values()].sort((a, b) => a.member.preferredName.localeCompare(b.member.preferredName)),
    members,
    reasons,
    sameDay,
    centrals,
    // P21: observação ativa já ligada a cada combinado a revisar (o botão abre a existente).
    watching: await activeWatchByLink(viewer, "agreementId", agreements.map((a) => a.id)),
  }
}

export type DailyForm = NonNullable<Awaited<ReturnType<typeof getDailyForm>>>

const detailInclude = {
  author: { select: { name: true } },
  participants: {
    select: {
      memberId: true,
      present: true,
      note: true,
      blocker: true,
      member: { select: { preferredName: true } },
    },
  },
  checkins: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      outcome: true,
      blockerText: true,
      newDueDate: true,
      blockerReason: { select: { label: true } },
      agreement: {
        select: {
          id: true,
          title: true,
          member: { select: { preferredName: true } },
          replacedBy: { select: { id: true, title: true, dueDate: true } },
        },
      },
    },
  },
  sourcedAgreements: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      title: true,
      dueDate: true,
      status: true,
      replacesAgreementId: true,
      member: { select: { preferredName: true } },
      central: { select: { name: true } },
    },
  },
}

type DailyWithDetail = NonNullable<Awaited<ReturnType<typeof findDaily>>>

function findDaily(id: string, viewer: Viewer) {
  return db.daily.findFirst({
    where: { id, team: { organizationId: viewer.organizationId } },
    include: detailInclude,
  })
}

export interface DailyDetail {
  id: string
  date: Date
  summary: string | null
  decisions: string | null
  author: string
  present: { memberId: string; name: string; note: string | null; blocker: string | null }[]
  absent: { memberId: string; name: string }[]
  reviewed: {
    id: string
    agreementId: string
    title: string
    name: string
    outcome: CheckinOutcome
    blockerText: string | null
    reason: string | null
    newDueDate: Date | null
    replacement: { id: string; title: string; dueDate: Date } | null
  }[]
  created: { id: string; title: string; name: string; dueDate: Date; central: string | null; isReplacement: boolean }[]
  whatsapp: WhatsAppDaily
}

function toDetail(daily: DailyWithDetail): DailyDetail {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
  const present = daily.participants
    .filter((p) => p.present)
    .map((p) => ({ memberId: p.memberId, name: p.member.preferredName, note: p.note, blocker: p.blocker }))
    .sort(byName)
  const absent = daily.participants
    .filter((p) => !p.present)
    .map((p) => ({ memberId: p.memberId, name: p.member.preferredName }))
    .sort(byName)
  const reviewed = daily.checkins.map((c) => ({
    id: c.id,
    agreementId: c.agreement.id,
    title: c.agreement.title,
    name: c.agreement.member.preferredName,
    outcome: c.outcome,
    blockerText: c.blockerText,
    reason: c.blockerReason?.label ?? null,
    newDueDate: c.newDueDate,
    replacement: c.outcome !== "DONE" && !c.newDueDate ? c.agreement.replacedBy : null,
  }))
  const created = daily.sourcedAgreements.map((a) => ({
    id: a.id,
    title: a.title,
    name: a.member.preferredName,
    dueDate: a.dueDate,
    central: a.central?.name ?? null,
    isReplacement: a.replacesAgreementId !== null,
  }))
  return {
    id: daily.id,
    date: daily.date,
    summary: daily.summary,
    decisions: daily.decisions,
    author: daily.author.name,
    present,
    absent,
    reviewed,
    created,
    whatsapp: {
      date: daily.date,
      reviewed: reviewed.map((r) => ({
        name: r.name,
        title: r.title,
        outcome: r.outcome,
        blockerText: r.blockerText,
        newDueDate: r.newDueDate,
        replacement: r.replacement,
      })),
      created: created
        .filter((c) => !c.isReplacement)
        .map((c) => ({ name: c.name, central: c.central, title: c.title, dueDate: c.dueDate })),
      blockers: present.flatMap((p) => (p.blocker ? [{ name: p.name, text: p.blocker }] : [])),
    },
  }
}

export async function getDailyDetail(viewer: Viewer, id: string): Promise<DailyDetail | null> {
  const daily = await findDaily(id, viewer)
  return daily ? toDetail(daily) : null
}

/** Histórico: todas as dailies do time, da mais recente para a mais antiga, já com o detalhe. */
export async function listDailies(viewer: Viewer): Promise<DailyDetail[]> {
  const team = await teamFor(viewer)
  if (!team) return []
  const dailies = await db.daily.findMany({
    where: { teamId: team.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: detailInclude,
  })
  return dailies.map(toDetail)
}
