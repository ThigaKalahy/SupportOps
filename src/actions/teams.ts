"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { runAction } from "@/server/action-runner"
import { requireAdminContext } from "@/server/scope"
import { createApiKeyRecord, revokeApiKeyRecord } from "@/server/api-keys"
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

/** C22: gera a chave da API de um time (a chave volta uma única vez, para a tela mostrar). */
export async function createApiKey(input: unknown) {
  return runAction("api-keys", async () => createApiKeyRecord(await requireAdminContext(), input), ["/settings/team"])
}

/** C22: revoga a chave (para de funcionar na hora; nada é apagado). */
export async function revokeApiKey(input: unknown): Promise<ActionResult> {
  return runAction("api-keys", async () => revokeApiKeyRecord(await requireAdminContext(), input), ["/settings/team"])
}
