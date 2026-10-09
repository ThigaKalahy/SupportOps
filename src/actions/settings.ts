"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireWriteContext } from "@/server/scope"
import { runAction } from "@/server/action-runner"
import {
  deleteCatalogItemRecord,
  moveCatalogItemRecord,
  saveCatalogItemRecord,
  setCatalogItemActiveRecord,
  setThresholdRecord,
} from "@/server/settings"

/**
 * Server Actions de /settings: requireWriteContext → núcleo em src/server/settings.ts
 * (zod + transação + auditoria) → revalidate. Os catálogos alimentam a daily
 * e a validação de prioridade, que também são revalidadas.
 */

const PATHS: (string | [string, "layout"])[] = [
  ["/settings", "layout"],
  "/priority-validations",
  "/dev-returns",
  "/dailies/new",
  "/development",
  ["/team", "layout"],
]

export async function saveCatalogItem(kind: string, input: unknown): Promise<ActionResult> {
  return runAction("settings", async () => saveCatalogItemRecord(await requireWriteContext(), kind, input), PATHS)
}

export async function moveCatalogItem(input: unknown): Promise<ActionResult> {
  return runAction("settings", async () => moveCatalogItemRecord(await requireWriteContext(), input), PATHS)
}

export async function setCatalogItemActive(input: unknown): Promise<ActionResult> {
  return runAction("settings", async () => setCatalogItemActiveRecord(await requireWriteContext(), input), PATHS)
}

export async function deleteCatalogItem(input: unknown): Promise<ActionResult> {
  return runAction("settings", async () => deleteCatalogItemRecord(await requireWriteContext(), input), PATHS)
}

/** Limiar do motor de alertas: muda a home, os contadores, /team e o perfil. */
export async function setThreshold(input: unknown): Promise<ActionResult> {
  return runAction("settings", async () => setThresholdRecord(await requireWriteContext(), input), [
    ["/", "layout"],
    ["/settings", "layout"],
  ])
}
