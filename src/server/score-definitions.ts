import { labels } from "../lib/labels.ts"
import { activationProblems, isEditable } from "../lib/score-composition.ts"
import { fieldErrorsOf, type ActionResult } from "../lib/validators/fields.ts"
import {
  createScoreDefinitionSchema,
  removeScoreComponentSchema,
  scoreActiveSchema,
  scoreComponentSchema,
  scoreDefinitionRefSchema,
  scoreNotesSchema,
} from "../lib/validators/score.ts"

import { auditOf, writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { requireManager, teamScope, type TeamContext } from "./scope.ts"

/**
 * Cadastro de definições de score (núcleo de src/actions/score.ts). Só
 * configuração: nenhuma escrita aqui toca MetricResult, ScoreResult ou
 * ScoreResultComponent, e nada é calculado (D5). Versionamento: mudar pesos
 * de uma versão ativa (ou com resultado) exige versão nova; uma versão ativa
 * por nome; ativar exige pesos somando 100. Tudo auditado (settings.score.*).
 */

const S = labels.settings.score
const generic = (): ActionResult => ({ ok: false, error: labels.validation.generic })

async function definitionInScope(ctx: TeamContext, id: string) {
  return db.scoreDefinition.findFirst({
    where: { ...teamScope(ctx), id },
    include: { components: true, _count: { select: { results: true } } },
  })
}

/** Definição nova: versão 1, inativa, sem componentes. Nome repetido usa "nova versão". */
export async function createScoreDefinitionRecord(ctx: TeamContext, input: unknown): Promise<ActionResult | { ok: true; id: string }> {
  requireManager(ctx)
  const parsed = createScoreDefinitionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const { name, notes } = parsed.data
  const existing = await db.scoreDefinition.findFirst({ where: { ...teamScope(ctx), name: { equals: name, mode: "insensitive" } } })
  if (existing) return { ok: false, error: S.validation.duplicateName, fieldErrors: { name: S.validation.duplicateName } }
  const created = await db.$transaction(async (tx) => {
    const d = await tx.scoreDefinition.create({
      data: { ...teamScope(ctx), organizationId: ctx.organizationId, name, version: 1, notes: notes || null, isActive: false },
    })
    await writeAudit(
      { action: "settings.score.create", entity: "ScoreDefinition", entityId: d.id, after: { name, version: 1 } },
      auditOf(ctx, tx),
    )
    return d
  })
  return { ok: true, id: created.id }
}

/** Versão nova a partir de uma existente: mesmos componentes, inativa, número seguinte. */
export async function newScoreVersionRecord(ctx: TeamContext, input: unknown): Promise<ActionResult | { ok: true; id: string }> {
  requireManager(ctx)
  const parsed = scoreDefinitionRefSchema.safeParse(input)
  if (!parsed.success) return generic()
  const source = await definitionInScope(ctx, parsed.data.scoreDefinitionId)
  if (!source) return generic()
  const last = await db.scoreDefinition.findFirst({
    where: { ...teamScope(ctx), name: source.name },
    orderBy: { version: "desc" },
    select: { version: true },
  })
  const version = (last?.version ?? source.version) + 1
  const created = await db.$transaction(async (tx) => {
    const d = await tx.scoreDefinition.create({
      data: {
        ...teamScope(ctx),
        organizationId: ctx.organizationId,
        name: source.name,
        version,
        notes: source.notes,
        isActive: false,
        components: {
          create: source.components.map((c) => ({
            ...teamScope(ctx),
            metricDefinitionId: c.metricDefinitionId,
            weight: c.weight,
            normalizationMin: c.normalizationMin,
            normalizationMax: c.normalizationMax,
          })),
        },
      },
    })
    await writeAudit(
      { action: "settings.score.version", entity: "ScoreDefinition", entityId: d.id, before: { from: source.id, version: source.version }, after: { version } },
      auditOf(ctx, tx),
    )
    return d
  })
  return { ok: true, id: created.id }
}

export async function updateScoreNotesRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = scoreNotesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const d = await definitionInScope(ctx, parsed.data.scoreDefinitionId)
  if (!d) return generic()
  if (!isEditable({ isActive: d.isActive, results: d._count.results })) return { ok: false, error: S.validation.locked }
  await db.$transaction(async (tx) => {
    await tx.scoreDefinition.update({ where: { id: d.id, ...teamScope(ctx) }, data: { notes: parsed.data.notes || null } })
    await writeAudit(
      { action: "settings.score.notes", entity: "ScoreDefinition", entityId: d.id, before: { notes: d.notes }, after: { notes: parsed.data.notes || null } },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/** Inclui ou altera um componente (métrica, peso, faixa). Só em versão editável. */
export async function setScoreComponentRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = scoreComponentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const c = parsed.data
  const d = await definitionInScope(ctx, c.scoreDefinitionId)
  if (!d) return generic()
  if (!isEditable({ isActive: d.isActive, results: d._count.results })) return { ok: false, error: S.validation.locked }
  const metric = await db.metricDefinition.findFirst({ where: { ...teamScope(ctx), id: c.metricDefinitionId } })
  if (!metric) return generic()
  const before = d.components.find((x) => x.metricDefinitionId === c.metricDefinitionId)
  if (!before && !metric.isActive) return { ok: false, error: S.validation.inactiveMetric }
  const data = { weight: c.weight, normalizationMin: c.normalizationMin, normalizationMax: c.normalizationMax }
  await db.$transaction(async (tx) => {
    await tx.scoreComponent.upsert({
      where: { scoreDefinitionId_metricDefinitionId: { scoreDefinitionId: d.id, metricDefinitionId: metric.id }, ...teamScope(ctx) },
      create: { ...teamScope(ctx), scoreDefinitionId: d.id, metricDefinitionId: metric.id, ...data },
      update: data,
    })
    await writeAudit(
      {
        action: "settings.score.component",
        entity: "ScoreDefinition",
        entityId: d.id,
        before: before ? { metric: metric.key, weight: before.weight, min: before.normalizationMin, max: before.normalizationMax } : null,
        after: { metric: metric.key, weight: c.weight, min: c.normalizationMin, max: c.normalizationMax },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

export async function removeScoreComponentRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = removeScoreComponentSchema.safeParse(input)
  if (!parsed.success) return generic()
  const d = await definitionInScope(ctx, parsed.data.scoreDefinitionId)
  if (!d) return generic()
  if (!isEditable({ isActive: d.isActive, results: d._count.results })) return { ok: false, error: S.validation.locked }
  const before = d.components.find((x) => x.metricDefinitionId === parsed.data.metricDefinitionId)
  if (!before) return generic()
  await db.$transaction(async (tx) => {
    await tx.scoreComponent.delete({
      where: { scoreDefinitionId_metricDefinitionId: { scoreDefinitionId: d.id, metricDefinitionId: before.metricDefinitionId }, ...teamScope(ctx) },
    })
    await writeAudit(
      { action: "settings.score.componentRemove", entity: "ScoreDefinition", entityId: d.id, before: { metricDefinitionId: before.metricDefinitionId, weight: before.weight } },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/** Ativar exige pesos somando 100 e desativa as outras versões do mesmo nome. Desativar é sempre possível. */
export async function setScoreActiveRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = scoreActiveSchema.safeParse(input)
  if (!parsed.success) return generic()
  const d = await definitionInScope(ctx, parsed.data.scoreDefinitionId)
  if (!d) return generic()
  if (parsed.data.active === d.isActive) return { ok: true }
  if (parsed.data.active) {
    const problems = activationProblems(d.components)
    if (problems.length) return { ok: false, error: problems.includes("noComponents") ? S.validation.noComponents : S.validation.weightSum }
  }
  await db.$transaction(async (tx) => {
    if (parsed.data.active) {
      await tx.scoreDefinition.updateMany({
        where: { ...teamScope(ctx), name: d.name, id: { not: d.id }, isActive: true },
        data: { isActive: false },
      })
    }
    await tx.scoreDefinition.update({ where: { id: d.id, ...teamScope(ctx) }, data: { isActive: parsed.data.active } })
    await writeAudit(
      {
        action: parsed.data.active ? "settings.score.activate" : "settings.score.deactivate",
        entity: "ScoreDefinition",
        entityId: d.id,
        before: { isActive: d.isActive },
        after: { isActive: parsed.data.active },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

/** Excluir só rascunho sem resultado (o histórico de uma versão usada não se apaga). */
export async function deleteScoreDefinitionRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = scoreDefinitionRefSchema.safeParse(input)
  if (!parsed.success) return generic()
  const d = await definitionInScope(ctx, parsed.data.scoreDefinitionId)
  if (!d) return generic()
  if (!isEditable({ isActive: d.isActive, results: d._count.results })) return { ok: false, error: S.validation.locked }
  await db.$transaction(async (tx) => {
    await tx.scoreDefinition.delete({ where: { id: d.id, ...teamScope(ctx) } })
    await writeAudit(
      { action: "settings.score.delete", entity: "ScoreDefinition", entityId: d.id, before: { name: d.name, version: d.version, components: d.components.length } },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}
