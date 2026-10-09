import { z } from "zod"

import { MODULE_KEYS } from "../modules.ts"

/** Administração de times (P23, /settings/team). Ids vêm da tela; o servidor confere a organização. */

const id = z.string().trim().min(1).max(40)

export const setTeamModuleSchema = z.object({
  teamId: id,
  moduleKey: z.enum(MODULE_KEYS as [string, ...string[]]),
  enabled: z.boolean(),
})

export const grantTeamAccessSchema = z.object({
  teamId: id,
  userId: id,
  level: z.enum(["MANAGER", "VIEWER"]),
})

export const revokeTeamAccessSchema = z.object({
  teamId: id,
  userId: id,
})
