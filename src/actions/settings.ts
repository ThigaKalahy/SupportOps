"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireOwner } from "@/server/access"
import { runAction } from "@/server/action-runner"
import {
  deleteCatalogItemRecord,
  moveCatalogItemRecord,
  saveCatalogItemRecord,
  setCatalogItemActiveRecord,
} from "@/server/settings"

/**
 * Server Actions de /settings: requireOwner → núcleo em src/server/settings.ts
 * (zod + transação + auditoria) → revalidate. Os catálogos alimentam a daily
 * e a validação de prioridade, que também são revalidadas.
 */

const PATHS: (string | [string, "layout"])[] = [["/settings", "layout"], "/priority-validations", "/dailies/new"]

export async function saveCatalogItem(kind: string, input: unknown): Promise<ActionResult> {
  return runAction("settings", async () => saveCatalogItemRecord(await requireOwner(), kind, input), PATHS)
}

export async function moveCatalogItem(input: unknown): Promise<ActionResult> {
  return runAction("settings", async () => moveCatalogItemRecord(await requireOwner(), input), PATHS)
}

export async function setCatalogItemActive(input: unknown): Promise<ActionResult> {
  return runAction("settings", async () => setCatalogItemActiveRecord(await requireOwner(), input), PATHS)
}

export async function deleteCatalogItem(input: unknown): Promise<ActionResult> {
  return runAction("settings", async () => deleteCatalogItemRecord(await requireOwner(), input), PATHS)
}
