"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { runAction } from "@/server/action-runner"
import { requireWriteContext } from "@/server/scope"
import { cancelVacationRecord, createVacationRecord } from "@/server/vacations"

/**
 * Férias (C4): requireWriteContext → núcleo em src/server/vacations.ts. Mexe na
 * daily, nos alertas e em /team: o shell inteiro revalida.
 */

const PATHS: (string | [string, "layout"])[] = [["/", "layout"]]

export async function createVacation(input: unknown): Promise<ActionResult> {
  return runAction("vacations", async () => createVacationRecord(await requireWriteContext(), input), PATHS)
}

export async function cancelVacation(input: unknown): Promise<ActionResult> {
  return runAction("vacations", async () => cancelVacationRecord(await requireWriteContext(), input), PATHS)
}
