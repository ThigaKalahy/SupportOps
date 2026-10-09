import type { BlockerCategory, DevReturnCategory } from "@prisma/client"

import type { CatalogKind } from "../../lib/validators/settings.ts"
import { db } from "../db.ts"
import type { Viewer } from "../visibility.ts"

/**
 * Leituras de /settings: cada catálogo na ordem de exibição, com quantos
 * registros usam cada item (item em uso não se exclui, só se desativa).
 */

/** Uso de cada item: validações (níveis e motivos de reclassificação) ou checkins (motivos de impeditivo). */
export async function catalogUsage(kind: CatalogKind, ids: string[]): Promise<Map<string, number>> {
  const usage = new Map<string, number>(ids.map((id) => [id, 0]))
  const add = (id: string | null, count: number) => {
    if (id && usage.has(id)) usage.set(id, (usage.get(id) ?? 0) + count)
  }
  // `deletedAt: undefined` no where desliga o filtro automático do db: validação excluída
  // (soft delete) também conta, porque ainda aponta para o item no banco.
  if (kind === "priorityLevel") {
    const [analyst, supervisor] = await Promise.all([
      db.priorityValidation.groupBy({
        by: ["analystPriorityId"],
        where: { analystPriorityId: { in: ids }, deletedAt: undefined },
        _count: { _all: true },
      }),
      db.priorityValidation.groupBy({
        by: ["supervisorPriorityId"],
        where: { supervisorPriorityId: { in: ids }, deletedAt: undefined },
        _count: { _all: true },
      }),
    ])
    for (const row of analyst) add(row.analystPriorityId, row._count._all)
    for (const row of supervisor) add(row.supervisorPriorityId, row._count._all)
  } else if (kind === "reclassificationReason") {
    const rows = await db.priorityValidation.groupBy({
      by: ["reasonId"],
      where: { reasonId: { in: ids }, deletedAt: undefined },
      _count: { _all: true },
    })
    for (const row of rows) add(row.reasonId, row._count._all)
  } else if (kind === "blockerReason") {
    const rows = await db.agreementCheckin.groupBy({
      by: ["blockerReasonId"],
      where: { blockerReasonId: { in: ids } },
      _count: { _all: true },
    })
    for (const row of rows) add(row.blockerReasonId, row._count._all)
  } else if (kind === "competency") {
    // Nível avaliado, PDI (inclusive excluído), célula da matriz e mentoria apontam para a competência.
    const [levels, plans, expectations, mentorships] = await Promise.all([
      db.memberCompetency.groupBy({ by: ["competencyId"], where: { competencyId: { in: ids } }, _count: { _all: true } }),
      db.developmentPlan.groupBy({
        by: ["competencyId"],
        where: { competencyId: { in: ids }, deletedAt: undefined },
        _count: { _all: true },
      }),
      db.competencyExpectation.groupBy({ by: ["competencyId"], where: { competencyId: { in: ids } }, _count: { _all: true } }),
      db.mentorshipLink.groupBy({ by: ["competencyId"], where: { competencyId: { in: ids } }, _count: { _all: true } }),
    ])
    for (const row of [...levels, ...plans, ...expectations, ...mentorships]) add(row.competencyId, row._count._all)
  } else if (kind === "metric") {
    // Resultados importados e componentes de score apontam para a métrica.
    const [results, components] = await Promise.all([
      db.metricResult.groupBy({ by: ["metricDefinitionId"], where: { metricDefinitionId: { in: ids } }, _count: { _all: true } }),
      db.scoreComponent.groupBy({ by: ["metricDefinitionId"], where: { metricDefinitionId: { in: ids } }, _count: { _all: true } }),
    ])
    for (const row of [...results, ...components]) add(row.metricDefinitionId, row._count._all)
  } else if (kind === "devReturnReason") {
    // Devoluções (inclusive excluídas) apontam para o motivo.
    const rows = await db.devReturn.groupBy({ by: ["reasonId"], where: { reasonId: { in: ids }, deletedAt: undefined }, _count: { _all: true } })
    for (const row of rows) add(row.reasonId, row._count._all)
  } else if (kind === "central") {
    // Combinados e validações (inclusive excluídos) apontam para a central.
    const [agreements, validations] = await Promise.all([
      db.agreement.groupBy({ by: ["centralId"], where: { centralId: { in: ids }, deletedAt: undefined }, _count: { _all: true } }),
      db.priorityValidation.groupBy({ by: ["centralId"], where: { centralId: { in: ids }, deletedAt: undefined }, _count: { _all: true } }),
    ])
    for (const row of [...agreements, ...validations]) add(row.centralId, row._count._all)
  }
  return usage
}

export interface PriorityLevelItem {
  id: string
  label: string
  key: string
  rank: number
  isActive: boolean
  usage: number
}

export async function listPriorityLevels(viewer: Viewer): Promise<PriorityLevelItem[]> {
  const rows = await db.priorityLevel.findMany({
    where: { organizationId: viewer.organizationId },
    orderBy: [{ rank: "desc" }, { label: "asc" }],
    select: { id: true, label: true, key: true, rank: true, isActive: true },
  })
  const usage = await catalogUsage("priorityLevel", rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, usage: usage.get(r.id) ?? 0 }))
}

export interface ReclassificationReasonItem {
  id: string
  label: string
  requiresDetail: boolean
  isActive: boolean
  usage: number
}

export async function listReclassificationReasons(viewer: Viewer): Promise<ReclassificationReasonItem[]> {
  const rows = await db.reclassificationReason.findMany({
    where: { organizationId: viewer.organizationId },
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: { id: true, label: true, requiresDetail: true, isActive: true },
  })
  const usage = await catalogUsage("reclassificationReason", rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, usage: usage.get(r.id) ?? 0 }))
}

export interface BlockerReasonItem {
  id: string
  label: string
  category: BlockerCategory
  isActive: boolean
  usage: number
}

export async function listBlockerReasons(viewer: Viewer): Promise<BlockerReasonItem[]> {
  const rows = await db.blockerReason.findMany({
    where: { organizationId: viewer.organizationId },
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: { id: true, label: true, category: true, isActive: true },
  })
  const usage = await catalogUsage("blockerReason", rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, usage: usage.get(r.id) ?? 0 }))
}

export interface TicketPatternItem {
  id: string
  label: string
  regex: string
  captureGroup: number
  isActive: boolean
  usage: number
}

/** Padrões não são referenciados por registro (o ID é gravado na validação): sempre excluíveis. */
export async function listTicketPatterns(viewer: Viewer): Promise<TicketPatternItem[]> {
  const rows = await db.ticketUrlPattern.findMany({
    where: { organizationId: viewer.organizationId },
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: { id: true, label: true, regex: true, captureGroup: true, isActive: true },
  })
  return rows.map((r) => ({ ...r, usage: 0 }))
}

export interface CompetencyItem {
  id: string
  label: string
  category: string | null
  description: string | null
  isActive: boolean
  usage: number
}

/** Competências por categoria e nome (sem posição própria). Base da matriz, dos níveis e dos PDIs. */
export async function listCompetencies(viewer: Viewer): Promise<CompetencyItem[]> {
  const rows = await db.competency.findMany({
    where: { organizationId: viewer.organizationId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, category: true, description: true, isActive: true },
  })
  const usage = await catalogUsage("competency", rows.map((r) => r.id))
  return rows.map(({ name, ...r }) => ({ ...r, label: name, usage: usage.get(r.id) ?? 0 }))
}

export interface MetricItem {
  id: string
  label: string
  key: string
  unit: string | null
  direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER"
  sourceSystem: string | null
  isActive: boolean
  /** Resultados importados + componentes de score. */
  usage: number
  /** Resultados importados (no MVP, sempre 0). */
  results: number
}

/** Métricas por rótulo, com quantos resultados existem (cobertura do cadastro, não desempenho). */
export async function listMetrics(viewer: Viewer): Promise<MetricItem[]> {
  const rows = await db.metricDefinition.findMany({
    where: { organizationId: viewer.organizationId },
    orderBy: { label: "asc" },
    select: { id: true, label: true, key: true, unit: true, direction: true, sourceSystem: true, isActive: true, _count: { select: { results: true } } },
  })
  const usage = await catalogUsage("metric", rows.map((r) => r.id))
  return rows.map(({ _count, ...r }) => ({ ...r, usage: usage.get(r.id) ?? 0, results: _count.results }))
}

export interface CentralItem {
  id: string
  label: string
  note: string | null
  externalId: string | null
  isActive: boolean
  /** Combinados + validações que apontam para a central. */
  usage: number
}

/** Centrais por nome, inclusive as desativadas (P19). */
export async function listCentralSettings(viewer: Viewer): Promise<CentralItem[]> {
  const rows = await db.central.findMany({
    where: { organizationId: viewer.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, note: true, externalId: true, isActive: true },
  })
  const usage = await catalogUsage("central", rows.map((r) => r.id))
  return rows.map(({ name, ...r }) => ({ ...r, label: name, usage: usage.get(r.id) ?? 0 }))
}

export interface DevReturnReasonItem {
  id: string
  label: string
  category: DevReturnCategory
  requiresDetail: boolean
  isActive: boolean
  usage: number
}

/** Motivos de devolução na ordem do catálogo (P20). */
export async function listDevReturnReasons(viewer: Viewer): Promise<DevReturnReasonItem[]> {
  const rows = await db.devReturnReason.findMany({
    where: { organizationId: viewer.organizationId },
    orderBy: [{ order: "asc" }, { label: "asc" }],
    select: { id: true, label: true, category: true, requiresDetail: true, isActive: true },
  })
  const usage = await catalogUsage("devReturnReason", rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, usage: usage.get(r.id) ?? 0 }))
}
