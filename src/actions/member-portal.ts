"use server"

import { labels } from "../lib/labels.ts"
import { createNextStep, createOwnAgreement, ensureOwnCentral, type OwnAgreementResult, type OwnCentralResult } from "../server/member-agreements.ts"
import { discardConductDaily, NotConductorError, openConductDaily, saveConductDaily, spinRouletteAsMember } from "../server/member-daily.ts"
import type { ScrumMasterDrawResult } from "../server/member-daily.ts"
import { deleteSelfReportCore, upsertSelfReportCore, type MemberWriteResult } from "../server/member-portal.ts"
import { MemberAccessError, requireMemberContext } from "../server/member-scope.ts"
import { getMyPortalState, type MyPortalState } from "../server/queries/member-portal.ts"

/**
 * Server Actions do PORTAL DO COLABORADOR (P26). Mesmas regras de import do portal (D38):
 * nada das actions, queries, escopo ou timeline do gestor. Cada action monta o contexto
 * do colaborador (`requireMemberContext`) e entrega ao núcleo — src/server/member-portal.ts
 * (relato) ou src/server/member-agreements.ts (criar o próprio combinado, C14) —, que confere
 * o travamento antes de escrever (D43). Só estas escrevem: relato, combinado novo, próximo
 * passo e central nova.
 */

type PortalResult = MemberWriteResult | OwnAgreementResult | OwnCentralResult | ScrumMasterDrawResult | { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }

async function asMember<R extends PortalResult>(
  write: (ctx: Awaited<ReturnType<typeof requireMemberContext>>) => Promise<R>,
): Promise<R | { ok: false; error: string }> {
  try {
    return await write(await requireMemberContext())
  } catch (error) {
    if (error instanceof MemberAccessError || error instanceof NotConductorError) return { ok: false, error: error.message }
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

/** C14: o colaborador cria o próprio combinado (origem MEMBER), fora do horário da daily. */
export async function createAgreement(input: unknown): Promise<OwnAgreementResult> {
  return asMember((ctx) => createOwnAgreement(ctx, input))
}

/** C16: próximo passo depois de um Feito — combinado novo dele, com as heranças do de origem. */
export async function createNextStepAgreement(input: unknown): Promise<OwnAgreementResult> {
  return asMember((ctx) => createNextStep(ctx, input))
}

/** C16: central pelo nome (a existente ou uma nova, sem duplicar). Formato do CentralCombobox. */
export async function ensureMemberCentral(input: unknown): Promise<OwnCentralResult> {
  return asMember((ctx) => ensureOwnCentral(ctx, input))
}

/** C19: o time gira a roleta do scrum master (módulo ligado, das 09h às 10h em dia útil). */
export async function spinRoulette(): Promise<ScrumMasterDrawResult> {
  return asMember((ctx) => spinRouletteAsMember(ctx))
}

/** C19: o scrum master de hoje abre a daily (trava o portal do time e captura os relatos). */
export async function openConductedDaily(): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return asMember((ctx) => openConductDaily(ctx))
}

/** C19: o scrum master salva a daily — desfechos, quem faltou e combinados de hoje (D46). */
export async function saveConductedDaily(input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  return asMember((ctx) => saveConductDaily(ctx, input))
}

/** C19: o scrum master descarta a daily que abriu (os relatos voltam a ficar abertos). */
export async function discardConductedDaily(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  return asMember((ctx) => discardConductDaily(ctx, input))
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
