import type { CheckinOutcome } from "@prisma/client"

import { businessRangeInstants, todayBusinessDate } from "../../lib/dates.ts"
import { isLockActive } from "../../lib/daily-lock.ts"
import { deadlineSeverity, type DeadlineSeverity } from "../../lib/severity.ts"
import { MODULES } from "../../lib/modules.ts"
import { rouletteWindowOpen } from "../../lib/scrum-master.ts"
import { db } from "../db.ts"
import { listActiveCentrals } from "./centrals.ts"
import { activeWatchByLink } from "./watch.ts"
import { hasModule, teamScope, type TeamContext } from "../scope.ts"
import { visibilityFilter } from "../visibility.ts"
import type { WhatsAppDaily } from "../whatsapp.ts"
import { vacationCovering } from "../../lib/vacations.ts"

/**
 * Leituras de dailies. Daily e combinado não têm visibilidade própria (não são
 * registro privado); seguem o escopo de time do contexto (teamScope, D30).
 */

/** O time da daily é sempre o do contexto (P22): nunca "o primeiro da organização". */
export async function teamFor(ctx: TeamContext) {
  return db.team.findFirst({ where: { id: ctx.teamId, isActive: true }, select: { id: true, name: true } })
}

export interface ReviewItem {
  id: string
  title: string
  dueDate: Date
  reschedules: number
  deadline: DeadlineSeverity
  /** Criado na daily anterior (e não só vencido). */
  fromPreviousDaily: boolean
  /** Central do combinado (P19), quando preenchida; null também com o módulo desligado (D32). */
  centralName: string | null
  centralId: string | null
  /** O porquê do combinado: primeira linha dos detalhes. */
  why: string | null
  /** O caso por trás (observação ATIVA ligada, legível por quem lê). */
  watch: { id: string; title: string } | null
  /** P26: o que a pessoa relatou no portal, capturado por esta daily (só na daily aberta). */
  selfReport: {
    id: string
    outcome: CheckinOutcome
    blockerText: string | null
    blockerReasonId: string | null
    reason: string | null
    suggestedDueDate: Date | null
  } | null
  /** C11: já revisado NESTA daily (edição) — a linha fica travada, mostrando o desfecho gravado. */
  reviewed: { outcome: CheckinOutcome; blockerText: string | null; newDueDate: Date | null; replacement: string | null } | null
}

/** C11: combinado criado na daily em edição (Seção 3). Travado se já foi revisado ou encerrado. */
export interface EditRow {
  id: string
  memberId: string
  centralId: string | null
  title: string
  why: string | null
  dueDate: Date
  locked: boolean
}

/** Primeira linha não vazia de um texto (o "porquê" que cabe numa linha). */
function firstLine(text: string | null | undefined): string | null {
  return text?.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null
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
export async function getDailyForm(ctx: TeamContext, requestedDate: Date = todayBusinessDate(), editId?: string, draftId?: string) {
  const team = await teamFor(ctx)
  if (!team) return null
  const scope = teamScope(ctx)

  // P26: a daily ABERTA (DRAFT) que este formulário vai fechar — com os relatos e as
  // propostas que ela capturou ao ser aberta.
  const draft = draftId
    ? await db.daily.findFirst({
        where: { ...scope, id: draftId, status: "DRAFT" },
        select: { id: true, date: true, openedAt: true, openedByUserId: true, openedBy: { select: { name: true } } },
      })
    : null
  if (draftId && !draft) return null

  // C11: edição de uma daily salva no formato de criação. A data é a da daily; as revisões
  // gravadas nela voltam travadas; os combinados criados nela viram linhas editáveis.
  const editing = editId
    ? await db.daily.findFirst({
        where: { ...scope, id: editId, status: "CLOSED" },
        select: {
          id: true,
          date: true,
          summary: true,
          decisions: true,
          participants: { select: { memberId: true, present: true, note: true, blocker: true, member: { select: { preferredName: true } } } },
          checkins: {
            select: {
              agreementId: true,
              outcome: true,
              blockerText: true,
              newDueDate: true,
              agreement: { select: { replacedBy: { select: { title: true } } } },
            },
          },
          sourcedAgreements: {
            where: { deletedAt: null, replacesAgreementId: null },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              memberId: true,
              centralId: true,
              title: true,
              description: true,
              dueDate: true,
              status: true,
              _count: { select: { checkins: true } },
            },
          },
        },
      })
    : null
  if (editId && !editing) return null
  const date = editing?.date ?? draft?.date ?? requestedDate
  const reviewedHere = new Map((editing?.checkins ?? []).map((c) => [c.agreementId, c]))
  const [captured, proposals] = draft
    ? await Promise.all([
        db.agreementSelfReport.findMany({
          where: { ...scope, dailyId: draft.id },
          select: { id: true, agreementId: true, outcome: true, blockerText: true, blockerReasonId: true, suggestedDueDate: true, blockerReason: { select: { label: true } } },
        }),
        db.memberProposal.findMany({
          where: { ...scope, dailyId: draft.id, status: "PENDING" },
          orderBy: { createdAt: "asc" },
          select: { id: true, title: true, suggestedDueDate: true, note: true, member: { select: { id: true, preferredName: true } } },
        }),
      ])
    : [[], []]
  const reportFor = new Map(captured.map((r) => [r.agreementId, r]))

  // A daily anterior é a última REGISTRADA (a aberta não conta).
  const previous = await db.daily.findFirst({
    where: { ...scope, status: "CLOSED", date: { lt: date } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, date: true },
  })

  const [agreements, members, reasons, sameDay, centrals] = await Promise.all([
    db.agreement.findMany({
      where: editing
        ? {
            ...scope,
            member: { deletedAt: null },
            OR: [
              // Os que ficaram sem desfecho: elegíveis pela mesma regra, fora os criados nela
              // e os já revisados numa daily posterior.
              {
                status: { in: ["OPEN", "IN_PROGRESS"] },
                AND: [
                  { OR: [...(previous ? [{ sourceDailyId: previous.id }] : []), { dueDate: { lte: date } }] },
                  { OR: [{ sourceDailyId: null }, { sourceDailyId: { not: editing.id } }] },
                ],
                checkins: { none: { daily: { date: { gt: date } } } },
              },
              { checkins: { some: { dailyId: editing.id } } },
            ],
          }
        : {
            ...scope,
            status: { in: ["OPEN", "IN_PROGRESS"] },
            member: { deletedAt: null },
            OR: [...(previous ? [{ sourceDailyId: previous.id }] : []), { dueDate: { lte: date } }],
          },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        dueDate: true,
        sourceDailyId: true,
        description: true,
        watchItemId: true,
        member: { select: { id: true, preferredName: true } },
        central: { select: { id: true, name: true } },
        _count: { select: { checkins: { where: { newDueDate: { not: null } } } } },
      },
    }),
    db.teamMember.findMany({
      // C4: de férias na data da daily não entra na presença (os combinados dela continuam na revisão).
      where: { ...scope, status: { in: ["ACTIVE", "OFFBOARDING"] }, vacations: { none: vacationCovering(ctx.teamId, date) } },
      orderBy: { preferredName: "asc" },
      select: { id: true, preferredName: true },
    }),
    db.blockerReason.findMany({
      where: { ...scope, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, label: true, category: true },
    }),
    // Já existe daily nesta data? A tela avisa, mas não impede (pode haver duas no dia).
    db.daily.findMany({
      where: { ...scope, date },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true },
    }),
    // Módulo de centrais desligado (D32): a daily não oferece o campo.
    hasModule(ctx, MODULES.CENTRALS) ? listActiveCentrals(ctx) : Promise.resolve([]),
  ])

  // O caso por trás de cada combinado: a observação ligada (C7) ou a que nasceu dele. Vem para todo
  // time — o próximo passo entra nela (C13); a linha "Em observação" da revisão é do módulo do porquê.
  const whyOn = hasModule(ctx, MODULES.AGREEMENT_WHY)
  const watchRows = agreements.length
    ? await db.watchItem.findMany({
        where: {
          ...scope,
          deletedAt: null,
          status: "ACTIVE",
          ...visibilityFilter(ctx),
          OR: [
            { id: { in: agreements.flatMap((a) => (a.watchItemId ? [a.watchItemId] : [])) } },
            { agreementId: { in: agreements.map((a) => a.id) } },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, agreementId: true },
      })
    : []
  const watchFor = (a: { id: string; watchItemId: string | null }) =>
    watchRows.find((w) => w.id === a.watchItemId) ?? watchRows.find((w) => w.agreementId === a.id) ?? null

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
      centralName: hasModule(ctx, MODULES.CENTRALS) ? (a.central?.name ?? null) : null,
      centralId: hasModule(ctx, MODULES.CENTRALS) ? (a.central?.id ?? null) : null,
      why: whyOn ? firstLine(a.description) : null,
      watch: ((w) => (w ? { id: w.id, title: w.title } : null))(watchFor(a)),
      reviewed: ((c) =>
        c
          ? { outcome: c.outcome, blockerText: c.blockerText, newDueDate: c.newDueDate, replacement: c.agreement.replacedBy?.title ?? null }
          : null)(reviewedHere.get(a.id)),
      selfReport: ((r) =>
        r
          ? { id: r.id, outcome: r.outcome, blockerText: r.blockerText, blockerReasonId: r.blockerReasonId, reason: r.blockerReason?.label ?? null, suggestedDueDate: r.suggestedDueDate }
          : null)(reportFor.get(a.id)),
    })
    groups.set(a.member.id, group)
  }

  return {
    teamId: team.id,
    /** Nome do time ativo: título do texto do WhatsApp (nunca fixo — multi-time). */
    teamName: team.name,
    date,
    previousDaily: previous?.date ?? null,
    review: [...groups.values()].sort((a, b) => a.member.preferredName.localeCompare(b.member.preferredName)),
    // Na edição, a presença é a lista gravada na daily (a mesma que a edição confere no servidor).
    members: editing
      ? editing.participants
          .map((p) => ({ id: p.memberId, preferredName: p.member.preferredName }))
          .sort((a, b) => a.preferredName.localeCompare(b.preferredName))
      : members,
    reasons,
    sameDay,
    centrals,
    centralsEnabled: hasModule(ctx, MODULES.CENTRALS),
    whyEnabled: hasModule(ctx, MODULES.AGREEMENT_WHY),
    // P21: observação ativa já ligada a cada combinado a revisar (o botão abre a existente).
    watching: await activeWatchByLink(ctx, "agreementId", agreements.map((a) => a.id)),
    // P26: a daily aberta, os relatos ("6 de 9 relataram") e as propostas do time.
    draft: draft
      ? {
          id: draft.id,
          openedAt: draft.openedAt,
          openedBy: draft.openedBy?.name ?? null,
          mine: draft.openedByUserId === ctx.userId,
          locking: isLockActive(draft.openedAt),
        }
      : null,
    reportStats: draft
      ? {
          reported: [...groups.values()].filter((g) => g.items.some((i) => i.selfReport)).length,
          total: groups.size,
        }
      : null,
    proposals: proposals.map((p) => ({
      id: p.id,
      title: p.title,
      suggestedDueDate: p.suggestedDueDate,
      note: p.note,
      memberId: p.member.id,
      memberName: p.member.preferredName,
    })),
    edit: editing
      ? {
          dailyId: editing.id,
          summary: editing.summary,
          decisions: editing.decisions,
          participants: editing.participants.map((p) => ({ memberId: p.memberId, present: p.present, note: p.note, blocker: p.blocker })),
          rows: editing.sourcedAgreements.map(
            (a): EditRow => ({
              id: a.id,
              memberId: a.memberId,
              centralId: hasModule(ctx, MODULES.CENTRALS) ? a.centralId : null,
              title: a.title,
              why: whyOn ? a.description : null,
              dueDate: a.dueDate,
              locked: a._count.checkins > 0 || (a.status !== "OPEN" && a.status !== "IN_PROGRESS"),
            }),
          ),
        }
      : null,
  }
}

export type DailyForm = NonNullable<Awaited<ReturnType<typeof getDailyForm>>>

const detailInclude = {
  author: { select: { name: true } },
  team: { select: { name: true } },
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
          description: true,
          memberId: true,
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
      description: true,
      memberId: true,
      member: { select: { preferredName: true } },
      central: { select: { name: true } },
    },
  },
}

type DailyWithDetail = NonNullable<Awaited<ReturnType<typeof findDaily>>>

function findDaily(id: string, ctx: TeamContext) {
  return db.daily.findFirst({
    where: { id, ...teamScope(ctx), status: "CLOSED" },
    include: detailInclude,
  })
}

export interface DailyDetail {
  id: string
  date: Date
  summary: string | null
  decisions: string | null
  author: string
  /** Nome do time da daily: título do PDF e do WhatsApp. */
  teamName: string
  present: { memberId: string; name: string; note: string | null; blocker: string | null }[]
  absent: { memberId: string; name: string }[]
  reviewed: {
    id: string
    agreementId: string
    memberId: string
    title: string
    name: string
    outcome: CheckinOutcome
    blockerText: string | null
    reason: string | null
    newDueDate: Date | null
    replacement: { id: string; title: string; dueDate: Date } | null
    why: string | null
  }[]
  created: {
    id: string
    memberId: string
    title: string
    name: string
    dueDate: Date
    central: string | null
    isReplacement: boolean
    why: string | null
    /** Criado fora da daily, no mesmo dia e depois dela: quando (entra no resumo, no WhatsApp e no PDF). */
    addedAt: Date | null
  }[]
  whatsapp: WhatsAppDaily
}

const lateSelect = {
  id: true,
  title: true,
  dueDate: true,
  createdAt: true,
  description: true,
  memberId: true,
  member: { select: { preferredName: true } },
  central: { select: { name: true } },
} as const

type LateAgreement = {
  id: string
  title: string
  dueDate: Date
  createdAt: Date
  description: string | null
  memberId: string
  member: { preferredName: string }
  central: { name: string } | null
}

/**
 * Combinados que entraram DEPOIS da daily, no mesmo dia, fora de qualquer daily
 * (criação rápida, 1:1, feedback): fazem parte do resumo daquele dia — tela,
 * WhatsApp e PDF. Cada um vai para a última daily do dia registrada antes dele.
 * Daily retroativa (registrada outro dia) não recebe nada.
 */
async function lateAgreementsByDaily(ctx: TeamContext, dailies: DailyWithDetail[]): Promise<Map<string, LateAgreement[]>> {
  const out = new Map<string, LateAgreement[]>()
  const windows = dailies.flatMap((d) => {
    const { lt } = businessRangeInstants(d.date, d.date)
    return d.createdAt < lt ? [{ daily: d, gte: d.createdAt, lt }] : []
  })
  if (!windows.length) return out
  const agreements = await db.agreement.findMany({
    where: {
      ...teamScope(ctx),
      deletedAt: null,
      sourceDailyId: null,
      replacesAgreementId: null,
      OR: windows.map((w) => ({ createdAt: { gte: w.gte, lt: w.lt } })),
    },
    orderBy: { createdAt: "asc" },
    select: lateSelect,
  })
  for (const a of agreements) {
    const owner = windows
      .filter((w) => a.createdAt >= w.gte && a.createdAt < w.lt)
      .sort((x, y) => y.gte.getTime() - x.gte.getTime())[0]
    if (!owner) continue
    out.set(owner.daily.id, [...(out.get(owner.daily.id) ?? []), a])
  }
  return out
}

function toDetail(daily: DailyWithDetail, late: LateAgreement[] = [], whyOn = false): DailyDetail {
  const why = (text: string | null) => (whyOn ? firstLine(text) : null)
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
    memberId: c.agreement.memberId,
    title: c.agreement.title,
    name: c.agreement.member.preferredName,
    outcome: c.outcome,
    blockerText: c.blockerText,
    reason: c.blockerReason?.label ?? null,
    newDueDate: c.newDueDate,
    replacement: c.outcome !== "DONE" && !c.newDueDate ? c.agreement.replacedBy : null,
    why: why(c.agreement.description),
  }))
  const created = daily.sourcedAgreements.map((a) => ({
    id: a.id,
    memberId: a.memberId,
    title: a.title,
    name: a.member.preferredName,
    dueDate: a.dueDate,
    central: a.central?.name ?? null,
    isReplacement: a.replacesAgreementId !== null,
    why: why(a.description),
    addedAt: null as Date | null,
  }))
  for (const a of late) {
    created.push({
      id: a.id,
      memberId: a.memberId,
      title: a.title,
      name: a.member.preferredName,
      dueDate: a.dueDate,
      central: a.central?.name ?? null,
      isReplacement: false,
      why: why(a.description),
      addedAt: a.createdAt,
    })
  }
  return {
    id: daily.id,
    date: daily.date,
    summary: daily.summary,
    decisions: daily.decisions,
    author: daily.author.name,
    teamName: daily.team.name,
    present,
    absent,
    reviewed,
    created,
    whatsapp: {
      teamName: daily.team.name,
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
        .map((c) => ({ name: c.name, central: c.central, title: c.title, dueDate: c.dueDate, why: c.why })),
      blockers: present.flatMap((p) => (p.blocker ? [{ name: p.name, text: p.blocker }] : [])),
    },
  }
}

export async function getDailyDetail(ctx: TeamContext, id: string): Promise<DailyDetail | null> {
  const daily = await findDaily(id, ctx)
  if (!daily) return null
  const late = await lateAgreementsByDaily(ctx, [daily])
  return toDetail(daily, late.get(daily.id), hasModule(ctx, MODULES.AGREEMENT_WHY))
}

/** Histórico: todas as dailies do time, da mais recente para a mais antiga, já com o detalhe. */
export async function listDailies(ctx: TeamContext): Promise<DailyDetail[]> {
  const dailies = await db.daily.findMany({
    where: { ...teamScope(ctx), status: "CLOSED" },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: detailInclude,
  })
  const late = await lateAgreementsByDaily(ctx, dailies)
  return dailies.map((d) => toDetail(d, late.get(d.id), hasModule(ctx, MODULES.AGREEMENT_WHY)))
}

/**
 * P26 — o passo zero de /dailies/new: há daily ABERTA no time? (qualquer data; a mais
 * recente). Se não, o que a tela mostra antes de abrir: a daily já registrada na data
 * (uma por data — C10), quantas pessoas relataram e quantas propostas aguardam.
 */
export async function getDailyOpening(ctx: TeamContext, date: Date) {
  const scope = teamScope(ctx)
  const [draft, closed, reports, proposals, people] = await Promise.all([
    db.daily.findFirst({
      where: { ...scope, status: "DRAFT" },
      orderBy: { openedAt: "desc" },
      select: { id: true, date: true, openedAt: true, openedByUserId: true, openedBy: { select: { name: true } } },
    }),
    db.daily.findFirst({ where: { ...scope, status: "CLOSED", date }, select: { id: true } }),
    db.agreementSelfReport.findMany({ where: { ...scope, dailyId: null }, distinct: ["memberId"], select: { memberId: true } }),
    db.memberProposal.count({ where: { ...scope, status: "PENDING" } }),
    db.teamMember.count({ where: { ...scope, status: { in: ["ACTIVE", "OFFBOARDING"] } } }),
  ])
  return {
    draft: draft
      ? {
          id: draft.id,
          date: draft.date,
          openedAt: draft.openedAt,
          openedBy: draft.openedBy?.name ?? null,
          mine: draft.openedByUserId === ctx.userId,
          locking: isLockActive(draft.openedAt),
        }
      : null,
    closedOnDate: closed?.id ?? null,
    reported: reports.length,
    people,
    proposals,
  }
}

/**
 * C18 — Prévia da daily (/agreements/daily-preview): o movimento do time desde a última daily
 * REGISTRADA, sem esperar a próxima. Os relatos pendentes (o que cada pessoa disse que
 * fez, fez em parte ou não fez), os combinados criados depois dela e os que entram na
 * revisão da próxima daily (mesma regra de `getDailyForm`) ainda sem relato. Só leitura,
 * derivado na hora — nada é gravado (D9). Combinado não carrega visibilidade: o VIEWER vê
 * o mesmo que o gestor.
 */
export async function getDailyPreview(ctx: TeamContext, today: Date = todayBusinessDate()) {
  const scope = teamScope(ctx)
  const previous = await db.daily.findFirst({
    where: { ...scope, status: "CLOSED" },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { id: true, date: true, createdAt: true },
  })
  // Sem daily registrada: a última semana.
  const since = previous?.createdAt ?? new Date(Date.now() - 7 * 86_400_000)

  const agreementSelect = {
    id: true,
    title: true,
    dueDate: true,
    member: { select: { id: true, preferredName: true } },
    central: { select: { name: true } },
  } as const

  const [reports, created, due, people] = await Promise.all([
    db.agreementSelfReport.findMany({
      where: { ...scope, dailyId: null },
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        outcome: true,
        blockerText: true,
        suggestedDueDate: true,
        updatedAt: true,
        blockerReason: { select: { label: true } },
        agreement: { select: agreementSelect },
      },
    }),
    db.agreement.findMany({
      where: {
        ...scope,
        createdAt: { gt: since },
        member: { deletedAt: null },
        // Os criados NA daily anterior são dela, não movimento depois dela.
        ...(previous ? { OR: [{ sourceDailyId: null }, { sourceDailyId: { not: previous.id } }] } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: { ...agreementSelect, origin: true, status: true, createdAt: true, author: { select: { name: true } } },
    }),
    db.agreement.findMany({
      where: {
        ...scope,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        member: { deletedAt: null },
        OR: [...(previous ? [{ sourceDailyId: previous.id }] : []), { dueDate: { lte: today } }],
        selfReports: { none: { dailyId: null } },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: agreementSelect,
    }),
    db.teamMember.findMany({
      where: { ...scope, status: { in: ["ACTIVE", "OFFBOARDING"] }, vacations: { none: vacationCovering(ctx.teamId, today) } },
      orderBy: { preferredName: "asc" },
      select: { id: true, preferredName: true },
    }),
  ])

  const deadline = (dueDate: Date) => deadlineSeverity(dueDate, { resolved: false, today })
  type Person = {
    id: string
    name: string
    reports: {
      id: string
      outcome: CheckinOutcome
      blockerText: string | null
      reason: string | null
      suggestedDueDate: Date | null
      at: Date
      agreement: { id: string; title: string; central: string | null }
    }[]
    created: {
      id: string
      title: string
      central: string | null
      dueDate: Date
      origin: (typeof created)[number]["origin"]
      status: (typeof created)[number]["status"]
      author: string
      at: Date
    }[]
    unreported: { id: string; title: string; central: string | null; dueDate: Date; deadline: DeadlineSeverity }[]
  }
  const byId = new Map<string, Person>()
  const personOf = (m: { id: string; preferredName: string }) => {
    let p = byId.get(m.id)
    if (!p) byId.set(m.id, (p = { id: m.id, name: m.preferredName, reports: [], created: [], unreported: [] }))
    return p
  }
  for (const m of people) personOf(m)
  for (const r of reports) {
    personOf(r.agreement.member).reports.push({
      id: r.id,
      outcome: r.outcome,
      blockerText: r.blockerText,
      reason: r.blockerReason?.label ?? null,
      suggestedDueDate: r.suggestedDueDate,
      at: r.updatedAt,
      agreement: { id: r.agreement.id, title: r.agreement.title, central: r.agreement.central?.name ?? null },
    })
  }
  for (const a of created) {
    personOf(a.member).created.push({
      id: a.id,
      title: a.title,
      central: a.central?.name ?? null,
      dueDate: a.dueDate,
      origin: a.origin,
      status: a.status,
      author: a.author.name,
      at: a.createdAt,
    })
  }
  for (const a of due) {
    personOf(a.member).unreported.push({ id: a.id, title: a.title, central: a.central?.name ?? null, dueDate: a.dueDate, deadline: deadline(a.dueDate) })
  }

  const all = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  const moved = all.filter((p) => p.reports.length + p.created.length + p.unreported.length > 0)
  const count = (o: CheckinOutcome) => reports.filter((r) => r.outcome === o).length
  return {
    previous: previous ? { id: previous.id, date: previous.date, at: previous.createdAt } : null,
    since,
    people: moved,
    quiet: all.filter((p) => !moved.includes(p)).map((p) => p.name),
    totals: {
      people: people.length,
      reported: new Set(reports.map((r) => r.agreement.member.id)).size,
      done: count("DONE"),
      partial: count("PARTIAL"),
      notDone: count("NOT_DONE"),
      created: created.length,
      unreported: due.length,
    },
  }
}

export type DailyPreview = Awaited<ReturnType<typeof getDailyPreview>>

/**
 * C19 — scrum master de hoje (D46) para o gestor: quem foi sorteado, quem foi pulado hoje
 * (faltou), a rodada e quantos já conduziram nela. Sem sorteio: null.
 */
export async function getScrumMasterToday(ctx: TeamContext, now: Date = new Date()) {
  const scope = teamScope(ctx)
  const today = todayBusinessDate(now)
  const draws = await db.scrumMasterDraw.findMany({
    where: { ...scope, date: today },
    orderBy: { createdAt: "asc" },
    select: { memberId: true, userId: true, participantName: true, round: true, method: true, skippedAt: true, member: { select: { preferredName: true, userId: true } } },
  })
  // C20: o sorteado é uma pessoa do time ou um gestor participante (nome gravado no sorteio).
  const nameOf = (d: (typeof draws)[number]) => d.member?.preferredName ?? d.participantName ?? ""
  const current = draws.find((d) => d.skippedAt === null) ?? null
  const [doneInRound, eligible, managers] = current
    ? await Promise.all([
        db.scrumMasterDraw.count({ where: { ...scope, round: current.round, skippedAt: null } }),
        db.teamMember.count({ where: { ...scope, status: "ACTIVE", deletedAt: null } }),
        db.teamAccess.count({ where: { ...scope, level: "MANAGER", revokedAt: null, inScrumMasterDraw: true, OR: [{ user: { isActive: true, teamMember: null } }, { user: { isActive: true, teamMember: { teamId: { not: ctx.teamId } } } }] } }),
      ])
    : [0, 0, 0]
  return {
    // Sem login no portal (ou gestor), a daily do sorteado é registrada pela tela do gestor.
    current: current
      ? {
          memberId: current.memberId,
          name: nameOf(current),
          round: current.round,
          method: current.method,
          // Gestor sorteado registra pela própria tela; o aviso de "sem portal" é só para pessoas.
          hasPortal: current.userId !== null || current.member?.userId != null,
          /** Quem está logado é o sorteado (a pessoa ligada à conta, ou o gestor participante). */
          isMe: current.userId === ctx.userId || (current.member?.userId != null && current.member.userId === ctx.userId),
        }
      : null,
    skipped: draws.filter((d) => d.skippedAt !== null).map(nameOf),
    round: current ? { done: doneInRound, total: eligible + managers } : null,
    roulette: hasModule(ctx, MODULES.DAILY_ROULETTE),
    windowOpen: rouletteWindowOpen(now),
  }
}

export type ScrumMasterToday = Awaited<ReturnType<typeof getScrumMasterToday>>
