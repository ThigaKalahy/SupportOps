import type { MetricDirection } from "@prisma/client"

import { db } from "../db.ts"
import { teamScope, type TeamContext } from "../scope.ts"

/**
 * Leituras de /settings/score: definições versionadas e seus componentes.
 * Cadastro e composição — nenhuma leitura de resultado de pessoa, nenhum
 * número de desempenho (D5). `results` só conta se a versão já tem
 * resultado calculado (no MVP, sempre 0), para travar a edição.
 */

export interface ScoreComponentView {
  metricDefinitionId: string
  key: string
  label: string
  unit: string | null
  direction: MetricDirection
  metricActive: boolean
  weight: number
  normalizationMin: number
  normalizationMax: number
}

export interface ScoreDefinitionView {
  id: string
  name: string
  version: number
  isActive: boolean
  notes: string | null
  createdAt: Date
  results: number
  components: ScoreComponentView[]
}

const include = {
  components: { include: { metricDefinition: true } },
  _count: { select: { results: true } },
} as const

type Row = Awaited<ReturnType<typeof db.scoreDefinition.findFirstOrThrow<{ include: typeof include }>>>

function toView(d: Row): ScoreDefinitionView {
  return {
    id: d.id,
    name: d.name,
    version: d.version,
    isActive: d.isActive,
    notes: d.notes,
    createdAt: d.createdAt,
    results: d._count.results,
    components: d.components
      .map((c) => ({
        metricDefinitionId: c.metricDefinitionId,
        key: c.metricDefinition.key,
        label: c.metricDefinition.label,
        unit: c.metricDefinition.unit,
        direction: c.metricDefinition.direction,
        metricActive: c.metricDefinition.isActive,
        weight: c.weight,
        normalizationMin: c.normalizationMin,
        normalizationMax: c.normalizationMax,
      }))
      .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label)),
  }
}

/** Todas as versões, por nome e da mais nova para a mais antiga. */
export async function listScoreDefinitions(ctx: TeamContext): Promise<ScoreDefinitionView[]> {
  const rows = await db.scoreDefinition.findMany({
    where: teamScope(ctx),
    orderBy: [{ name: "asc" }, { version: "desc" }],
    include,
  })
  return rows.map(toView)
}

export async function getScoreDefinition(ctx: TeamContext, id: string) {
  const row = await db.scoreDefinition.findFirst({ where: { ...teamScope(ctx), id }, include })
  if (!row) return null
  const [versions, metrics] = await Promise.all([
    db.scoreDefinition.findMany({
      where: { ...teamScope(ctx), name: row.name },
      orderBy: { version: "desc" },
      select: { id: true, version: true, isActive: true, createdAt: true },
    }),
    db.metricDefinition.findMany({
      where: { ...teamScope(ctx), isActive: true },
      orderBy: { label: "asc" },
      select: { id: true, key: true, label: true, unit: true, direction: true },
    }),
  ])
  return { definition: toView(row), versions, metrics }
}
