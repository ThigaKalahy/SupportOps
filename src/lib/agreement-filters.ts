import type { AgreementOrigin, AgreementPriority } from "@prisma/client"

import { AGREEMENT_ORIGINS, AGREEMENT_PRIORITIES } from "./validators/agreement.ts"

/**
 * Estado da central de combinados na URL:
 * ?view=overdue|due-soon|open|done|all&member=<id>&seniority=PLENO&origin=DAILY&priority=HIGH&created=30d&central=<id>|none
 * Sem `view` = Em aberto.
 */

export const AGREEMENT_VIEWS = ["overdue", "due-soon", "open", "done", "all"] as const
export type AgreementView = (typeof AGREEMENT_VIEWS)[number]

export const CREATED_PERIODS = ["30d", "3m", "6m", "all"] as const
export type CreatedPeriod = (typeof CREATED_PERIODS)[number]

/** Janela da aba "Vencendo". */
export const DUE_SOON_DAYS = 7

export interface AgreementFilters {
  view: AgreementView
  memberId: string | null
  seniority: string | null
  origin: AgreementOrigin | null
  priority: AgreementPriority | null
  created: CreatedPeriod
  /** Central (P19): id, "none" (sem central informada) ou null. */
  central: string | null
}

export const AGREEMENT_PARAMS = {
  view: "view",
  member: "member",
  seniority: "seniority",
  origin: "origin",
  priority: "priority",
  created: "created",
  central: "central",
} as const

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams

function read(params: RawParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

function oneOf<T extends string>(values: readonly T[], value: string | undefined): T | null {
  return value !== undefined && (values as readonly string[]).includes(value) ? (value as T) : null
}

export function parseAgreementFilters(params: RawParams): AgreementFilters {
  const member = read(params, AGREEMENT_PARAMS.member)
  const seniority = read(params, AGREEMENT_PARAMS.seniority)
  const central = read(params, AGREEMENT_PARAMS.central)
  return {
    view: oneOf(AGREEMENT_VIEWS, read(params, AGREEMENT_PARAMS.view)) ?? "open",
    memberId: member && /^[\w-]{1,64}$/.test(member) ? member : null,
    seniority: seniority && /^[A-Z_]{1,32}$/.test(seniority) ? seniority : null,
    origin: oneOf(AGREEMENT_ORIGINS, read(params, AGREEMENT_PARAMS.origin)),
    priority: oneOf(AGREEMENT_PRIORITIES, read(params, AGREEMENT_PARAMS.priority)),
    created: oneOf(CREATED_PERIODS, read(params, AGREEMENT_PARAMS.created)) ?? "all",
    central: central && /^[\w-]{1,64}$/.test(central) ? central : null,
  }
}

/** Há filtro além da aba? (para o estado vazio orientar a limpar). */
export function hasAgreementFilters(filters: AgreementFilters): boolean {
  return Boolean(filters.memberId || filters.seniority || filters.origin || filters.priority || filters.created !== "all" || filters.central)
}

/** Início do período de criação como instante (null = qualquer data). */
export function createdSince(period: CreatedPeriod, now: Date = new Date()): Date | null {
  if (period === "all") return null
  const start = new Date(now)
  if (period === "30d") start.setUTCDate(start.getUTCDate() - 30)
  if (period === "3m") start.setUTCMonth(start.getUTCMonth() - 3)
  if (period === "6m") start.setUTCMonth(start.getUTCMonth() - 6)
  return start
}
