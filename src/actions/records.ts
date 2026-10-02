"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireOwner } from "@/server/access"
import { memberIdOf, runAction } from "@/server/action-runner"
import { createFeedbackRecord, createNoteRecord, createOneOnOneRecord, setRecordVisibilityRecord } from "@/server/records"

/**
 * Server Actions de 1:1, feedback e anotação: requireOwner → núcleo em
 * src/server/records.ts (zod + transação + timeline + auditoria) → revalidate.
 */

function paths(input: unknown): (string | [string, "layout"])[] {
  return ["/team", [`/team/${memberIdOf(input)}`, "layout"]]
}

export async function createOneOnOne(input: unknown): Promise<ActionResult> {
  return runAction("records", async () => createOneOnOneRecord(await requireOwner(), input), paths(input))
}

export async function createFeedback(input: unknown): Promise<ActionResult> {
  return runAction("records", async () => createFeedbackRecord(await requireOwner(), input), paths(input))
}

export async function createNote(input: unknown): Promise<ActionResult> {
  return runAction("records", async () => createNoteRecord(await requireOwner(), input), paths(input))
}

/** Alterna privado/compartilhado a partir da timeline. `memberId` só serve para revalidar o perfil. */
export async function setRecordVisibility(input: unknown, memberId: string): Promise<ActionResult> {
  return runAction("records", async () => setRecordVisibilityRecord(await requireOwner(), input), [
    "/team",
    [`/team/${memberId}`, "layout"],
  ])
}
