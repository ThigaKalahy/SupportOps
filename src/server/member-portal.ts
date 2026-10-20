import { parseDisplayDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { idSchema, MAX_PENDING_PROPOSALS, proposalSchema, selfReportSchema } from "../lib/validators/member-portal.ts"

import { db } from "./db.ts"
import { getDailyLock, memberAudit, memberOwnScope, type MemberContext } from "./member-scope.ts"

/**
 * ESCRITA DO COLABORADOR (P26) — núcleo das quatro actions de src/actions/member-portal.ts,
 * sob as mesmas regras de import do portal (D38): só o banco, o contexto do colaborador e
 * src/lib. Recebe o `MemberContext` pronto; nunca o obtém sozinho.
 *
 * - Toda escrita confere o travamento DENTRO da transação, antes de escrever, e recusa
 *   com erro explícito enquanto a daily do time está aberta (D41, D43).
 * - O colaborador só relata os PRÓPRIOS combinados abertos e propõe combinados novos.
 *   Nunca muda prazo, status, título ou responsável de combinado existente.
 * - Relato pendente = `dailyId` nulo; um por combinado (índice único parcial).
 * - Toda escrita é auditada.
 */

export type MemberWriteResult = { ok: true; id?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }

const M = labels.memberPortal
const OPEN = ["OPEN", "IN_PROGRESS"] as const

class PortalLockedError extends Error {}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/** Transação que só segue com o portal destravado (conferido dentro dela). */
async function whileUnlocked(ctx: MemberContext, write: (tx: Tx) => Promise<MemberWriteResult>): Promise<MemberWriteResult> {
  try {
    return await db.$transaction(async (tx) => {
      if ((await getDailyLock(ctx.teamId, tx)).locked) throw new PortalLockedError()
      return write(tx)
    })
  } catch (error) {
    if (error instanceof PortalLockedError) return { ok: false, error: M.locked.refused }
    throw error
  }
}

function errorsOf(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path.map(String).join(".")
    if (key && !(key in out)) out[key] = issue.message
  }
  return out
}

const dateOrNull = (value: string) => (value ? parseDisplayDate(value) : null)

/** Relata (ou corrige o relato de) um combinado próprio em aberto. */
export async function upsertSelfReportCore(ctx: MemberContext, input: unknown): Promise<MemberWriteResult> {
  const parsed = selfReportSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: errorsOf(parsed.error.issues) }
  const data = parsed.data
  const agreement = await db.agreement.findFirst({
    where: { ...memberOwnScope(ctx), id: data.agreementId, deletedAt: null, status: { in: [...OPEN] } },
    select: { id: true },
  })
  if (!agreement) return { ok: false, error: M.validation.notOpen }
  const done = data.outcome === "DONE"
  const reasonId = !done && data.blockerReasonId ? data.blockerReasonId : null
  if (reasonId) {
    const reason = await db.blockerReason.findFirst({ where: { teamId: ctx.teamId, id: reasonId, isActive: true }, select: { id: true } })
    if (!reason) return { ok: false, error: M.validation.notFound }
  }
  const values = {
    outcome: data.outcome,
    blockerText: done ? null : data.blockerText,
    blockerReasonId: reasonId,
    suggestedDueDate: done ? null : dateOrNull(data.suggestedDueDate),
  }
  return whileUnlocked(ctx, async (tx) => {
    const before = await tx.agreementSelfReport.findFirst({
      where: { ...memberOwnScope(ctx), agreementId: agreement.id, dailyId: null },
      select: { id: true, outcome: true, blockerText: true, blockerReasonId: true, suggestedDueDate: true },
    })
    const saved = before
      ? await tx.agreementSelfReport.update({ where: { id: before.id, teamId: ctx.teamId }, data: values, select: { id: true } })
      : await tx.agreementSelfReport.create({ data: { ...memberOwnScope(ctx), agreementId: agreement.id, ...values }, select: { id: true } })
    await memberAudit(
      ctx,
      {
        action: before ? "member.selfReport.update" : "member.selfReport.create",
        entity: "AgreementSelfReport",
        entityId: saved.id,
        before: before ? { ...before, suggestedDueDate: before.suggestedDueDate?.toISOString() ?? null } : null,
        after: { agreementId: agreement.id, ...values, suggestedDueDate: values.suggestedDueDate?.toISOString() ?? null },
      },
      tx,
    )
    return { ok: true }
  })
}

/** Desfaz o relato pendente — antes de a daily capturá-lo. */
export async function deleteSelfReportCore(ctx: MemberContext, agreementId: unknown): Promise<MemberWriteResult> {
  const parsed = idSchema.safeParse(agreementId)
  if (!parsed.success) return { ok: false, error: M.validation.notFound }
  return whileUnlocked(ctx, async (tx) => {
    const report = await tx.agreementSelfReport.findFirst({
      where: { ...memberOwnScope(ctx), agreementId: parsed.data, dailyId: null },
      select: { id: true, outcome: true },
    })
    if (!report) return { ok: false, error: M.validation.notFound }
    await tx.agreementSelfReport.delete({ where: { id: report.id, teamId: ctx.teamId } })
    await memberAudit(ctx, { action: "member.selfReport.delete", entity: "AgreementSelfReport", entityId: report.id, before: { agreementId: parsed.data, outcome: report.outcome } }, tx)
    return { ok: true }
  })
}

/** Propõe um combinado (só vira combinado no aceite do gestor — D42). Sempre dela, sem prioridade. */
export async function createProposalCore(ctx: MemberContext, input: unknown): Promise<MemberWriteResult> {
  const parsed = proposalSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: errorsOf(parsed.error.issues) }
  const data = parsed.data
  return whileUnlocked(ctx, async (tx) => {
    const pending = await tx.memberProposal.count({ where: { ...memberOwnScope(ctx), status: "PENDING" } })
    if (pending >= MAX_PENDING_PROPOSALS) return { ok: false, error: M.validation.tooManyProposals }
    const created = await tx.memberProposal.create({
      data: { ...memberOwnScope(ctx), title: data.title, suggestedDueDate: dateOrNull(data.suggestedDueDate), note: data.note || null, status: "PENDING" },
      select: { id: true },
    })
    await memberAudit(ctx, { action: "member.proposal.create", entity: "MemberProposal", entityId: created.id, after: { title: data.title, suggestedDueDate: data.suggestedDueDate || null } }, tx)
    return { ok: true, id: created.id }
  })
}

/** Retira a própria proposta: só PENDING, só antes de alguma daily capturá-la, só destravado. */
export async function deleteProposalCore(ctx: MemberContext, id: unknown): Promise<MemberWriteResult> {
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: M.validation.notFound }
  return whileUnlocked(ctx, async (tx) => {
    const proposal = await tx.memberProposal.findFirst({
      where: { ...memberOwnScope(ctx), id: parsed.data, status: "PENDING", dailyId: null },
      select: { id: true, title: true },
    })
    if (!proposal) return { ok: false, error: M.validation.notFound }
    await tx.memberProposal.delete({ where: { id: proposal.id, teamId: ctx.teamId } })
    await memberAudit(ctx, { action: "member.proposal.delete", entity: "MemberProposal", entityId: proposal.id, before: { title: proposal.title } }, tx)
    return { ok: true }
  })
}
