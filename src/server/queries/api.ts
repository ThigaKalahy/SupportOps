import type { AgreementOrigin, AgreementPriority, AgreementStatus, Prisma } from "@prisma/client"

import { toBusinessDateKey } from "../../lib/dates.ts"
import { labels } from "../../lib/labels.ts"
import { MODULES } from "../../lib/modules.ts"
import { db } from "../db.ts"
import { hasModule, teamScope, type TeamContext } from "../scope.ts"

/**
 * C22 — leituras da API de combinados (exceção à D8). Só o time do contexto (o da chave),
 * com `select` explícito e um formato estável para integração: datas de negócio em
 * "AAAA-MM-DD" (formato técnico de API de terceiro — CLAUDE.md permite), instantes em ISO.
 * Nada de registro gerencial: só o combinado, a pessoa (nome e e-mail) e a central.
 */

export interface ApiAgreement {
  id: string
  title: string
  description: string | null
  status: AgreementStatus
  priority: AgreementPriority
  origin: AgreementOrigin
  member: { id: string; name: string; email: string | null }
  central: { id: string; name: string } | null
  dueDate: string
  originalDueDate: string
  completedAt: string | null
  outcome: string | null
  createdAt: string
  updatedAt: string
}

const agreementSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  origin: true,
  dueDate: true,
  originalDueDate: true,
  completedAt: true,
  outcome: true,
  createdAt: true,
  updatedAt: true,
  centralId: true,
  member: { select: { id: true, preferredName: true, email: true } },
  central: { select: { id: true, name: true } },
} satisfies Prisma.AgreementSelect

type Row = Prisma.AgreementGetPayload<{ select: typeof agreementSelect }>

function toApi(r: Row, centrals: boolean): ApiAgreement {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    origin: r.origin,
    member: { id: r.member.id, name: r.member.preferredName, email: r.member.email },
    central: centrals && r.central ? r.central : null,
    dueDate: toBusinessDateKey(r.dueDate),
    originalDueDate: toBusinessDateKey(r.originalDueDate),
    completedAt: r.completedAt ? toBusinessDateKey(r.completedAt) : null,
    outcome: r.outcome,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

export interface ApiAgreementQuery {
  status?: AgreementStatus[]
  memberId?: string
  updatedSince?: Date
  limit: number
  /** Id do último item da página anterior (paginação por cursor, ordem de criação). */
  cursor?: string
}

/** Lista paginada (mais antigos primeiro, estável para sincronizar). Excluídos não aparecem. */
export async function listAgreementsForApi(ctx: TeamContext, query: ApiAgreementQuery) {
  const rows = await db.agreement.findMany({
    where: {
      ...teamScope(ctx),
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.memberId ? { memberId: query.memberId } : {}),
      ...(query.updatedSince ? { updatedAt: { gte: query.updatedSince } } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: agreementSelect,
  })
  const centrals = hasModule(ctx, MODULES.CENTRALS)
  const page = rows.slice(0, query.limit).map((r) => toApi(r, centrals))
  return { data: page, nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null }
}

/** Um combinado do time, ou null (de outro time ou excluído: não existe). */
export async function getAgreementForApi(ctx: TeamContext, id: string): Promise<ApiAgreement | null> {
  const row = await db.agreement.findFirst({ where: { ...teamScope(ctx), id }, select: agreementSelect })
  return row ? toApi(row, hasModule(ctx, MODULES.CENTRALS)) : null
}

/** Pessoas do time, para escolher o responsável ao criar (ativas e em desligamento). */
export async function listMembersForApi(ctx: TeamContext) {
  const rows = await db.teamMember.findMany({
    where: { ...teamScope(ctx), status: { in: ["ACTIVE", "OFFBOARDING"] } },
    orderBy: { preferredName: "asc" },
    select: { id: true, preferredName: true, fullName: true, email: true, status: true },
  })
  return rows.map((m) => ({ id: m.id, name: m.preferredName, fullName: m.fullName, email: m.email, status: m.status }))
}

/** Centrais ativas do time (só com o módulo); sem o módulo, lista vazia. */
export async function listCentralsForApi(ctx: TeamContext) {
  if (!hasModule(ctx, MODULES.CENTRALS)) return []
  return db.central.findMany({ where: { ...teamScope(ctx), isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
}

export type MemberRef = { ok: true; memberId: string | undefined } | { ok: false; error: string }

/**
 * Identifica a pessoa pelo `memberId` OU pelo `memberEmail` (sem caixa e sem espaços), só no
 * time do contexto. Os dois juntos precisam apontar para a mesma pessoa. Nenhum dos dois:
 * `memberId` indefinido (quem chama decide se é obrigatório).
 */
export async function resolveMemberForApi(ctx: TeamContext, memberId: unknown, memberEmail: unknown): Promise<MemberRef> {
  const id = typeof memberId === "string" && memberId.trim() ? memberId.trim() : undefined
  const email = typeof memberEmail === "string" && memberEmail.trim() ? memberEmail.trim().toLowerCase() : undefined
  if (!email) return { ok: true, memberId: id }
  const found = await db.teamMember.findMany({
    where: { ...teamScope(ctx), email: { equals: email, mode: "insensitive" } },
    select: { id: true },
    take: 2,
  })
  if (found.length === 0) return { ok: false, error: labels.api.memberNotFound }
  if (found.length > 1) return { ok: false, error: labels.api.memberAmbiguous }
  if (id && id !== found[0]!.id) return { ok: false, error: labels.api.memberMismatch }
  return { ok: true, memberId: found[0]!.id }
}
