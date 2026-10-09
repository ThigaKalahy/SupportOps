import type { Prisma, WatchHeat, WatchOrigin, WatchStatus, Visibility } from "@prisma/client"

import type { AlertThresholds } from "../../lib/alert-thresholds.ts"
import type { WatchFilters, WatchTab } from "../../lib/watch-filters.ts"
import { coldHighDays, compareWatch, reviewState, type ReviewState } from "../../lib/watch.ts"
import { db } from "../db.ts"
import { memberScope, visibilityFilter, type Viewer } from "../visibility.ts"

/**
 * Leituras de "Em observação" (P21). Toda leitura passa por `visibilityFilter`
 * (D25): o VIEWER só vê observação SHARED — em lista, contagem, perfil, home e
 * alerta. Observação sem pessoa (central, processo) segue a organização; com
 * pessoa, também o escopo de pessoas.
 */

function scopeWhere(viewer: Viewer): Prisma.WatchItemWhereInput {
  return {
    organizationId: viewer.organizationId,
    deletedAt: null,
    OR: [{ memberId: null }, { member: memberScope(viewer) }],
  }
}

/* ─────────────── Apoio à escrita (src/server/watch.ts) ─────────────── */

/** A observação, para escrever nela (quem escreve é OWNER/MANAGER; o filtro é a mesma regra de leitura). */
export async function findWatchForWrite(viewer: Viewer, id: string) {
  return db.watchItem.findFirst({ where: { id, ...scopeWhere(viewer), ...visibilityFilter(viewer) } })
}

export type WatchLinkKey = "agreementId" | "dailyId" | "priorityValidationId" | "devReturnId" | "oneOnOneId" | "feedbackId"
export const WATCH_LINKS: readonly WatchLinkKey[] = ["agreementId", "dailyId", "priorityValidationId", "devReturnId", "oneOnOneId", "feedbackId"]

/** Observação ATIVA já ligada ao mesmo registro (dailyId só junto com a pessoa: uma por nota). */
export async function findActiveWatchForLink(viewer: Viewer, data: Partial<Record<WatchLinkKey | "memberId", string>>) {
  const link = WATCH_LINKS.find((k) => k !== "dailyId" && data[k])
  const where: Prisma.WatchItemWhereInput | null = link
    ? { [link]: data[link] }
    : data.dailyId && data.memberId
      ? { dailyId: data.dailyId, memberId: data.memberId }
      : null
  if (!where) return null
  return db.watchItem.findFirst({
    where: { ...where, ...scopeWhere(viewer), status: "ACTIVE", ...visibilityFilter(viewer) },
    select: { id: true, heat: true },
  })
}

/**
 * Confere os vínculos de uma observação nova (organização e escopo de pessoas)
 * e deduz pessoa e central do registro de origem. null se algum id não serve.
 */
export async function resolveWatchLinks(viewer: Viewer, data: Record<WatchLinkKey | "memberId" | "centralId", string>) {
  const scope = memberScope(viewer)
  const org = viewer.organizationId
  const checks = await Promise.all([
    data.memberId ? db.teamMember.findFirst({ where: { id: data.memberId, ...scope }, select: { id: true } }) : null,
    data.centralId ? db.central.findFirst({ where: { id: data.centralId, organizationId: org }, select: { id: true } }) : null,
    data.agreementId ? db.agreement.findFirst({ where: { id: data.agreementId, member: scope }, select: { memberId: true, centralId: true } }) : null,
    data.dailyId ? db.daily.findFirst({ where: { id: data.dailyId, team: { organizationId: org } }, select: { id: true } }) : null,
    data.priorityValidationId
      ? db.priorityValidation.findFirst({ where: { id: data.priorityValidationId, organizationId: org, member: scope }, select: { memberId: true, centralId: true } })
      : null,
    data.devReturnId
      ? db.devReturn.findFirst({ where: { id: data.devReturnId, organizationId: org, member: scope }, select: { memberId: true, centralId: true } })
      : null,
    data.oneOnOneId
      ? db.oneOnOne.findFirst({ where: { id: data.oneOnOneId, member: scope, ...visibilityFilter(viewer) }, select: { memberId: true } })
      : null,
    data.feedbackId
      ? db.feedback.findFirst({ where: { id: data.feedbackId, member: scope, ...visibilityFilter(viewer) }, select: { memberId: true } })
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
function linkOf(r: RawRow, viewer: Viewer): WatchLinkView | null {
  const canSee = (v: Visibility) => viewer.role !== "VIEWER" || v === "SHARED"
  if (r.agreement) return { kind: "agreement", label: r.agreement.title, href: `/agreements/${r.agreement.id}` }
  if (r.priorityValidation && !r.priorityValidation.deletedAt) {
    return { kind: "validation", label: r.priorityValidation.ticketRef, href: `/priority-validations?period=custom&from=01-01-2000&to=31-12-2099` }
  }
  if (r.devReturn && !r.devReturn.deletedAt) {
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

function toRow(r: RawRow, viewer: Viewer, now: Date, t: AlertThresholds): WatchRow {
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
    link: linkOf(r, viewer),
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
export async function listWatchItems(viewer: Viewer, filters: WatchFilters, t: AlertThresholds, now = new Date()) {
  const rows = await db.watchItem.findMany({
    where: { ...scopeWhere(viewer), ...filterWhere(filters), ...visibilityFilter(viewer) },
    select: rowSelect,
  })
  const all = rows.map((r) => toRow(r, viewer, now, t))
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
export async function getWatchItem(viewer: Viewer, id: string, t: AlertThresholds, now = new Date()): Promise<WatchDetail | null> {
  const r = await db.watchItem.findFirst({
    where: { id, ...scopeWhere(viewer), ...visibilityFilter(viewer) },
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
    ...toRow(raw, viewer, now, t),
    createdBy: createdBy.name,
    reviews: reviews.map(({ author, ...rv }) => ({ ...rv, author: author.name })),
  }
}

/** Observações ATIVAS por registro de origem, para o estado do WatchButton nas listas. */
export async function activeWatchByLink(viewer: Viewer, key: Exclude<WatchLinkKey, "dailyId">, ids: string[]): Promise<Record<string, { id: string; heat: WatchHeat }>> {
  if (ids.length === 0) return {}
  const rows = await db.watchItem.findMany({
    where: { [key]: { in: ids }, ...scopeWhere(viewer), status: "ACTIVE", ...visibilityFilter(viewer) },
    select: { id: true, heat: true, agreementId: true, priorityValidationId: true, devReturnId: true, oneOnOneId: true, feedbackId: true },
  })
  return Object.fromEntries(rows.flatMap((r) => (r[key] ? [[r[key]!, { id: r.id, heat: r.heat }]] : [])))
}

/** Bloco do perfil: as ativas da pessoa, do fogo alto ao baixo, o mais esquecido primeiro. */
export async function memberWatchItems(viewer: Viewer, memberId: string, t: AlertThresholds, now = new Date()) {
  const rows = await db.watchItem.findMany({
    where: { memberId, status: "ACTIVE", ...scopeWhere(viewer), ...visibilityFilter(viewer) },
    select: rowSelect,
  })
  return rows.map((r) => toRow(r, viewer, now, t)).sort(compareWatch)
}

/** Pessoas e centrais para os filtros de /watch. */
export async function watchFilterOptions(viewer: Viewer) {
  const [members, centrals] = await Promise.all([
    db.teamMember.findMany({ where: { ...memberScope(viewer), status: { not: "INACTIVE" } }, orderBy: { preferredName: "asc" }, select: { id: true, preferredName: true } }),
    db.central.findMany({ where: { organizationId: viewer.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
  ])
  return { members, centrals }
}
