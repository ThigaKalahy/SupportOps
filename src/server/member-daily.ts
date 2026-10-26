import type { CheckinOutcome } from "@prisma/client"

import { dailyReviewHorizon, formatDate, todayBusinessDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { MODULES } from "../lib/modules.ts"
import { rouletteWindowOpen } from "../lib/scrum-master.ts"
import { vacationCovering } from "../lib/vacations.ts"
import { fieldErrorsOf } from "../lib/validators/fields.ts"
import { conductDailySchema } from "../lib/validators/member-portal.ts"

import { createDailyRecord, discardDailyRecord, openDailyRecord, type DailyResult } from "./dailies.ts"
import { db } from "./db.ts"
import type { MemberContext } from "./member-scope.ts"
import type { TeamContext } from "./scope.ts"
import { drawScrumMasterFor, type ScrumMasterDrawResult } from "./scrum-master.ts"

export type { ScrumMasterDrawResult }

/**
 * C19 — PONTE DO SCRUM MASTER (D46, exceção à D38/D40 autorizada pelo usuário em 22/10/2026).
 *
 * O colaborador sorteado como scrum master do dia conduz e registra a daily pelo portal. Só
 * ele, só no dia do sorteio, e só o que o papel alcança:
 * - LÊ: os combinados que a daily revisa (título, prazo, pessoa, central, arrasto, o relato e,
 *   com o módulo, a primeira linha do porquê — C20), quem está no time hoje, os motivos de
 *   impeditivo e as centrais. Nada de nota, observação, resumo, decisões ou registro gerencial.
 * - ESCREVE pelo núcleo da daily do gestor (src/server/dailies.ts), com um contexto de
 *   registro montado AQUI, depois de conferir o sorteio — e com o pedido reduzido: desfecho
 *   com impeditivo, motivo e novo prazo; próximo passo depois de Feito (C20, sem ler nem
 *   revisar observação — `conductor`); quem faltou; combinados de hoje. Sem nota, sem
 *   observação, sem substituição, sem resumo nem decisões (o gestor completa depois). Abrir trava o portal do time como a daily do gestor (D41, D43).
 * O registro sai com o nome dele como autor.
 */

export class NotConductorError extends Error {
  constructor() {
    super(labels.conductDaily.notConductor)
    this.name = "NotConductorError"
  }
}

/** É o scrum master válido de hoje neste time? */
async function isConductor(ctx: MemberContext, today: Date): Promise<boolean> {
  const draw = await db.scrumMasterDraw.findFirst({ where: { teamId: ctx.teamId, date: today, skippedAt: null }, select: { memberId: true } })
  return draw?.memberId === ctx.memberId
}

/**
 * Contexto de registro da daily para o scrum master: o time e a conta dele, com os módulos
 * do time. Montado só depois de `isConductor`, e só entregue ao núcleo da daily.
 */
async function conductorContext(ctx: MemberContext): Promise<TeamContext> {
  const modules = await db.teamModule.findMany({ where: { teamId: ctx.teamId, isEnabled: true }, select: { moduleKey: true } })
  return {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    teamId: ctx.teamId,
    level: "MANAGER",
    isPlatformAdmin: false,
    modules: new Set(modules.map((m) => m.moduleKey)),
  }
}

/** Roleta girada pelo time: só com o módulo, das 09h às 10h em dia útil. */
export async function spinRouletteAsMember(ctx: MemberContext, now: Date = new Date()): Promise<ScrumMasterDrawResult> {
  const on = await db.teamModule.count({ where: { teamId: ctx.teamId, moduleKey: MODULES.DAILY_ROULETTE, isEnabled: true } })
  if (!on || !rouletteWindowOpen(now)) return { ok: false, error: labels.scrumMaster.windowHint }
  return drawScrumMasterFor({ teamId: ctx.teamId, organizationId: ctx.organizationId, userId: ctx.userId }, "ROULETTE", todayBusinessDate(now))
}

export interface ConductReview {
  id: string
  title: string
  dueDate: Date
  member: { id: string; name: string }
  central: string | null
  /** C20: a central do combinado, para o próximo passo herdar (trocável). */
  centralId: string | null
  /** C20: a primeira linha do porquê do combinado — só com o módulo do porquê. */
  why: string | null
  reschedules: number
  report: { outcome: CheckinOutcome; blockerText: string | null; blockerReasonId: string | null; suggestedDueDate: Date | null } | null
}

export type ConductDaily =
  | { state: "closed" | "none"; date: Date }
  | { state: "other"; date: Date; name: string }
  | {
      state: "mine"
      date: Date
      draftId: string
      reviews: ConductReview[]
      members: { id: string; name: string }[]
      reasons: { id: string; label: string }[]
      centrals: { id: string; name: string }[] | null
      whyEnabled: boolean
    }

/** O que o scrum master vê em /me/daily. Quem não é o scrum master de hoje recebe null. */
export async function getConductDaily(ctx: MemberContext, now: Date = new Date()): Promise<ConductDaily | null> {
  const today = todayBusinessDate(now)
  if (!(await isConductor(ctx, today))) return null
  const teamId = ctx.teamId

  const [closed, draft] = await Promise.all([
    db.daily.findFirst({ where: { teamId, date: today, status: "CLOSED" }, select: { id: true } }),
    db.daily.findFirst({ where: { teamId, status: "DRAFT" }, orderBy: { openedAt: "desc" }, select: { id: true, date: true, openedByUserId: true, openedBy: { select: { name: true } } } }),
  ])
  if (closed) return { state: "closed", date: today }
  if (!draft) return { state: "none", date: today }
  if (draft.openedByUserId !== ctx.userId || draft.date.getTime() !== today.getTime()) {
    return { state: "other", date: today, name: draft.openedBy?.name ?? "" }
  }

  // A mesma regra da daily do gestor (C21): abertos com prazo até o próximo dia útil.
  const [modules, agreements, members, reasons] = await Promise.all([
    db.teamModule.findMany({ where: { teamId, isEnabled: true }, select: { moduleKey: true } }),
    db.agreement.findMany({
      where: {
        teamId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        member: { deletedAt: null },
        dueDate: { lte: dailyReviewHorizon(today) },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        dueDate: true,
        member: { select: { id: true, preferredName: true } },
        description: true,
        centralId: true,
        central: { select: { name: true } },
        _count: { select: { checkins: { where: { newDueDate: { not: null } } } } },
        selfReports: {
          where: { teamId, dailyId: draft.id },
          take: 1,
          select: { outcome: true, blockerText: true, blockerReasonId: true, suggestedDueDate: true },
        },
      },
    }),
    db.teamMember.findMany({
      where: { teamId, status: { in: ["ACTIVE", "OFFBOARDING"] }, vacations: { none: vacationCovering(teamId, today) } },
      orderBy: { preferredName: "asc" },
      select: { id: true, preferredName: true },
    }),
    db.blockerReason.findMany({ where: { teamId, isActive: true }, orderBy: { order: "asc" }, select: { id: true, label: true } }),
  ])
  const on = new Set(modules.map((m) => m.moduleKey))
  const centrals = on.has(MODULES.CENTRALS)
    ? await db.central.findMany({ where: { teamId, isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : null

  return {
    state: "mine",
    date: today,
    draftId: draft.id,
    reviews: agreements
      .map((a) => ({
        id: a.id,
        title: a.title,
        dueDate: a.dueDate,
        member: { id: a.member.id, name: a.member.preferredName },
        central: a.central?.name ?? null,
        centralId: a.centralId,
        why: on.has(MODULES.AGREEMENT_WHY) ? (a.description?.split("\n")[0]?.trim() || null) : null,
        reschedules: a._count.checkins,
        report: a.selfReports[0] ?? null,
      }))
      .sort((a, b) => a.member.name.localeCompare(b.member.name, "pt-BR")),
    members: members.map((m) => ({ id: m.id, name: m.preferredName })),
    reasons,
    centrals,
    whyEnabled: on.has(MODULES.AGREEMENT_WHY),
  }
}

/** "Abrir a daily": a DRAFT de hoje, aberta pelo scrum master (captura os relatos e trava o portal). */
export async function openConductDaily(ctx: MemberContext): Promise<DailyResult> {
  const today = todayBusinessDate()
  if (!(await isConductor(ctx, today))) throw new NotConductorError()
  return openDailyRecord(await conductorContext(ctx), { date: formatDate(today, "business") })
}

/** A DRAFT de hoje que ESTE scrum master abriu (se o gestor assumiu, não é mais dele). */
async function myDraft(ctx: MemberContext, id: string, today: Date) {
  return db.daily.findFirst({ where: { teamId: ctx.teamId, id, status: "DRAFT", openedByUserId: ctx.userId, date: today }, select: { id: true } })
}

/** "Salvar daily": o pedido reduzido vira o registro da daily, pelo núcleo do gestor. */
export async function saveConductDaily(ctx: MemberContext, input: unknown): Promise<DailyResult> {
  const today = todayBusinessDate()
  if (!(await isConductor(ctx, today))) throw new NotConductorError()
  const parsed = conductDailySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  if (!(await myDraft(ctx, data.draftId, today))) return { ok: false, error: labels.dailies.opening.gone }

  // Presença: todo mundo do time hoje (fora de férias), presente salvo quem foi marcado.
  const members = await db.teamMember.findMany({
    where: { teamId: ctx.teamId, status: { in: ["ACTIVE", "OFFBOARDING"] }, vacations: { none: vacationCovering(ctx.teamId, today) } },
    select: { id: true },
  })
  const absent = new Set(data.absent)
  // Sem substituição (o gestor faz depois); próximo passo só depois de Feito (C20).
  const empty = { replacementTitle: "", replacementDueDate: "" }
  return createDailyRecord(await conductorContext(ctx), {
    date: formatDate(today, "business"),
    draftId: data.draftId,
    summary: "",
    decisions: "",
    reviews: data.reviews.map((r) => ({
      agreementId: r.agreementId,
      outcome: r.outcome,
      blockerText: r.outcome === "DONE" ? "" : r.blockerText,
      blockerReasonId: r.outcome === "DONE" ? "" : r.blockerReasonId,
      action: "reschedule",
      newDueDate: r.outcome === "DONE" ? "" : r.newDueDate,
      ...empty,
      nextTitle: r.outcome === "DONE" ? r.nextTitle : "",
      nextNote: r.outcome === "DONE" ? r.nextNote : "",
      nextDueDate: r.outcome === "DONE" ? r.nextDueDate : "",
      nextCentralId: r.outcome === "DONE" ? r.nextCentralId : "",
    })),
    participants: members.map((m) => ({ memberId: m.id, watchIds: [], present: !absent.has(m.id), note: "", isBlocker: false })),
    newAgreements: data.newAgreements.map((a) => ({ ...a, watchIds: [] })),
    proposals: [],
  }, { conductor: true })
}

/** "Descartar daily": só a DRAFT que este scrum master abriu hoje. */
export async function discardConductDaily(ctx: MemberContext, input: unknown): Promise<DailyResult | { ok: true }> {
  const today = todayBusinessDate()
  if (!(await isConductor(ctx, today))) throw new NotConductorError()
  const id = typeof input === "object" && input !== null && "id" in input ? String((input as { id: unknown }).id) : ""
  if (!(await myDraft(ctx, id, today))) return { ok: false, error: labels.dailies.opening.gone }
  return discardDailyRecord(await conductorContext(ctx), { id })
}
