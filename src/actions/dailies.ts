"use server"

import { requireOwner } from "@/server/access"
import { runAction } from "@/server/action-runner"
import { createDailyRecord, type DailyResult } from "@/server/dailies"

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
