"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { runAction } from "@/server/action-runner"
import { requireAdminContext } from "@/server/scope"
import { grantTeamAccessRecord, revokeTeamAccessRecord, setTeamModuleRecord } from "@/server/teams"

/**
 * Administração de times (P23, /settings/team): requireAdminContext →
 * núcleo em src/server/teams.ts (zod + transação + auditoria) → revalidate.
 * Mudar módulo muda a navegação de quem está no time: o shell inteiro revalida.
 */

const PATHS: (string | [string, "layout"])[] = [["/", "layout"]]

export async function setTeamModule(input: unknown): Promise<ActionResult> {
  return runAction("teams", async () => setTeamModuleRecord(await requireAdminContext(), input), PATHS)
}

export async function grantTeamAccess(input: unknown): Promise<ActionResult> {
  return runAction("teams", async () => grantTeamAccessRecord(await requireAdminContext(), input), PATHS)
}

export async function revokeTeamAccess(input: unknown): Promise<ActionResult> {
  return runAction("teams", async () => revokeTeamAccessRecord(await requireAdminContext(), input), PATHS)
}
