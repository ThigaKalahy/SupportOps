"use server"

import { labels } from "../lib/labels.ts"
import {
  createProposalCore,
  deleteProposalCore,
  deleteSelfReportCore,
  upsertSelfReportCore,
  type MemberWriteResult,
} from "../server/member-portal.ts"
import { MemberAccessError, requireMemberContext } from "../server/member-scope.ts"
import { getMyPortalState, type MyPortalState } from "../server/queries/member-portal.ts"

/**
 * Server Actions do PORTAL DO COLABORADOR (P26). Mesmas regras de import do portal (D38):
 * nada das actions, queries, escopo ou timeline do gestor. Cada action monta o contexto
 * do colaborador (`requireMemberContext`) e entrega ao núcleo em src/server/member-portal.ts,
 * que confere o travamento antes de escrever (D43). Só estas quatro escrevem.
 */

async function asMember(write: (ctx: Awaited<ReturnType<typeof requireMemberContext>>) => Promise<MemberWriteResult>): Promise<MemberWriteResult> {
  try {
    return await write(await requireMemberContext())
  } catch (error) {
    if (error instanceof MemberAccessError) return { ok: false, error: error.message }
    console.error("[member-portal] falha ao salvar", error)
    return { ok: false, error: labels.memberPortal.report.failed }
  }
}

export async function upsertSelfReport(input: unknown): Promise<MemberWriteResult> {
  return asMember((ctx) => upsertSelfReportCore(ctx, input))
}

export async function deleteSelfReport(agreementId: unknown): Promise<MemberWriteResult> {
  return asMember((ctx) => deleteSelfReportCore(ctx, agreementId))
}

export async function createProposal(input: unknown): Promise<MemberWriteResult> {
  return asMember((ctx) => createProposalCore(ctx, input))
}

export async function deleteProposal(id: unknown): Promise<MemberWriteResult> {
  return asMember((ctx) => deleteProposalCore(ctx, id))
}

/** Leitura leve do estado do portal, consultada a cada 25 s com a aba visível. Sem contexto: null. */
export async function pollPortalState(): Promise<MyPortalState | null> {
  try {
    return await getMyPortalState(await requireMemberContext())
  } catch (error) {
    if (error instanceof MemberAccessError) return null
    throw error
  }
}
