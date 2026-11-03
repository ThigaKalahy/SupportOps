import { z } from "zod"

import { labels } from "../labels.ts"

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

/** C22: chave da API de combinados — time, dono (MANAGER no time) e um nome para reconhecer. */
export const createApiKeySchema = z.object({
  teamId: id,
  userId: id,
  name: z.string().trim().min(2, labels.validation.tooShort).max(60, labels.validation.tooLong),
})

export const revokeApiKeySchema = z.object({ teamId: id, id })
