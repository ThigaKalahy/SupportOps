import { defaultFor, ONE_ON_ONE_PREFIX, resolveThresholds, THRESHOLD_LIMITS, type AlertThresholds } from "../../lib/alert-thresholds.ts"
import { db } from "../db.ts"
import type { Viewer } from "../visibility.ts"

/** Limiares do motor de alertas da organização (o que não foi alterado fica no padrão). */
export async function getThresholds(viewer: Pick<Viewer, "organizationId">): Promise<AlertThresholds> {
  const rows = await db.alertThreshold.findMany({ where: { organizationId: viewer.organizationId }, select: { key: true, value: true } })
  return resolveThresholds(rows)
}

export interface ThresholdSetting {
  key: string
  value: number
  defaultValue: number
  /** Alterado em relação ao padrão. */
  custom: boolean
  min: number
  max: number
  /** Senioridade, nas chaves de cadência de 1:1. */
  seniority?: { key: string; label: string }
}

/** Linhas do /settings: os escalares e uma cadência de 1:1 por senioridade (da mais baixa para a mais alta). */
export async function listThresholdSettings(viewer: Viewer): Promise<ThresholdSetting[]> {
  const [rows, seniorities] = await Promise.all([
    db.alertThreshold.findMany({ where: { organizationId: viewer.organizationId }, select: { key: true, value: true } }),
    db.seniority.findMany({ where: { organizationId: viewer.organizationId }, orderBy: { order: "asc" }, select: { key: true, label: true } }),
  ])
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  const setting = (key: string, limits: { min: number; max: number }, seniority?: ThresholdSetting["seniority"]): ThresholdSetting => {
    const defaultValue = defaultFor(key)
    const value = stored.get(key) ?? defaultValue
    return { key, value, defaultValue, custom: stored.has(key), ...limits, ...(seniority ? { seniority } : {}) }
  }
  return [
    ...seniorities.map((s) => setting(`${ONE_ON_ONE_PREFIX}${s.key}`, { min: 7, max: 120 }, s)),
    ...Object.entries(THRESHOLD_LIMITS).map(([key, limits]) => setting(key, limits)),
  ]
}
