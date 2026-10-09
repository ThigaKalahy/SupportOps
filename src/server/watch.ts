import type { Prisma, WatchHeat } from "@prisma/client"

import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import {
  createWatchSchema,
  heatWatchSchema,
  resolveWatchSchema,
  reviewWatchSchema,
  visibilityWatchSchema,
  watchRefSchema,
} from "../lib/validators/watch.ts"
import { cooler, hotter } from "../lib/watch.ts"

import { auditOf, writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { recordTimelineEvents, syncTimelineVisibility, timelineEventFor } from "./timeline.ts"
import { findActiveWatchForLink, findWatchForWrite, resolveWatchLinks, WATCH_LINKS } from "./queries/watch.ts"
import { requireManager, teamScope, type TeamContext } from "./scope.ts"

/**
 * Escrita de "Em observação" (P21, D24–D27). Núcleo de src/actions/watch.ts.
 *
 * - Nasce PRIVATE, sempre (D25): nenhum caminho cria SHARED.
 * - Escreve TimelineEvent só quando há pessoa (D26): na criação e na
 *   resolução, com a visibilidade da observação; revisões não.
 * - Resolver exige texto (D27); arquivar não.
 * - Mesmo registro de origem com observação ATIVA: devolve a existente, não duplica.
 * Toda escrita é auditada (`watch.*`).
 */

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]
type Result = { ok: true; id: string; existed: boolean } | Extract<ActionResult, { ok: false }>

const LINKS = WATCH_LINKS

function audit(ctx: TeamContext, action: string, entityId: string, before?: unknown, after?: unknown, tx?: Tx) {
  const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue
  return writeAudit(
    {
      action: `watch.${action}`,
      entity: "WatchItem",
      entityId,
      ...(before === undefined ? {} : { before: json(before) }),
      ...(after === undefined ? {} : { after: json(after) }),
    },
    auditOf(ctx, tx),
  )
}

export async function createWatchItemRecord(ctx: TeamContext, input: unknown): Promise<Result> {
  requireManager(ctx)
  const parsed = createWatchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const resolved = await resolveWatchLinks(ctx, data)
  if (!resolved) return { ok: false, error: labels.validation.generic }
  const existing = await findActiveWatchForLink(ctx, { ...data, memberId: resolved.memberId ?? "" })
  if (existing) return { ok: true, id: existing.id, existed: true }

  const now = new Date()
  const created = await db.$transaction(async (tx) => {
    const item = await tx.watchItem.create({
      data: {
        ...teamScope(ctx),
        organizationId: ctx.organizationId,
        title: data.title,
        context: textOrNull(data.context),
        heat: data.heat,
        origin: data.origin,
        // D25: nasce PRIVATE, sem exceção e sem configuração que mude o padrão.
        visibility: "PRIVATE",
        memberId: resolved.memberId,
        centralId: resolved.centralId,
        ...Object.fromEntries(LINKS.map((k) => [k, data[k] || null])),
        createdAt: now,
        createdByUserId: ctx.userId,
        lastReviewedAt: now,
        heatChangedAt: now,
      },
    })
    if (item.memberId) {
      await recordTimelineEvents(tx, ctx, [
        timelineEventFor.watchCreated({ ...item, memberId: item.memberId, authorUserId: ctx.userId }),
      ])
    }
    await audit(ctx, "create", item.id, undefined, { title: item.title, heat: item.heat, origin: item.origin, memberId: item.memberId }, tx)
    return item
  })
  return { ok: true, id: created.id, existed: false }
}

const findOwned = findWatchForWrite

/** "Revisado hoje": um clique, nota opcional. Grava WatchReview, lastReviewedAt e reviewCount. Sem timeline. */
export async function reviewWatchItemRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = reviewWatchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const item = await findOwned(ctx, parsed.data.id)
  if (!item || item.status !== "ACTIVE") return { ok: false, error: labels.validation.generic }
  const now = new Date()
  await db.$transaction(async (tx) => {
    await tx.watchReview.create({
      data: { ...teamScope(ctx), watchItemId: item.id, reviewedAt: now, note: textOrNull(parsed.data.note), heatBefore: item.heat, heatAfter: item.heat, authorUserId: ctx.userId },
    })
    await tx.watchItem.update({ where: { id: item.id, ...teamScope(ctx) }, data: { lastReviewedAt: now, reviewCount: { increment: 1 } } })
    await audit(ctx, "review", item.id, { lastReviewedAt: item.lastReviewedAt }, { lastReviewedAt: now }, tx)
  })
  return { ok: true }
}

/** Esfriar / Esquentar: um grau, com WatchReview (antes → depois); conta como revisão. */
export async function changeWatchHeatRecord(ctx: TeamContext, input: unknown): Promise<ActionResult & { heat?: WatchHeat }> {
  requireManager(ctx)
  const parsed = heatWatchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const item = await findOwned(ctx, parsed.data.id)
  if (!item || item.status !== "ACTIVE") return { ok: false, error: labels.validation.generic }
  const next = parsed.data.direction === "up" ? hotter(item.heat) : cooler(item.heat)
  if (!next) return { ok: false, error: labels.validation.generic }
  const now = new Date()
  await db.$transaction(async (tx) => {
    await tx.watchReview.create({ data: { ...teamScope(ctx), watchItemId: item.id, reviewedAt: now, heatBefore: item.heat, heatAfter: next, authorUserId: ctx.userId } })
    await tx.watchItem.update({
      where: { id: item.id, ...teamScope(ctx) },
      data: { heat: next, heatChangedAt: now, lastReviewedAt: now, reviewCount: { increment: 1 } },
    })
    await audit(ctx, "heat", item.id, { heat: item.heat }, { heat: next }, tx)
  })
  return { ok: true, heat: next }
}

/** Resolver: texto obrigatório (D27); com pessoa, linha WATCH na timeline com a resolução. */
export async function resolveWatchItemRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = resolveWatchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const item = await findOwned(ctx, parsed.data.id)
  if (!item || item.status !== "ACTIVE") return { ok: false, error: labels.validation.generic }
  const now = new Date()
  await db.$transaction(async (tx) => {
    await tx.watchItem.update({ where: { id: item.id, ...teamScope(ctx) }, data: { status: "RESOLVED", resolvedAt: now, resolutionNote: parsed.data.note } })
    if (item.memberId) {
      await recordTimelineEvents(tx, ctx, [
        timelineEventFor.watchResolved({
          id: item.id,
          memberId: item.memberId,
          title: item.title,
          createdAt: item.createdAt,
          resolvedAt: now,
          note: parsed.data.note,
          authorUserId: ctx.userId,
          visibility: item.visibility,
        }),
      ])
    }
    await audit(ctx, "resolve", item.id, { status: item.status }, { status: "RESOLVED", resolutionNote: parsed.data.note }, tx)
  })
  return { ok: true }
}

/** Arquivar: o que deixou de fazer sentido (não o que foi resolvido). Sem texto, sem timeline. */
export async function archiveWatchItemRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = watchRefSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const item = await findOwned(ctx, parsed.data.id)
  if (!item || item.status !== "ACTIVE") return { ok: false, error: labels.validation.generic }
  await db.$transaction(async (tx) => {
    await tx.watchItem.update({ where: { id: item.id, ...teamScope(ctx) }, data: { status: "ARCHIVED" } })
    await audit(ctx, "archive", item.id, { status: item.status }, { status: "ARCHIVED" }, tx)
  })
  return { ok: true }
}

/** Visibilidade: muda a observação e as linhas da timeline dela na mesma transação. */
export async function setWatchVisibilityRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = visibilityWatchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const item = await findOwned(ctx, parsed.data.id)
  if (!item) return { ok: false, error: labels.validation.generic }
  await db.$transaction(async (tx) => {
    await tx.watchItem.update({ where: { id: item.id, ...teamScope(ctx) }, data: { visibility: parsed.data.visibility } })
    await syncTimelineVisibility(tx, ctx, { kind: "watchItem", id: item.id }, parsed.data.visibility)
    await audit(ctx, "visibility.update", item.id, { visibility: item.visibility }, { visibility: parsed.data.visibility }, tx)
  })
  return { ok: true }
}

/**
 * Observações criadas num formulário ainda não salvo (nota da daily, combinado
 * novo da daily, 1:1, feedback): ao salvar, ganham o vínculo com o registro,
 * na mesma transação. Só as do time do contexto e ainda sem esse vínculo.
 */
export async function linkPendingWatchItems(
  tx: Tx,
  ctx: Pick<TeamContext, "teamId">,
  ids: string[],
  link: Partial<Record<(typeof LINKS)[number], string>>,
): Promise<void> {
  if (ids.length === 0) return
  const [key, value] = Object.entries(link)[0] ?? []
  if (!key || !value) return
  await tx.watchItem.updateMany({
    where: { ...teamScope(ctx), id: { in: ids }, [key]: null },
    data: { [key]: value },
  })
}
