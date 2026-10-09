import { WATCH_HEATS, WATCH_ORIGINS, type WatchHeat, type WatchOrigin } from "./watch.ts"

/**
 * Estado de /watch na URL:
 *   ?tab=active|unreviewed|resolved|archived|all&heat=HIGH&member=<id>&central=<id>|none&origin=DAILY&open=<id>&new=1
 * Sem `tab` = Ativas.
 */

export const WATCH_TABS = ["active", "unreviewed", "resolved", "archived", "all"] as const
export type WatchTab = (typeof WATCH_TABS)[number]

export const WATCH_PARAMS = {
  tab: "tab",
  heat: "heat",
  member: "member",
  central: "central",
  origin: "origin",
  open: "open",
  new: "new",
} as const

export interface WatchFilters {
  tab: WatchTab
  heat: WatchHeat | null
  memberId: string | null
  /** id, "none" (sem central) ou null. */
  central: string | null
  origin: WatchOrigin | null
}

type Params = Record<string, string | string[] | undefined>

function one(params: Params, key: string): string | null {
  const value = params[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : null
}

export function parseWatchFilters(params: Params): WatchFilters {
  return {
    tab: oneOf(WATCH_TABS, one(params, WATCH_PARAMS.tab)) ?? "active",
    heat: oneOf(WATCH_HEATS, one(params, WATCH_PARAMS.heat)),
    memberId: one(params, WATCH_PARAMS.member),
    central: one(params, WATCH_PARAMS.central),
    origin: oneOf(WATCH_ORIGINS, one(params, WATCH_PARAMS.origin)),
  }
}

export function hasWatchFilters(filters: WatchFilters): boolean {
  return Boolean(filters.heat || filters.memberId || filters.central || filters.origin)
}
