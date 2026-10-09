import type { Prisma, WatchHeat, WatchOrigin, WatchStatus, Visibility } from "@prisma/client"

import type { AlertThresholds } from "../../lib/alert-thresholds.ts"
import type { DailyReportWatch } from "../../lib/daily-report.ts"
import { MODULES } from "../../lib/modules.ts"
import type { WatchFilters, WatchTab } from "../../lib/watch-filters.ts"
import { coldHighDays, compareWatch, reviewState, type ReviewState } from "../../lib/watch.ts"
import { db } from "../db.ts"
import { hasModule, teamScope, type TeamContext } from "../scope.ts"
import { visibilityFilter } from "../visibility.ts"

/**
 * Leituras de "Em observação" (P21). Toda leitura passa por `visibilityFilter`
 * (D25): o VIEWER só vê observação SHARED — em lista, contagem, perfil, home e
 * alerta. Escopo de time (teamScope, D30) em toda leitura, com ou sem pessoa.
 */

function scopeWhere(ctx: TeamContext): Prisma.WatchItemWhereInput {
  return { ...teamScope(ctx), deletedAt: null }
}

/* ─────────────── Apoio à escrita (src/server/watch.ts) ─────────────── */

/** A observação, para escrever nela (quem escreve é MANAGER; o filtro é a mesma regra de leitura). */
export async function findWatchForWrite(ctx: TeamContext, id: string) {
  return db.watchItem.findFirst({ where: { id, ...scopeWhere(ctx), ...visibilityFilter(ctx) } })
}

export type WatchLinkKey = "agreementId" | "dailyId" | "priorityValidationId" | "devReturnId" | "oneOnOneId" | "feedbackId"
export const WATCH_LINKS: readonly WatchLinkKey[] = ["agreementId", "dailyId", "priorityValidationId", "devReturnId", "oneOnOneId", "feedbackId"]

/** Observação ATIVA já ligada ao mesmo registro (dailyId só junto com a pessoa: uma por nota). */
export async function findActiveWatchForLink(ctx: TeamContext, data: Partial<Record<WatchLinkKey | "memberId", string>>) {
  const link = WATCH_LINKS.find((k) => k !== "dailyId" && data[k])
  const where: Prisma.WatchItemWhereInput | null = link
    ? { [link]: data[link] }
    : data.dailyId && data.memberId
      ? { dailyId: data.dailyId, memberId: data.memberId }
      : null
  if (!where) return null
  return db.watchItem.findFirst({
    where: { ...where, ...scopeWhere(ctx), status: "ACTIVE", ...visibilityFilter(ctx) },
    select: { id: true, heat: true },
  })
}

/**
 * Confere os vínculos de uma observação nova (todos do time do contexto) e deduz
 * pessoa e central do registro de origem. null se algum id não serve — inclusive
 * id de outro time.
 */
export async function resolveWatchLinks(ctx: TeamContext, data: Record<WatchLinkKey | "memberId" | "centralId", string>) {
  const scope = teamScope(ctx)
  const checks = await Promise.all([
    data.memberId ? db.teamMember.findFirst({ where: { ...scope, id: data.memberId }, select: { id: true } }) : null,
    data.centralId ? db.central.findFirst({ where: { ...scope, id: data.centralId }, select: { id: true } }) : null,
    data.agreementId ? db.agreement.findFirst({ where: { ...scope, id: data.agreementId }, select: { memberId: true, centralId: true } }) : null,
    data.dailyId ? db.daily.findFirst({ where: { ...scope, id: data.dailyId }, select: { id: true } }) : null,
    data.priorityValidationId
      ? db.priorityValidation.findFirst({ where: { ...scope, id: data.priorityValidationId }, select: { memberId: true, centralId: true } })
      : null,
    data.devReturnId
      ? db.devReturn.findFirst({ where: { ...scope, id: data.devReturnId }, select: { memberId: true, centralId: true } })
      : null,
    data.oneOnOneId
      ? db.oneOnOne.findFirst({ where: { ...scope, id: data.oneOnOneId, ...visibilityFilter(ctx) }, select: { memberId: true } })
      : null,
    data.feedbackId
      ? db.feedback.findFirst({ where: { ...scope, id: data.feedbackId, ...visibilityFilter(ctx) }, select: { memberId: true } })
      : null,
  ])
  const wanted = [data.memberId, data.centralId, ...WATCH_LINKS.map((k) => data[k])]
  if (wanted.some((id, i) => id && !checks[i])) return null
  const [member, central, agreement, , validation, devReturn, oneOnOne, feedback] = checks
  return {
    memberId: member?.id ?? agreement?.memberId ?? validation?.memberId ?? devReturn?.memberId ?? oneOnOne?.memberId ?? feedback?.memberId ?? null,
    centralId: central?.id ?? agreement?.centralId ?? validation?.centralId ?? devReturn?.centralId ?? null,
  }
}

/* ───────────────────────────── Lista /watch ───────────────────────────── */

export interface WatchLinkView {
  kind: "agreement" | "daily" | "validation" | "devReturn" | "oneOnOne" | "feedback"
  label: string
  href: string
}

export interface WatchRow {
  id: string
  title: string
  context: string | null
  heat: WatchHeat
  status: WatchStatus
  origin: WatchOrigin
  visibility: Visibility
  member: { id: string; preferredName: string } | null
  central: { id: string; name: string } | null
  link: WatchLinkView | null
  createdAt: Date
  lastReviewedAt: Date
  heatChangedAt: Date
  reviewCount: number
  resolvedAt: Date | null
  resolutionNote: string | null
  updatedAt: Date
  review: ReviewState
  /** Dias em fogo alto sem mudar de grau, quando passou do limiar. */
  coldHighDays: number | null
}

const rowSelect = {
  id: true,
  title: true,
  context: true,
  heat: true,
  status: true,
  origin: true,
  visibility: true,
  createdAt: true,
  lastReviewedAt: true,
  heatChangedAt: true,
  reviewCount: true,
  resolvedAt: true,
  resolutionNote: true,
  updatedAt: true,
  member: { select: { id: true, preferredName: true } },
  central: { select: { id: true, name: true } },
  agreement: { select: { id: true, title: true } },
  daily: { select: { id: true, date: true } },
  priorityValidation: { select: { id: true, ticketRef: true, deletedAt: true } },
  devReturn: { select: { id: true, ticketRef: true, deletedAt: true } },
  oneOnOne: { select: { id: true, date: true, memberId: true, visibility: true, deletedAt: true } },
  feedback: { select: { id: true, date: true, memberId: true, visibility: true, deletedAt: true } },
} satisfies Prisma.WatchItemSelect

type RawRow = Prisma.WatchItemGetPayload<{ select: typeof rowSelect }>

function dm(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/** O registro de origem como link — só o que quem consulta pode ver (1:1 e feedback privados somem para o VIEWER). */
function linkOf(r: RawRow, ctx: TeamContext): WatchLinkView | null {
  const canSee = (v: Visibility) => ctx.level === "MANAGER" || v === "SHARED"
  if (r.agreement) return { kind: "agreement", label: r.agreement.title, href: `/agreements/${r.agreement.id}` }
  if (r.priorityValidation && !r.priorityValidation.deletedAt && hasModule(ctx, MODULES.PRIORITY_VALIDATION)) {
    return { kind: "validation", label: r.priorityValidation.ticketRef, href: `/priority-validations?period=custom&from=01-01-2000&to=31-12-2099` }
  }
  if (r.devReturn && !r.devReturn.deletedAt && hasModule(ctx, MODULES.DEV_RETURNS)) {
    return { kind: "devReturn", label: r.devReturn.ticketRef, href: `/dev-returns?period=custom&from=01-01-2000&to=31-12-2099` }
  }
  if (r.oneOnOne && !r.oneOnOne.deletedAt && canSee(r.oneOnOne.visibility)) {
    return { kind: "oneOnOne", label: dm(r.oneOnOne.date), href: `/team/${r.oneOnOne.memberId}/records?period=all&open=oneOnOne:${r.oneOnOne.id}` }
  }
  if (r.feedback && !r.feedback.deletedAt && canSee(r.feedback.visibility)) {
    return { kind: "feedback", label: dm(r.feedback.date), href: `/team/${r.feedback.memberId}/records?period=all&open=feedback:${r.feedback.id}` }
  }
  if (r.daily) return { kind: "daily", label: dm(r.daily.date), href: `/dailies/${r.daily.id}` }
  return null
}

function toRow(r: RawRow, ctx: TeamContext, now: Date, t: AlertThresholds): WatchRow {
  return {
    id: r.id,
    title: r.title,
    context: r.context,
    heat: r.heat,
    status: r.status,
    origin: r.origin,
    visibility: r.visibility,
    member: r.member,
    central: r.central,
    createdAt: r.createdAt,
    lastReviewedAt: r.lastReviewedAt,
    heatChangedAt: r.heatChangedAt,
    reviewCount: r.reviewCount,
    resolvedAt: r.resolvedAt,
    resolutionNote: r.resolutionNote,
    updatedAt: r.updatedAt,
    link: linkOf(r, ctx),
    review: reviewState(r, now, t),
    coldHighDays: coldHighDays(r, now, t),
  }
}

function filterWhere(filters: Pick<WatchFilters, "heat" | "memberId" | "central" | "origin">): Prisma.WatchItemWhereInput {
  return {
    ...(filters.heat ? { heat: filters.heat } : {}),
    ...(filters.memberId ? { memberId: filters.memberId } : {}),
    ...(filters.central ? { centralId: filters.central === "none" ? null : filters.central } : {}),
    ...(filters.origin ? { origin: filters.origin } : {}),
  }
}

export type WatchCounts = Record<WatchTab, number>

/**
 * A lista da aba e as contagens de todas as abas (uma consulta). Ativas e
 * "sem revisão": por grau (alto primeiro) e, dentro, o mais esquecido no topo;
 * resolvidas e arquivadas: mais recentes primeiro.
 */
export async function listWatchItems(ctx: TeamContext, filters: WatchFilters, t: AlertThresholds, now = new Date()) {
  const rows = await db.watchItem.findMany({
    where: { ...scopeWhere(ctx), ...filterWhere(filters), ...visibilityFilter(ctx) },
    select: rowSelect,
  })
  const all = rows.map((r) => toRow(r, ctx, now, t))
  const inTab = (r: WatchRow, tab: WatchTab) =>
    tab === "all"
      ? true
      : tab === "active"
        ? r.status === "ACTIVE"
        : tab === "unreviewed"
          ? r.status === "ACTIVE" && r.review.status !== "ok"
          : tab === "resolved"
            ? r.status === "RESOLVED"
            : r.status === "ARCHIVED"
  const counts = Object.fromEntries((["active", "unreviewed", "resolved", "archived", "all"] as const).map((tab) => [tab, all.filter((r) => inTab(r, tab)).length])) as WatchCounts
  const list = all.filter((r) => inTab(r, filters.tab))
  if (filters.tab === "resolved" || filters.tab === "archived") list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  else list.sort((a, b) => Number(a.status !== "ACTIVE") - Number(b.status !== "ACTIVE") || compareWatch(a, b))
  return { rows: list, counts }
}

export interface WatchDetail extends WatchRow {
  createdBy: string
  reviews: { id: string; reviewedAt: Date; note: string | null; heatBefore: WatchHeat; heatAfter: WatchHeat; author: string }[]
}

/** Uma observação com o histórico completo de revisões, em ordem cronológica. */
export async function getWatchItem(ctx: TeamContext, id: string, t: AlertThresholds, now = new Date()): Promise<WatchDetail | null> {
  const r = await db.watchItem.findFirst({
    where: { id, ...scopeWhere(ctx), ...visibilityFilter(ctx) },
    select: {
      ...rowSelect,
      createdBy: { select: { name: true } },
      reviews: {
        orderBy: { reviewedAt: "asc" },
        select: { id: true, reviewedAt: true, note: true, heatBefore: true, heatAfter: true, author: { select: { name: true } } },
      },
    },
  })
  if (!r) return null
  const { createdBy, reviews, ...raw } = r
  return {
    ...toRow(raw, ctx, now, t),
    createdBy: createdBy.name,
    reviews: reviews.map(({ author, ...rv }) => ({ ...rv, author: author.name })),
  }
}

/** Observações ATIVAS por registro de origem, para o estado do WatchButton nas listas. */
export async function activeWatchByLink(ctx: TeamContext, key: Exclude<WatchLinkKey, "dailyId">, ids: string[]): Promise<Record<string, { id: string; heat: WatchHeat }>> {
  if (ids.length === 0) return {}
  const rows = await db.watchItem.findMany({
    where: { [key]: { in: ids }, ...scopeWhere(ctx), status: "ACTIVE", ...visibilityFilter(ctx) },
    select: { id: true, heat: true, agreementId: true, priorityValidationId: true, devReturnId: true, oneOnOneId: true, feedbackId: true },
  })
  return Object.fromEntries(rows.flatMap((r) => (r[key] ? [[r[key]!, { id: r.id, heat: r.heat }]] : [])))
}

/** Bloco do perfil: as ativas da pessoa, do fogo alto ao baixo, o mais esquecido primeiro. */
export async function memberWatchItems(ctx: TeamContext, memberId: string, t: AlertThresholds, now = new Date()) {
  const rows = await db.watchItem.findMany({
    where: { memberId, status: "ACTIVE", ...scopeWhere(ctx), ...visibilityFilter(ctx) },
    select: rowSelect,
  })
  return rows.map((r) => toRow(r, ctx, now, t)).sort(compareWatch)
}

/** Pessoas e centrais para os filtros de /watch. */
export async function watchFilterOptions(ctx: TeamContext) {
  const [members, centrals] = await Promise.all([
    db.teamMember.findMany({ where: { ...teamScope(ctx), status: { not: "INACTIVE" } }, orderBy: { preferredName: "asc" }, select: { id: true, preferredName: true } }),
    hasModule(ctx, MODULES.CENTRALS)
      ? db.central.findMany({ where: teamScope(ctx), orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } })
      : Promise.resolve([]),
  ])
  return { members, centrals }
}

/**
 * Bloco "Em observação" do PDF da daily: as ATIVAS que quem gera pode ler
 * (VIEWER só SHARED), com os vínculos que apontam redundância com a daily.
 */
export async function activeWatchForReport(ctx: TeamContext, t: AlertThresholds, now = new Date()): Promise<DailyReportWatch[]> {
  const rows = await db.watchItem.findMany({
    where: { ...scopeWhere(ctx), status: "ACTIVE", ...visibilityFilter(ctx) },
    select: {
      title: true,
      context: true,
      heat: true,
      status: true,
      visibility: true,
      lastReviewedAt: true,
      heatChangedAt: true,
      agreementId: true,
      dailyId: true,
      member: { select: { id: true, preferredName: true } },
      central: { select: { name: true } },
    },
  })
  return rows.sort(compareWatch).map((r) => {
    const review = reviewState(r, now, t)
    return {
      title: r.title,
      context: r.context,
      heat: r.heat,
      visibility: r.visibility,
      member: r.member,
      central: r.central,
      agreementId: r.agreementId,
      dailyId: r.dailyId,
      lastReviewedAt: r.lastReviewedAt,
      unreviewedDays: review.status === "ok" ? null : review.daysSinceReview,
      coldHighDays: coldHighDays(r, now, t),
    }
  })
}
