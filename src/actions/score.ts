"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireWriteContext } from "@/server/scope"
import { runAction } from "@/server/action-runner"
import {
  createScoreDefinitionRecord,
  deleteScoreDefinitionRecord,
  newScoreVersionRecord,
  removeScoreComponentRecord,
  setScoreActiveRecord,
  setScoreComponentRecord,
  updateScoreNotesRecord,
} from "@/server/score-definitions"

/**
 * Server Actions de /settings/score: requireWriteContext → núcleo em
 * src/server/score-definitions.ts (zod + transação + auditoria). Só cadastro;
 * nenhuma action calcula score (D5).
 */

const PATHS: (string | [string, "layout"])[] = [["/settings/score", "layout"]]

export async function createScoreDefinition(input: unknown): Promise<ActionResult | { ok: true; id: string }> {
  return runAction("score", async () => createScoreDefinitionRecord(await requireWriteContext(), input), PATHS)
}

export async function newScoreVersion(input: unknown): Promise<ActionResult | { ok: true; id: string }> {
  return runAction("score", async () => newScoreVersionRecord(await requireWriteContext(), input), PATHS)
}

export async function updateScoreNotes(input: unknown): Promise<ActionResult> {
  return runAction("score", async () => updateScoreNotesRecord(await requireWriteContext(), input), PATHS)
}

export async function setScoreComponent(input: unknown): Promise<ActionResult> {
  return runAction("score", async () => setScoreComponentRecord(await requireWriteContext(), input), PATHS)
}

export async function removeScoreComponent(input: unknown): Promise<ActionResult> {
  return runAction("score", async () => removeScoreComponentRecord(await requireWriteContext(), input), PATHS)
}

export async function setScoreActive(input: unknown): Promise<ActionResult> {
  return runAction("score", async () => setScoreActiveRecord(await requireWriteContext(), input), PATHS)
}

export async function deleteScoreDefinition(input: unknown): Promise<ActionResult> {
  return runAction("score", async () => deleteScoreDefinitionRecord(await requireWriteContext(), input), PATHS)
}
