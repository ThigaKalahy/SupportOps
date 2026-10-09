import type { Prisma } from "@prisma/client"

import { centralSlug, cleanCentralName } from "../lib/centrals.ts"
import { fill, labels } from "../lib/labels.ts"
import { MODULES } from "../lib/modules.ts"
import { fieldErrorsOf, type ActionResult } from "../lib/validators/fields.ts"
import {
  activeCatalogSchema,
  catalogRefSchema,
  catalogSchemas,
  CATALOG_KINDS,
  moveCatalogSchema,
  thresholdSchema,
  UNORDERED_KINDS,
  type CatalogKind,
} from "../lib/validators/settings.ts"

import { auditOf, writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { catalogUsage } from "./queries/settings.ts"
import { listThresholdSettings } from "./queries/thresholds.ts"
import { ForbiddenError, hasModule, requireManager, teamScope, type TeamContext } from "./scope.ts"

/**
 * Escrita dos catálogos de /settings (núcleo de src/actions/settings.ts).
 * Toda escrita é auditada (`settings.<kind>.<ação>`).
 *
 * Ordem: níveis de prioridade por rank (maior = mais alto, renumerado
 * n..1); os demais por `order` (1..n). Reordenar renumera tudo, numa
 * transação. Validações já gravadas guardam os ranks do momento (D14), então
 * reordenar níveis não muda nenhum resultado histórico.
 *
 * Excluir só quando nada usa o item; o que está em uso se desativa.
 *
 * Tudo no time do contexto (P22): catálogo é por time (D31). Catálogo de módulo
 * opcional desligado (D32) não se edita: `requireCatalogModule`.
 */

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

const S = labels.settings

/** Registro do Prisma → JSON do AuditLog (datas viram texto ISO). */
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function audit(ctx: TeamContext, kind: CatalogKind, action: string, entityId: string, before?: unknown, after?: unknown) {
  return {
    entry: {
      action: `settings.${kind}.${action}`,
      entity: ENTITY[kind],
      entityId,
      ...(before === undefined ? {} : { before: json(before) }),
      ...(after === undefined ? {} : { after: json(after) }),
    },
    context: auditOf(ctx),
  }
}

const ENTITY: Record<CatalogKind, string> = {
  priorityLevel: "PriorityLevel",
  reclassificationReason: "ReclassificationReason",
  blockerReason: "BlockerReason",
  ticketPattern: "TicketUrlPattern",
  competency: "Competency",
  metric: "MetricDefinition",
  central: "Central",
  devReturnReason: "DevReturnReason",
}

/** Catálogo que pertence a um módulo opcional só se edita com o módulo ligado. */
function requireCatalogModule(ctx: TeamContext, kind: CatalogKind): void {
  const allowed =
    kind === "priorityLevel" || kind === "reclassificationReason"
      ? hasModule(ctx, MODULES.PRIORITY_VALIDATION)
      : kind === "devReturnReason"
        ? hasModule(ctx, MODULES.DEV_RETURNS)
        : kind === "central"
          ? hasModule(ctx, MODULES.CENTRALS)
          : kind === "ticketPattern"
            ? hasModule(ctx, MODULES.PRIORITY_VALIDATION) || hasModule(ctx, MODULES.DEV_RETURNS)
            : true
  if (!allowed) throw new ForbiddenError(labels.access.moduleDisabled)
}

/** Ids na ordem de exibição. */
async function orderedIds(tx: Tx, kind: CatalogKind, ctx: TeamContext): Promise<string[]> {
  const where = teamScope(ctx)
  const rows =
    kind === "priorityLevel"
      ? await tx.priorityLevel.findMany({ where, orderBy: [{ rank: "desc" }, { label: "asc" }], select: { id: true } })
      : kind === "reclassificationReason"
        ? await tx.reclassificationReason.findMany({ where, orderBy: [{ order: "asc" }, { label: "asc" }], select: { id: true } })
        : kind === "blockerReason"
          ? await tx.blockerReason.findMany({ where, orderBy: [{ order: "asc" }, { label: "asc" }], select: { id: true } })
          : kind === "ticketPattern"
            ? await tx.ticketUrlPattern.findMany({ where, orderBy: [{ order: "asc" }, { label: "asc" }], select: { id: true } })
            : kind === "metric"
              ? await tx.metricDefinition.findMany({ where, orderBy: { label: "asc" }, select: { id: true } })
              : kind === "central"
                ? await tx.central.findMany({ where, orderBy: { name: "asc" }, select: { id: true } })
                : kind === "devReturnReason"
                  ? await tx.devReturnReason.findMany({ where, orderBy: [{ order: "asc" }, { label: "asc" }], select: { id: true } })
                : await tx.competency.findMany({ where, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true } })
  return rows.map((r) => r.id)
}

/** Grava a ordem: rank n..1 nos níveis, order 1..n nos demais. */
async function renumber(tx: Tx, kind: CatalogKind, ids: string[], ctx: TeamContext): Promise<void> {
  if (UNORDERED_KINDS.includes(kind)) return
  for (const [i, id] of ids.entries()) {
    const where = { id, ...teamScope(ctx) }
    if (kind === "priorityLevel") await tx.priorityLevel.update({ where, data: { rank: ids.length - i } })
    else if (kind === "reclassificationReason") await tx.reclassificationReason.update({ where, data: { order: i + 1 } })
    else if (kind === "blockerReason") await tx.blockerReason.update({ where, data: { order: i + 1 } })
    else if (kind === "devReturnReason") await tx.devReturnReason.update({ where, data: { order: i + 1 } })
    else await tx.ticketUrlPattern.update({ where, data: { order: i + 1 } })
  }
}

async function findItem(kind: CatalogKind, id: string, ctx: TeamContext) {
  const where = { ...teamScope(ctx), id }
  switch (kind) {
    case "priorityLevel":
      return db.priorityLevel.findFirst({ where })
    case "reclassificationReason":
      return db.reclassificationReason.findFirst({ where })
    case "blockerReason":
      return db.blockerReason.findFirst({ where })
    case "ticketPattern":
      return db.ticketUrlPattern.findFirst({ where })
    case "competency":
      return db.competency.findFirst({ where })
    case "metric":
      return db.metricDefinition.findFirst({ where })
    case "central":
      return db.central.findFirst({ where })
    case "devReturnReason":
      return db.devReturnReason.findFirst({ where })
  }
}

/** Nomes já usados no catálogo (comparação sem caixa nem acento), exceto o próprio item. */
async function labelTaken(kind: CatalogKind, ctx: TeamContext, label: string, exceptId?: string): Promise<boolean> {
  if (kind === "central") {
    // Central: a chave é o slug (D20), inclusive contra as desativadas.
    const slug = centralSlug(label)
    return Boolean(await db.central.findFirst({ where: { ...teamScope(ctx), slug, ...(exceptId ? { id: { not: exceptId } } : {}) } }))
  }
  const norm = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase()
  const where = { ...teamScope(ctx), ...(exceptId ? { id: { not: exceptId } } : {}) }
  const select = { label: true } as const
  const rows =
    kind === "priorityLevel"
      ? await db.priorityLevel.findMany({ where, select })
      : kind === "reclassificationReason"
        ? await db.reclassificationReason.findMany({ where, select })
        : kind === "blockerReason"
          ? await db.blockerReason.findMany({ where, select })
          : kind === "ticketPattern"
            ? await db.ticketUrlPattern.findMany({ where, select })
            : kind === "metric"
              ? await db.metricDefinition.findMany({ where, select })
            : kind === "devReturnReason"
              ? await db.devReturnReason.findMany({ where, select })
            : (await db.competency.findMany({ where, select: { name: true } })).map((r) => ({ label: r.name }))
  return rows.some((r) => norm(r.label) === norm(label))
}

/** Chave estável de um nível novo: "Muito alta" → "MUITO_ALTA" (única no time). */
async function levelKey(ctx: TeamContext, label: string): Promise<string> {
  const base =
    label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "NIVEL"
  const used = new Set((await db.priorityLevel.findMany({ where: teamScope(ctx), select: { key: true } })).map((l) => l.key))
  let key = base
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`
  return key
}

/** Cria ou edita um item de catálogo. Item novo entra no fim da lista. */
export async function saveCatalogItemRecord(ctx: TeamContext, kind: unknown, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  if (!CATALOG_KINDS.includes(kind as CatalogKind)) return { ok: false, error: labels.validation.generic }
  const k = kind as CatalogKind
  // Autorização antes da validação: módulo desligado recusa mesmo com entrada inválida.
  requireCatalogModule(ctx, k)
  const parsed = catalogSchemas[k].safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const org = ctx.organizationId
  const scope = teamScope(ctx)

  const before = data.id ? await findItem(k, data.id, ctx) : null
  if (data.id && !before) return { ok: false, error: labels.validation.generic }
  if (await labelTaken(k, ctx, data.label, data.id)) {
    return { ok: false, error: S.validation.duplicate, fieldErrors: { label: S.validation.duplicate } }
  }
  const key = k === "priorityLevel" && !before ? await levelKey(ctx, data.label) : null
  if (k === "metric" && !before) {
    const metricKey = (data as unknown as { key: string }).key
    if (await db.metricDefinition.findFirst({ where: { ...scope, key: metricKey } })) {
      return { ok: false, error: S.metrics.duplicateKey, fieldErrors: { key: S.metrics.duplicateKey } }
    }
  }

  await db.$transaction(async (tx) => {
    let id = before?.id
    let after: unknown
    if (k === "priorityLevel") {
      after = before
        ? await tx.priorityLevel.update({ where: { id: before.id, ...scope }, data: { label: data.label } })
        : await tx.priorityLevel.create({ data: { ...scope, organizationId: org, key: key!, label: data.label, rank: 0 } })
    } else if (k === "reclassificationReason") {
      const d = data as { label: string; requiresDetail: boolean }
      after = before
        ? await tx.reclassificationReason.update({ where: { id: before.id, ...scope }, data: { label: d.label, requiresDetail: d.requiresDetail } })
        : await tx.reclassificationReason.create({
            data: { ...scope, organizationId: org, label: d.label, requiresDetail: d.requiresDetail, order: 0 },
          })
    } else if (k === "blockerReason") {
      const d = data as { label: string; category: "EXTERNAL" | "INTERNAL" | "CAPACITY" }
      after = before
        ? await tx.blockerReason.update({ where: { id: before.id, ...scope }, data: { label: d.label, category: d.category } })
        : await tx.blockerReason.create({ data: { ...scope, organizationId: org, label: d.label, category: d.category, order: 0 } })
    } else if (k === "metric") {
      const d = data as unknown as { label: string; key: string; unit: string; direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER"; sourceSystem: string }
      const fields = { label: d.label, unit: d.unit || null, direction: d.direction, sourceSystem: d.sourceSystem || null }
      // A chave não muda depois de criada: é o que casa a importação futura.
      after = before
        ? await tx.metricDefinition.update({ where: { id: before.id, ...scope }, data: fields })
        : await tx.metricDefinition.create({ data: { ...scope, organizationId: org, key: d.key, ...fields } })
    } else if (k === "devReturnReason") {
      const d = data as { label: string; category: "ANALYST" | "PROCESS"; requiresDetail: boolean }
      const fields = { label: d.label, category: d.category, requiresDetail: d.requiresDetail }
      after = before
        ? await tx.devReturnReason.update({ where: { id: before.id, ...scope }, data: fields })
        : await tx.devReturnReason.create({ data: { ...scope, organizationId: org, ...fields, order: 0 } })
    } else if (k === "central") {
      const d = data as { label: string; note: string }
      const name = cleanCentralName(d.label)
      const fields = { name, slug: centralSlug(name), note: d.note || null }
      after = before
        ? await tx.central.update({ where: { id: before.id, ...scope }, data: fields })
        : await tx.central.create({ data: { ...scope, organizationId: org, ...fields } })
    } else if (k === "competency") {
      const d = data as { label: string; category: string; description: string }
      const fields = { name: d.label, category: d.category || null, description: d.description || null }
      after = before
        ? await tx.competency.update({ where: { id: before.id, ...scope }, data: fields })
        : await tx.competency.create({ data: { ...scope, organizationId: org, ...fields } })
    } else {
      const d = data as { label: string; regex: string; captureGroup: number }
      after = before
        ? await tx.ticketUrlPattern.update({
            where: { id: before.id, ...scope },
            data: { label: d.label, regex: d.regex, captureGroup: d.captureGroup },
          })
        : await tx.ticketUrlPattern.create({
            data: { ...scope, organizationId: org, label: d.label, regex: d.regex, captureGroup: d.captureGroup, order: 0 },
          })
    }
    id ??= (after as { id: string }).id
    if (!before) {
      // Novo entra no fim: tira da posição provisória e renumera.
      const ids = (await orderedIds(tx, k, ctx)).filter((x) => x !== id)
      await renumber(tx, k, [...ids, id], ctx)
    }
    const a = audit(ctx, k, before ? "update" : "create", id, before ?? undefined, after)
    await writeAudit(a.entry, { ...a.context, tx })
  })
  return { ok: true }
}

/** Sobe ou desce um item uma posição. */
export async function moveCatalogItemRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = moveCatalogSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { kind, id, direction } = parsed.data
  if (UNORDERED_KINDS.includes(kind)) return { ok: false, error: labels.validation.generic }
  requireCatalogModule(ctx, kind)
  await db.$transaction(async (tx) => {
    const ids = await orderedIds(tx, kind, ctx)
    const from = ids.indexOf(id)
    const to = direction === "up" ? from - 1 : from + 1
    if (from === -1 || to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
    await renumber(tx, kind, ids, ctx)
    const a = audit(ctx, kind, "move", id, { position: from + 1 }, { position: to + 1, order: ids })
    await writeAudit(a.entry, { ...a.context, tx })
  })
  return { ok: true }
}

export async function setCatalogItemActiveRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = activeCatalogSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { kind, id, active } = parsed.data
  requireCatalogModule(ctx, kind)
  const before = await findItem(kind, id, ctx)
  if (!before) return { ok: false, error: labels.validation.generic }
  await db.$transaction(async (tx) => {
    const data = { isActive: active }
    const where = { id, ...teamScope(ctx) }
    if (kind === "priorityLevel") await tx.priorityLevel.update({ where, data })
    else if (kind === "reclassificationReason") await tx.reclassificationReason.update({ where, data })
    else if (kind === "blockerReason") await tx.blockerReason.update({ where, data })
    else if (kind === "competency") await tx.competency.update({ where, data })
    else if (kind === "metric") await tx.metricDefinition.update({ where, data })
    else if (kind === "devReturnReason") await tx.devReturnReason.update({ where, data })
    // Central desativada ganha deletedAt e some dos comboboxes; o histórico continua apontando para ela.
    else if (kind === "central") await tx.central.update({ where, data: { ...data, deletedAt: active ? null : new Date() } })
    else await tx.ticketUrlPattern.update({ where, data })
    const a = audit(ctx, kind, active ? "activate" : "deactivate", id, { isActive: before.isActive }, { isActive: active })
    await writeAudit(a.entry, { ...a.context, tx })
  })
  return { ok: true }
}

/** Exclui um item que nada usa; em uso, recusa e orienta a desativar. */
export async function deleteCatalogItemRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = catalogRefSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { kind, id } = parsed.data
  requireCatalogModule(ctx, kind)
  const before = await findItem(kind, id, ctx)
  if (!before) return { ok: false, error: labels.validation.generic }
  const usage = (await catalogUsage(ctx, kind, [id])).get(id) ?? 0
  if (usage > 0) return { ok: false, error: fill(S.inUse, { count: usage }) }
  await db.$transaction(async (tx) => {
    const where = { id, ...teamScope(ctx) }
    if (kind === "priorityLevel") await tx.priorityLevel.delete({ where })
    else if (kind === "reclassificationReason") await tx.reclassificationReason.delete({ where })
    else if (kind === "blockerReason") await tx.blockerReason.delete({ where })
    else if (kind === "competency") await tx.competency.delete({ where })
    else if (kind === "metric") await tx.metricDefinition.delete({ where })
    else if (kind === "central") await tx.central.delete({ where })
    else if (kind === "devReturnReason") await tx.devReturnReason.delete({ where })
    else await tx.ticketUrlPattern.delete({ where })
    await renumber(tx, kind, await orderedIds(tx, kind, ctx), ctx)
    const a = audit(ctx, kind, "delete", id, before)
    await writeAudit(a.entry, { ...a.context, tx })
  })
  return { ok: true }
}

/**
 * Um limiar do motor de alertas. Só chaves conhecidas (as escalares e a
 * cadência de 1:1 de uma senioridade existente), dentro da faixa; null ou o
 * próprio padrão apagam a linha (volta ao padrão). Auditado.
 */
export async function setThresholdRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = thresholdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { key, value } = parsed.data
  const setting = (await listThresholdSettings(ctx)).find((s) => s.key === key)
  if (!setting) return { ok: false, error: labels.validation.generic }
  if (value !== null && (value < setting.min || value > setting.max)) {
    return { ok: false, error: fill(S.thresholds.outOfRange, { min: setting.min, max: setting.max }) }
  }
  const where = { teamId_key: { teamId: ctx.teamId, key } }
  const reset = value === null || value === setting.defaultValue

  await db.$transaction(async (tx) => {
    if (reset) await tx.alertThreshold.deleteMany({ where: { ...teamScope(ctx), key } })
    else await tx.alertThreshold.upsert({ where, create: { ...teamScope(ctx), organizationId: ctx.organizationId, key, value }, update: { value } })
    await writeAudit(
      {
        action: "settings.alertThreshold.update",
        entity: "AlertThreshold",
        entityId: key,
        before: { value: setting.value, custom: setting.custom },
        after: { value: reset ? setting.defaultValue : value, custom: !reset },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}
