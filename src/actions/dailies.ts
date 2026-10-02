"use server"

import { requireOwner } from "@/server/access"
import type { ActionResult } from "@/lib/validators/fields"
import { memberIdOf, runAction } from "@/server/action-runner"
import { createDailyRecord, updateDailyRecord, type DailyResult } from "@/server/dailies"

/**
 * Server Action da daily: requireOwner → núcleo em src/server/dailies.ts
 * (zod + uma transação com daily, participantes, checkins, combinados,
 * timeline e auditoria) → revalidate.
 */
export async function createDaily(input: unknown): Promise<DailyResult> {
  return runAction("dailies", async () => createDailyRecord(await requireOwner(), input), [
    "/dailies",
    "/agreements",
    ["/team", "layout"],
  ])
}

/** Edição de daily salva: resumo, decisões, presença e notas. */
export async function updateDaily(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("dailies", async () => updateDailyRecord(await requireOwner(), input), [
    "/dailies",
    `/dailies/${id}`,
    ["/team", "layout"],
  ])
}
