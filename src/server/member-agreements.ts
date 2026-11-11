import { Prisma } from "@prisma/client"

import { CENTRAL_NAME_MAX, centralSlug, cleanCentralName } from "../lib/centrals.ts"
import { parseDisplayDate, todayBusinessDate } from "../lib/dates.ts"
import { fill, labels } from "../lib/labels.ts"
import { onlyManagerSeats, withManagerSeats } from "../lib/manager-seats.ts"
import { nextStepSchema, ownAgreementSchema, ownCentralSchema, transferOwnSchema } from "../lib/validators/member-portal.ts"

import { db } from "./db.ts"
import { getDailyLock, memberAudit, memberOwnScope, type MemberContext } from "./member-scope.ts"
import { moveAgreementEvents, recordTimelineEvents, timelineEventFor } from "./timeline.ts"

/**
 * C14/C16 — o colaborador CRIA os próprios combinados (decisão do usuário em 20/10/2026,
 * revisa a D42): o combinado novo, o "próximo passo" depois de um Feito e a central do
 * cliente, quando ainda não existe. É a ÚNICA ponte do portal para fora do namespace dele.
 *
 * - Escreve: o combinado da própria pessoa (origem MEMBER, prazo original = prazo — D17), a
 *   linha da timeline pelo único escritor dela (src/server/timeline.ts), e a central nova.
 * - Lê SÓ: o próprio combinado (time E pessoa), as centrais do time e se o módulo de centrais
 *   está ligado. Nada gerencial (D40) — por isso o próximo passo herda a observação ligada ao
 *   combinado, mas não escreve revisão nela.
 * - Combinado só fora do horário da daily: travamento conferido dentro da transação (D43).
 *
 * C24 (decisão do usuário em 11/11/2026, revisa a D42 — "depois de criado, só relata"): o
 * colaborador PASSA o próprio combinado aberto para outra pessoa do time, com o motivo. É o
 * mesmo registro da troca do gestor (AgreementTransfer, linhas AGREEMENT_TRANSFER, linha
 * AGREEMENT acompanhando o dono, auditoria). Para escolher, lê o nome e o id das pessoas
 * ativas do time — nada além disso (`getTransferTargets`). O relato pendente dele naquele
 * combinado sai junto (o combinado deixa de ser dele).
 */

export type OwnAgreementResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }
export type OwnTransferResult = { ok: true; name: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }
export type OwnCentralResult = { ok: true; id: string; name: string; existed: boolean } | { ok: false; error: string }

class PortalLockedError extends Error {}

const M = labels.memberPortal

function errorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {}
  for (const issue of issues) fieldErrors[issue.path.map(String).join(".")] ??= issue.message
  return { ok: false as const, error: labels.validation.generic, fieldErrors }
}

/** Centrais ligadas no time (D32)? Sem o módulo, o campo não existe nem no servidor. */
async function centralsOn(teamId: string): Promise<boolean> {
  return (await db.teamModule.count({ where: { teamId, moduleKey: "CENTRALS", isEnabled: true } })) > 0
}

/** Central escolhida: precisa ser ativa e do time. Vazia = sem central. */
async function checkCentral(ctx: MemberContext, centralId: string): Promise<string | null | undefined> {
  if (!centralId) return null
  if (!(await centralsOn(ctx.teamId))) return undefined
  const central = await db.central.findFirst({ where: { teamId: ctx.teamId, id: centralId, isActive: true, deletedAt: null }, select: { id: true } })
  return central ? central.id : undefined
}

/** Grava o combinado e a linha da timeline, só com o portal destravado. */
async function createWhileUnlocked(
  ctx: MemberContext,
  data: { title: string; due: Date; centralId: string | null; watchItemId?: string | null; priority?: "LOW" | "NORMAL" | "HIGH"; description?: string | null },
  audit: { action: string; after: Record<string, string | null> },
): Promise<OwnAgreementResult> {
  try {
    return await db.$transaction(async (tx) => {
      if ((await getDailyLock(ctx.teamId, tx)).locked) throw new PortalLockedError()
      const created = await tx.agreement.create({
        data: {
          teamId: ctx.teamId,
          memberId: ctx.memberId,
          title: data.title,
          description: data.description ?? null,
          origin: "MEMBER",
          priority: data.priority ?? "NORMAL",
          centralId: data.centralId,
          watchItemId: data.watchItemId ?? null,
          originalDueDate: data.due,
          dueDate: data.due,
          authorUserId: ctx.userId,
        },
      })
      await recordTimelineEvents(tx, { teamId: ctx.teamId }, [timelineEventFor.agreementCreated(created)])
      await memberAudit(ctx, { action: audit.action, entity: "Agreement", entityId: created.id, after: { title: created.title, ...audit.after } }, tx)
      return { ok: true, id: created.id }
    })
  } catch (error) {
    if (error instanceof PortalLockedError) return { ok: false, error: M.locked.refused }
    throw error
  }
}

/** Combinado novo da própria pessoa. Prazo vazio = hoje (D28). */
export async function createOwnAgreement(ctx: MemberContext, input: unknown): Promise<OwnAgreementResult> {
  const parsed = ownAgreementSchema.safeParse(input)
  if (!parsed.success) return errorsOf(parsed.error.issues)
  const centralId = await checkCentral(ctx, parsed.data.centralId)
  if (centralId === undefined) return { ok: false, error: labels.validation.generic, fieldErrors: { centralId: labels.validation.generic } }
  const due = parsed.data.dueDate ? parseDisplayDate(parsed.data.dueDate)! : todayBusinessDate()
  return createWhileUnlocked(ctx, { title: parsed.data.title, due, centralId }, {
    action: "member.agreement.create",
    after: { dueDate: parsed.data.dueDate || "hoje", centralId },
  })
}

/**
 * Próximo passo depois de um Feito: combinado novo da própria pessoa que herda do combinado
 * de origem a central (trocável), a prioridade e a observação ligada a ele.
 */
export async function createNextStep(ctx: MemberContext, input: unknown): Promise<OwnAgreementResult> {
  const parsed = nextStepSchema.safeParse(input)
  if (!parsed.success) return errorsOf(parsed.error.issues)
  const origin = await db.agreement.findFirst({
    where: { ...memberOwnScope(ctx), id: parsed.data.agreementId, deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } },
    select: { id: true, centralId: true, watchItemId: true, priority: true },
  })
  if (!origin) return { ok: false, error: M.validation.notOpen }
  const chosen = parsed.data.centralId ? await checkCentral(ctx, parsed.data.centralId) : origin.centralId
  if (chosen === undefined) return { ok: false, error: labels.validation.generic, fieldErrors: { centralId: labels.validation.generic } }
  const due = parsed.data.dueDate ? parseDisplayDate(parsed.data.dueDate)! : todayBusinessDate()
  return createWhileUnlocked(
    ctx,
    { title: parsed.data.title, due, centralId: chosen, watchItemId: origin.watchItemId, priority: origin.priority },
    { action: "member.agreement.nextStep", after: { fromAgreementId: origin.id, dueDate: parsed.data.dueDate || "hoje", centralId: chosen } },
  )
}

/**
 * Central pelo nome digitado (D20): a existente pelo nome normalizado, ou uma nova. Nunca
 * duplica — "Central Alfa" e "central alfa" são a mesma. Desativada não volta por aqui.
 */
export async function ensureOwnCentral(ctx: MemberContext, input: unknown): Promise<OwnCentralResult> {
  const parsed = ownCentralSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  if (!(await centralsOn(ctx.teamId))) return { ok: false, error: labels.validation.generic }
  const name = cleanCentralName(parsed.data.name)
  const slug = centralSlug(name)
  if (!slug) return { ok: false, error: labels.settings.validation.labelRequired }
  if (name.length > CENTRAL_NAME_MAX) return { ok: false, error: labels.validation.tooLong }

  const existing = await db.central.findUnique({ where: { teamId_slug: { teamId: ctx.teamId, slug } }, select: { id: true, name: true, isActive: true } })
  if (existing) {
    if (!existing.isActive) return { ok: false, error: fill(labels.centrals.inactive, { name: existing.name }) }
    return { ok: true, id: existing.id, name: existing.name, existed: true }
  }
  try {
    const created = await db.$transaction(async (tx) => {
      const central = await tx.central.create({ data: { teamId: ctx.teamId, organizationId: ctx.organizationId, name, slug }, select: { id: true, name: true } })
      await memberAudit(ctx, { action: "member.central.create", entity: "Central", entityId: central.id, after: { name, slug } }, tx)
      return central
    })
    return { ok: true, id: created.id, name: created.name, existed: false }
  } catch (error) {
    // Outra pessoa criou a mesma central no meio do caminho: usa a que ficou.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await db.central.findUnique({ where: { teamId_slug: { teamId: ctx.teamId, slug } }, select: { id: true, name: true } })
      if (winner) return { ok: true, id: winner.id, name: winner.name, existed: true }
    }
    throw error
  }
}

/** C24: quem pode receber um combinado dele — pessoas do time não desligadas, sem ele. Só id e nome. */
export async function getTransferTargets(ctx: MemberContext): Promise<{ id: string; name: string }[]> {
  const [rows, managers] = await Promise.all([
    db.teamMember.findMany({
      where: { teamId: ctx.teamId, id: { not: ctx.memberId }, status: { not: "INACTIVE" } },
      orderBy: { preferredName: "asc" },
      select: { id: true, preferredName: true },
    }),
    // C25: os gestores do time também recebem (lugar de gestor), marcados como gestor.
    db.teamMember.findMany({
      where: { teamId: ctx.teamId, ...onlyManagerSeats, status: "ACTIVE" },
      orderBy: { preferredName: "asc" },
      select: { id: true, preferredName: true },
    }),
  ])
  return [
    ...rows.map((m) => ({ id: m.id, name: m.preferredName })),
    ...managers.map((m) => ({ id: m.id, name: `${m.preferredName} (${labels.managerSeats.tag})` })),
  ]
}

/**
 * C24: passa o próprio combinado aberto para outra pessoa do time, com o motivo. Prazos e
 * cliente não mudam (D17). Fora do horário da daily, como toda escrita do portal (D43).
 */
export async function transferOwnAgreement(ctx: MemberContext, input: unknown): Promise<OwnTransferResult> {
  const parsed = transferOwnSchema.safeParse(input)
  if (!parsed.success) return errorsOf(parsed.error.issues)
  const { agreementId, memberId, reason } = parsed.data
  const T = labels.agreements.transferErrors
  if (memberId === ctx.memberId) return { ok: false, error: T.sameMember, fieldErrors: { memberId: T.sameMember } }
  const [own, me, to] = await Promise.all([
    db.agreement.findFirst({
      where: { ...memberOwnScope(ctx), id: agreementId, deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { id: true, title: true },
    }),
    db.teamMember.findFirst({ where: { teamId: ctx.teamId, id: ctx.memberId }, select: { id: true, preferredName: true } }),
    db.teamMember.findFirst({ where: { teamId: ctx.teamId, ...withManagerSeats, id: memberId, status: { not: "INACTIVE" } }, select: { id: true, preferredName: true } }),
  ])
  if (!own || !me) return { ok: false, error: M.validation.notOpen }
  if (!to) return { ok: false, error: T.memberUnavailable, fieldErrors: { memberId: T.memberUnavailable } }
  try {
    await db.$transaction(async (tx) => {
      if ((await getDailyLock(ctx.teamId, tx)).locked) throw new PortalLockedError()
      const moved = await tx.agreement.updateMany({
        where: { ...memberOwnScope(ctx), id: own.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
        data: { memberId: to.id },
      })
      if (moved.count !== 1) throw new Error("Combinado alterado durante a troca")
      const transfer = await tx.agreementTransfer.create({
        data: { teamId: ctx.teamId, agreementId: own.id, fromMemberId: ctx.memberId, toMemberId: to.id, reason, authorUserId: ctx.userId },
      })
      // O relato pendente era dele; o combinado agora é de outra pessoa.
      await tx.agreementSelfReport.deleteMany({ where: { teamId: ctx.teamId, agreementId: own.id, memberId: ctx.memberId, dailyId: null } })
      await moveAgreementEvents(tx, { teamId: ctx.teamId }, own.id, to.id)
      await recordTimelineEvents(
        tx,
        { teamId: ctx.teamId },
        timelineEventFor.agreementTransfer({ agreementId: own.id, title: own.title, from: me, to, reason, at: transfer.transferredAt, authorUserId: ctx.userId }),
      )
      await memberAudit(
        ctx,
        { action: "member.agreement.transfer", entity: "Agreement", entityId: own.id, before: { memberId: ctx.memberId }, after: { memberId: to.id, reason } },
        tx,
      )
    })
  } catch (error) {
    if (error instanceof PortalLockedError) return { ok: false, error: M.locked.refused }
    throw error
  }
  return { ok: true, name: to.preferredName }
}
