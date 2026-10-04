import type { Prisma } from "@prisma/client"

import { fill, labels } from "../lib/labels.ts"
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

import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { catalogUsage } from "./queries/settings.ts"
import { listThresholdSettings } from "./queries/thresholds.ts"
import { canWrite, type Viewer } from "./visibility.ts"

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
 */

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

const S = labels.settings

/** Registro do Prisma → JSON do AuditLog (datas viram texto ISO). */
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function audit(user: Viewer, kind: CatalogKind, action: string, entityId: string, before?: unknown, after?: unknown) {
  return {
    entry: {
      action: `settings.${kind}.${action}`,
      entity: ENTITY[kind],
      entityId,
      ...(before === undefined ? {} : { before: json(before) }),
      ...(after === undefined ? {} : { after: json(after) }),
    },
    context: { organizationId: user.organizationId, userId: user.id },
  }
}

const ENTITY: Record<CatalogKind, string> = {
  priorityLevel: "PriorityLevel",
  reclassificationReason: "ReclassificationReason",
  blockerReason: "BlockerReason",
  ticketPattern: "TicketUrlPattern",
  competency: "Competency",
  metric: "MetricDefinition",
}

/** Ids na ordem de exibição. */
async function orderedIds(tx: Tx, kind: CatalogKind, organizationId: string): Promise<string[]> {
  const where = { organizationId }
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
              : await tx.competency.findMany({ where, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true } })
  return rows.map((r) => r.id)
}

/** Grava a ordem: rank n..1 nos níveis, order 1..n nos demais. */
async function renumber(tx: Tx, kind: CatalogKind, ids: string[]): Promise<void> {
  if (UNORDERED_KINDS.includes(kind)) return
  for (const [i, id] of ids.entries()) {
    if (kind === "priorityLevel") await tx.priorityLevel.update({ where: { id }, data: { rank: ids.length - i } })
    else if (kind === "reclassificationReason") await tx.reclassificationReason.update({ where: { id }, data: { order: i + 1 } })
    else if (kind === "blockerReason") await tx.blockerReason.update({ where: { id }, data: { order: i + 1 } })
    else await tx.ticketUrlPattern.update({ where: { id }, data: { order: i + 1 } })
  }
}

async function findItem(kind: CatalogKind, id: string, organizationId: string) {
  const where = { id, organizationId }
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
  }
}

/** Nomes já usados no catálogo (comparação sem caixa nem acento), exceto o próprio item. */
async function labelTaken(kind: CatalogKind, organizationId: string, label: string, exceptId?: string): Promise<boolean> {
  const norm = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase()
  const where = { organizationId, ...(exceptId ? { id: { not: exceptId } } : {}) }
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
            : (await db.competency.findMany({ where, select: { name: true } })).map((r) => ({ label: r.name }))
  return rows.some((r) => norm(r.label) === norm(label))
}

/** Chave estável de um nível novo: "Muito alta" → "MUITO_ALTA" (única na organização). */
async function levelKey(organizationId: string, label: string): Promise<string> {
  const base =
    label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "NIVEL"
  const used = new Set((await db.priorityLevel.findMany({ where: { organizationId }, select: { key: true } })).map((l) => l.key))
  let key = base
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`
  return key
}

/** Cria ou edita um item de catálogo. Item novo entra no fim da lista. */
export async function saveCatalogItemRecord(user: Viewer, kind: unknown, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  if (!CATALOG_KINDS.includes(kind as CatalogKind)) return { ok: false, error: labels.validation.generic }
  const k = kind as CatalogKind
  const parsed = catalogSchemas[k].safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const org = user.organizationId

  const before = data.id ? await findItem(k, data.id, org) : null
  if (data.id && !before) return { ok: false, error: labels.validation.generic }
  if (await labelTaken(k, org, data.label, data.id)) {
    return { ok: false, error: S.validation.duplicate, fieldErrors: { label: S.validation.duplicate } }
  }
  const key = k === "priorityLevel" && !before ? await levelKey(org, data.label) : null
  if (k === "metric" && !before) {
    const metricKey = (data as unknown as { key: string }).key
    if (await db.metricDefinition.findFirst({ where: { organizationId: org, key: metricKey } })) {
      return { ok: false, error: S.metrics.duplicateKey, fieldErrors: { key: S.metrics.duplicateKey } }
    }
  }

  await db.$transaction(async (tx) => {
    let id = before?.id
    let after: unknown
    if (k === "priorityLevel") {
      after = before
        ? await tx.priorityLevel.update({ where: { id: before.id }, data: { label: data.label } })
        : await tx.priorityLevel.create({ data: { organizationId: org, key: key!, label: data.label, rank: 0 } })
    } else if (k === "reclassificationReason") {
      const d = data as { label: string; requiresDetail: boolean }
      after = before
        ? await tx.reclassificationReason.update({ where: { id: before.id }, data: { label: d.label, requiresDetail: d.requiresDetail } })
        : await tx.reclassificationReason.create({
            data: { organizationId: org, label: d.label, requiresDetail: d.requiresDetail, order: 0 },
          })
    } else if (k === "blockerReason") {
      const d = data as { label: string; category: "EXTERNAL" | "INTERNAL" | "CAPACITY" }
      after = before
        ? await tx.blockerReason.update({ where: { id: before.id }, data: { label: d.label, category: d.category } })
        : await tx.blockerReason.create({ data: { organizationId: org, label: d.label, category: d.category, order: 0 } })
    } else if (k === "metric") {
      const d = data as unknown as { label: string; key: string; unit: string; direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER"; sourceSystem: string }
      const fields = { label: d.label, unit: d.unit || null, direction: d.direction, sourceSystem: d.sourceSystem || null }
      // A chave não muda depois de criada: é o que casa a importação futura.
      after = before
        ? await tx.metricDefinition.update({ where: { id: before.id }, data: fields })
        : await tx.metricDefinition.create({ data: { organizationId: org, key: d.key, ...fields } })
    } else if (k === "competency") {
      const d = data as { label: string; category: string; description: string }
      const fields = { name: d.label, category: d.category || null, description: d.description || null }
      after = before
        ? await tx.competency.update({ where: { id: before.id }, data: fields })
        : await tx.competency.create({ data: { organizationId: org, ...fields } })
    } else {
      const d = data as { label: string; regex: string; captureGroup: number }
      after = before
        ? await tx.ticketUrlPattern.update({
            where: { id: before.id },
            data: { label: d.label, regex: d.regex, captureGroup: d.captureGroup },
          })
        : await tx.ticketUrlPattern.create({
            data: { organizationId: org, label: d.label, regex: d.regex, captureGroup: d.captureGroup, order: 0 },
          })
    }
    id ??= (after as { id: string }).id
    if (!before) {
      // Novo entra no fim: tira da posição provisória e renumera.
      const ids = (await orderedIds(tx, k, org)).filter((x) => x !== id)
      await renumber(tx, k, [...ids, id])
    }
    const a = audit(user, k, before ? "update" : "create", id, before ?? undefined, after)
    await writeAudit(a.entry, { ...a.context, tx })
  })
  return { ok: true }
}

/** Sobe ou desce um item uma posição. */
export async function moveCatalogItemRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = moveCatalogSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { kind, id, direction } = parsed.data
  if (UNORDERED_KINDS.includes(kind)) return { ok: false, error: labels.validation.generic }
  const org = user.organizationId
  await db.$transaction(async (tx) => {
    const ids = await orderedIds(tx, kind, org)
    const from = ids.indexOf(id)
    const to = direction === "up" ? from - 1 : from + 1
    if (from === -1 || to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
    await renumber(tx, kind, ids)
    const a = audit(user, kind, "move", id, { position: from + 1 }, { position: to + 1, order: ids })
    await writeAudit(a.entry, { ...a.context, tx })
  })
  return { ok: true }
}

export async function setCatalogItemActiveRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = activeCatalogSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { kind, id, active } = parsed.data
  const org = user.organizationId
  const before = await findItem(kind, id, org)
  if (!before) return { ok: false, error: labels.validation.generic }
  await db.$transaction(async (tx) => {
    const data = { isActive: active }
    if (kind === "priorityLevel") await tx.priorityLevel.update({ where: { id }, data })
    else if (kind === "reclassificationReason") await tx.reclassificationReason.update({ where: { id }, data })
    else if (kind === "blockerReason") await tx.blockerReason.update({ where: { id }, data })
    else if (kind === "competency") await tx.competency.update({ where: { id }, data })
    else if (kind === "metric") await tx.metricDefinition.update({ where: { id }, data })
    else await tx.ticketUrlPattern.update({ where: { id }, data })
    const a = audit(user, kind, active ? "activate" : "deactivate", id, { isActive: before.isActive }, { isActive: active })
    await writeAudit(a.entry, { ...a.context, tx })
  })
  return { ok: true }
}

/** Exclui um item que nada usa; em uso, recusa e orienta a desativar. */
export async function deleteCatalogItemRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = catalogRefSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { kind, id } = parsed.data
  const org = user.organizationId
  const before = await findItem(kind, id, org)
  if (!before) return { ok: false, error: labels.validation.generic }
  const usage = (await catalogUsage(kind, [id])).get(id) ?? 0
  if (usage > 0) return { ok: false, error: fill(S.inUse, { count: usage }) }
  await db.$transaction(async (tx) => {
    if (kind === "priorityLevel") await tx.priorityLevel.delete({ where: { id } })
    else if (kind === "reclassificationReason") await tx.reclassificationReason.delete({ where: { id } })
    else if (kind === "blockerReason") await tx.blockerReason.delete({ where: { id } })
    else if (kind === "competency") await tx.competency.delete({ where: { id } })
    else if (kind === "metric") await tx.metricDefinition.delete({ where: { id } })
    else await tx.ticketUrlPattern.delete({ where: { id } })
    await renumber(tx, kind, await orderedIds(tx, kind, org))
    const a = audit(user, kind, "delete", id, before)
    await writeAudit(a.entry, { ...a.context, tx })
  })
  return { ok: true }
}

/**
 * Um limiar do motor de alertas. Só chaves conhecidas (as escalares e a
 * cadência de 1:1 de uma senioridade existente), dentro da faixa; null ou o
 * próprio padrão apagam a linha (volta ao padrão). Auditado.
 */
export async function setThresholdRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = thresholdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { key, value } = parsed.data
  const setting = (await listThresholdSettings(user)).find((s) => s.key === key)
  if (!setting) return { ok: false, error: labels.validation.generic }
  if (value !== null && (value < setting.min || value > setting.max)) {
    return { ok: false, error: fill(S.thresholds.outOfRange, { min: setting.min, max: setting.max }) }
  }
  const org = user.organizationId
  const where = { organizationId_key: { organizationId: org, key } }
  const reset = value === null || value === setting.defaultValue

  await db.$transaction(async (tx) => {
    if (reset) await tx.alertThreshold.deleteMany({ where: { organizationId: org, key } })
    else await tx.alertThreshold.upsert({ where, create: { organizationId: org, key, value }, update: { value } })
    await writeAudit(
      {
        action: "settings.alertThreshold.update",
        entity: "AlertThreshold",
        entityId: key,
        before: { value: setting.value, custom: setting.custom },
        after: { value: reset ? setting.defaultValue : value, custom: !reset },
      },
      { organizationId: org, userId: user.id, tx },
    )
  })
  return { ok: true }
}
