import type { AuditConversationStatus, AuditRunStatus, Prisma } from "@prisma/client"

import { criteriaFor } from "../../lib/audit/criteria.ts"
import {
  assessEvaluation,
  buildEvaluationRequest,
  estimateCostUsd,
  EVALUATION_JSON_SCHEMA,
  validateEvaluation,
  worstCaseCostUsd,
  type EvaluationSubject,
} from "../../lib/audit/evaluation.ts"
import { budgetAlertLevel, budgetFits, evaluationBlocker, startOfMonthSaoPaulo, type GuardInput } from "../../lib/audit/guard.ts"
import type { OpenAiErrorKind, OpenAiUsage } from "../../lib/audit/openai-response.ts"
import type { ParsedMeta } from "../../lib/audit/parser.ts"
import { labels } from "../../lib/labels.ts"
import { fieldErrorsOf, type ActionResult } from "../../lib/validators/fields.ts"
import { auditBatchRefSchema, queueAuditSchema } from "../../lib/validators/audit.ts"
import { auditOf, writeAudit } from "../audit.ts"
import { db } from "../db.ts"
import type { AuditContext } from "./access.ts"
import { getAuditConfig, type AuditConfigView } from "./config.ts"
import { callOpenAi, openAiKeyConfigured } from "./openai.ts"

/**
 * C23 Fase D — avaliação das conversas (documento do módulo, seções 6–8 e 13).
 *
 * Fila no BANCO, conduzida pela tela, sem serviço novo: "Avaliar" põe até `maxPerRun` conversas
 * em QUEUED; o navegador chama `runAuditStepRecord` repetidamente e cada chamada avalia UMA
 * conversa (uma chamada à OpenAI, com no máximo uma nova tentativa) — nada de chamadas em massa
 * dentro de uma requisição. Fechar a página não perde nada: o que está na fila continua lá
 * ("Continuar" ou "Parar"). Trava contra duplicidade: a conversa é PEGA com `updateMany`
 * condicional (só um passo consegue), e a pega vence em 5 minutos.
 *
 * Antes de cada conversa: as travas (`evaluationBlocker`), o orçamento no PIOR caso
 * (`budgetFits`), a concorrência e os limites por minuto. Erro de chave, de saldo ou de
 * configuração PARA a fila; erro passageiro tenta de novo com espera; resposta fora do schema
 * tem uma nova tentativa e nunca é gravada como concluída.
 *
 * Simulação: monta o pedido exato (com o mascaramento), estima tokens e custo e grava uma
 * execução SIMULATED — SEM nota. Nenhum número inventado vira avaliação.
 *
 * Logs e auditoria: só contagens, modelo, tokens, custo e o tipo do erro — nunca a transcrição.
 */

/** Pega vencida: depois disso, a conversa em PROCESSING pode ser pega de novo. */
const CLAIM_STALE_MS = 5 * 60_000
/**
 * Nova tentativa no MESMO passo só se a primeira falhou rápido (a função tem 60 s: 12 s + espera
 * + uma chamada de até 38 s). Senão a conversa volta para a fila e o próximo passo tenta.
 */
const STEP_RETRY_BUDGET_MS = 12_000
/** Uma conversa é pega no máximo isto de vezes antes de virar FALHA. */
const MAX_CLAIMS = 3

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

const num = (value: { toString(): string } | null | undefined) => (value == null ? 0 : Number(value.toString()))

/* ─────────────── Leitura: gasto e estado ─────────────── */

export interface AuditSpend {
  monthUsd: number
  monthlyBudgetUsd: number
  /** 0, 50, 80 ou 100 — alerta do orçamento interno. */
  alertLevel: 0 | 50 | 80 | 100
}

async function monthSpent(ctx: AuditContext): Promise<number> {
  const sum = await db.auditRun.aggregate({ where: { teamId: ctx.teamId, startedAt: { gte: startOfMonthSaoPaulo() } }, _sum: { costUsd: true } })
  return num(sum._sum.costUsd)
}

async function batchSpent(ctx: AuditContext, batchId: string): Promise<number> {
  const sum = await db.auditRun.aggregate({ where: { teamId: ctx.teamId, conversation: { batchId } }, _sum: { costUsd: true } })
  return num(sum._sum.costUsd)
}

export async function getAuditSpend(ctx: AuditContext, config?: AuditConfigView): Promise<AuditSpend> {
  const [cfg, monthUsd] = await Promise.all([config ? Promise.resolve(config) : getAuditConfig(ctx), monthSpent(ctx)])
  return { monthUsd, monthlyBudgetUsd: cfg.monthlyBudgetUsd, alertLevel: budgetAlertLevel(monthUsd, cfg.monthlyBudgetUsd) }
}

function guardOf(config: AuditConfigView, monthSpentUsd: number, batchSpentUsd: number): GuardInput {
  return {
    enabled: config.enabled,
    simulation: config.simulation,
    criteriaVersion: config.criteriaVersion,
    keyConfigured: openAiKeyConfigured(),
    inputPricePerMTok: config.inputPricePerMTok,
    outputPricePerMTok: config.outputPricePerMTok,
    monthlyBudgetUsd: config.monthlyBudgetUsd,
    batchBudgetUsd: config.batchBudgetUsd,
    monthSpentUsd,
    batchSpentUsd,
  }
}

/** Onde a conversa pode entrar na fila: lida (tem mensagens) e sem avaliação concluída. */
function eligibleWhere(ctx: AuditContext, batchId: string): Prisma.AuditConversationWhereInput {
  return {
    teamId: ctx.teamId,
    batchId,
    messageCount: { gt: 0 },
    status: { in: ["IMPORTED", "REVIEW_NEEDED", "FAILED"] },
    runs: { none: { status: "SUCCESS" } },
  }
}

export interface AuditRunState {
  simulation: boolean
  enabled: boolean
  model: string
  maxPerRun: number
  blocker: string | null
  eligible: number
  queued: number
  processing: number
  stopRequested: boolean
  monthSpentUsd: number
  monthlyBudgetUsd: number
  batchSpentUsd: number
  batchBudgetUsd: number
}

/** O que a tela do lote precisa para avaliar: modo, trava, quantas cabem e o gasto. */
export async function getAuditRunState(ctx: AuditContext, batchId: string): Promise<AuditRunState | null> {
  const batch = await db.auditBatch.findFirst({ where: { teamId: ctx.teamId, id: batchId }, select: { stopRequested: true } })
  if (!batch) return null
  const config = await getAuditConfig(ctx)
  const [eligible, queued, processing, month, inBatch] = await Promise.all([
    db.auditConversation.count({ where: eligibleWhere(ctx, batchId) }),
    db.auditConversation.count({ where: { teamId: ctx.teamId, batchId, status: "QUEUED" } }),
    db.auditConversation.count({ where: { teamId: ctx.teamId, batchId, status: "PROCESSING" } }),
    monthSpent(ctx),
    batchSpent(ctx, batchId),
  ])
  return {
    simulation: config.simulation,
    enabled: config.enabled,
    model: config.model,
    maxPerRun: config.maxPerRun,
    blocker: evaluationBlocker(guardOf(config, month, inBatch)),
    eligible,
    queued,
    processing,
    stopRequested: batch.stopRequested,
    monthSpentUsd: month,
    monthlyBudgetUsd: config.monthlyBudgetUsd,
    batchSpentUsd: inBatch,
    batchBudgetUsd: config.batchBudgetUsd,
  }
}

/* ─────────────── Fila ─────────────── */

type Fail = Extract<ActionResult, { ok: false }>

/** Põe conversas do lote na fila (até o teto por execução, contando as que já estão nela). */
export async function queueAuditRecord(ctx: AuditContext, input: unknown): Promise<{ ok: true; count: number } | Fail> {
  const parsed = queueAuditSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const { batchId, conversationIds, count } = parsed.data
  const batch = await db.auditBatch.findFirst({ where: { teamId: ctx.teamId, id: batchId }, select: { id: true } })
  if (!batch) return { ok: false, error: labels.validation.generic }
  const config = await getAuditConfig(ctx)
  const blocker = evaluationBlocker(guardOf(config, await monthSpent(ctx), await batchSpent(ctx, batchId)))
  if (blocker) return { ok: false, error: blocker }

  const active = await db.auditConversation.count({ where: { teamId: ctx.teamId, status: { in: ["QUEUED", "PROCESSING"] } } })
  const room = config.maxPerRun - active
  if (room <= 0) return { ok: false, error: labels.audit.run.queueFull }
  const picked = await db.auditConversation.findMany({
    where: { ...eligibleWhere(ctx, batchId), ...(conversationIds?.length ? { id: { in: conversationIds } } : {}) },
    orderBy: [{ startedAt: "asc" }, { fileName: "asc" }],
    take: Math.min(count, room),
    select: { id: true },
  })
  if (picked.length === 0) return { ok: false, error: labels.audit.run.nothingEligible }
  const ids = picked.map((p) => p.id)
  await db.$transaction(async (tx) => {
    await tx.auditConversation.updateMany({ where: { teamId: ctx.teamId, id: { in: ids } }, data: { status: "QUEUED", statusChangedAt: new Date(), claimedAt: null } })
    await tx.auditBatch.updateMany({ where: { teamId: ctx.teamId, id: batchId }, data: { status: "PROCESSING", stopRequested: false } })
    await writeAudit(
      { action: "attendanceAudit.queue", entity: "AuditBatch", entityId: batchId, after: { conversations: ids.length, simulation: config.simulation, model: config.model } },
      auditOf(ctx, tx),
    )
  })
  return { ok: true, count: ids.length }
}

/** Situação de volta, fora da fila: a dúvida da importação continua marcada. */
async function releaseQueued(ctx: AuditContext, batchId: string, tx?: Tx) {
  const client = tx ?? db
  const now = new Date()
  await client.auditConversation.updateMany({ where: { teamId: ctx.teamId, batchId, status: "QUEUED", needsReview: true }, data: { status: "REVIEW_NEEDED", statusChangedAt: now } })
  await client.auditConversation.updateMany({ where: { teamId: ctx.teamId, batchId, status: "QUEUED", needsReview: false }, data: { status: "IMPORTED", statusChangedAt: now } })
}

/** "Parar": nenhuma conversa nova é pega; a que está em análise termina. */
export async function stopAuditRecord(ctx: AuditContext, input: unknown): Promise<ActionResult> {
  const parsed = auditBatchRefSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { batchId } = parsed.data
  const batch = await db.auditBatch.findFirst({ where: { teamId: ctx.teamId, id: batchId }, select: { id: true } })
  if (!batch) return { ok: false, error: labels.validation.generic }
  await db.$transaction(async (tx) => {
    await tx.auditBatch.updateMany({ where: { teamId: ctx.teamId, id: batchId }, data: { stopRequested: true, status: "STOPPED" } })
    await releaseQueued(ctx, batchId, tx)
    await writeAudit({ action: "attendanceAudit.stop", entity: "AuditBatch", entityId: batchId, after: { stopped: true } }, auditOf(ctx, tx))
  })
  return { ok: true }
}

/* ─────────────── Um passo: uma conversa ─────────────── */

export type AuditStepResult =
  | { ok: true; state: "processed"; conversationId: string; label: string; outcome: "done" | "review" | "simulated" | "failed" | "retry"; detail: string | null }
  | { ok: true; state: "wait"; seconds: number; reason: string }
  | { ok: true; state: "idle" | "stopped" }
  | { ok: true; state: "blocked"; reason: string }
  | Fail

const restoredStatus = (needsReview: boolean): AuditConversationStatus => (needsReview ? "REVIEW_NEEDED" : "IMPORTED")

interface RunRecord {
  conversationId: string
  model: string
  criteriaVersion: string
  status: AuditRunStatus
  attempt: number
  startedAt: Date
  durationMs: number
  usage: OpenAiUsage
  costUsd: number
  response?: Prisma.InputJsonValue
  error?: string | null
}

async function recordRun(ctx: AuditContext, run: RunRecord, tx?: Tx) {
  const row = await (tx ?? db).auditRun.create({
    data: {
      teamId: ctx.teamId,
      conversationId: run.conversationId,
      model: run.model,
      criteriaVersion: run.criteriaVersion,
      status: run.status,
      attempt: run.attempt,
      startedAt: run.startedAt,
      durationMs: run.durationMs,
      inputTokens: run.usage.inputTokens,
      cachedTokens: run.usage.cachedTokens,
      outputTokens: run.usage.outputTokens,
      reasoningTokens: run.usage.reasoningTokens,
      costUsd: run.costUsd,
      response: run.response,
      error: run.error ?? null,
    },
    select: { id: true },
  })
  await writeAudit(
    {
      action: "attendanceAudit.run",
      entity: "AuditRun",
      entityId: row.id,
      after: {
        conversationId: run.conversationId,
        status: run.status,
        model: run.model,
        attempt: run.attempt,
        inputTokens: run.usage.inputTokens,
        outputTokens: run.usage.outputTokens,
        costUsd: run.costUsd,
        // Só o tipo do erro (nunca a conversa).
        error: run.error ? run.error.slice(0, 160) : null,
      },
    },
    auditOf(ctx, tx),
  )
  return row.id
}

const BLOCKING: Partial<Record<OpenAiErrorKind, string>> = {
  auth: labels.audit.blockers.auth,
  quota: labels.audit.blockers.quota,
  request: labels.audit.blockers.request,
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runAuditStepRecord(ctx: AuditContext, input: unknown): Promise<AuditStepResult> {
  const parsed = auditBatchRefSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const { batchId } = parsed.data
  const R = labels.audit.run
  const batch = await db.auditBatch.findFirst({ where: { teamId: ctx.teamId, id: batchId }, select: { stopRequested: true } })
  if (!batch) return { ok: false, error: labels.validation.generic }
  if (batch.stopRequested) return { ok: true, state: "stopped" }

  const config = await getAuditConfig(ctx)
  const criteria = criteriaFor(config.criteriaVersion)
  const [month, inBatch] = await Promise.all([monthSpent(ctx), batchSpent(ctx, batchId)])
  const guard = guardOf(config, month, inBatch)
  const blocker = evaluationBlocker(guard)
  if (blocker || !criteria) {
    await releaseQueued(ctx, batchId)
    return { ok: true, state: "blocked", reason: blocker ?? labels.audit.blockers.criteria }
  }

  const now = Date.now()
  const stale = new Date(now - CLAIM_STALE_MS)
  // Concorrência: quantas estão em análise agora no time (pegas há menos de 5 min).
  const busy = await db.auditConversation.count({ where: { teamId: ctx.teamId, status: "PROCESSING", claimedAt: { gt: stale } } })
  if (busy >= config.concurrency) return { ok: true, state: "wait", seconds: 5, reason: R.waitConcurrency }

  if (!config.simulation) {
    // Limites por minuto (chamadas e tokens), contados pelas execuções reais do último minuto.
    const recent = await db.auditRun.findMany({
      where: { teamId: ctx.teamId, status: { not: "SIMULATED" }, startedAt: { gt: new Date(now - 60_000) } },
      select: { startedAt: true, inputTokens: true, outputTokens: true },
      orderBy: { startedAt: "asc" },
    })
    const tokens = recent.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0)
    const oldest = recent[0]?.startedAt.getTime() ?? now
    const untilFree = Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000))
    if (recent.length >= config.requestsPerMinute) return { ok: true, state: "wait", seconds: untilFree, reason: R.waitRpm }
    if (recent.length > 0 && tokens + config.maxInputTokens + config.maxOutputTokens > config.tokensPerMinute) {
      return { ok: true, state: "wait", seconds: untilFree, reason: R.waitTpm }
    }
  }

  // Pega a próxima: só um passo consegue (updateMany condicional).
  const claimable: Prisma.AuditConversationWhereInput = {
    teamId: ctx.teamId,
    batchId,
    OR: [{ status: "QUEUED" }, { status: "PROCESSING", claimedAt: { lt: stale } }],
  }
  const next = await db.auditConversation.findFirst({ where: claimable, orderBy: [{ startedAt: "asc" }, { fileName: "asc" }], select: { id: true } })
  if (!next) {
    const left = await db.auditConversation.count({ where: { teamId: ctx.teamId, batchId, status: { in: ["QUEUED", "PROCESSING"] } } })
    if (left > 0) return { ok: true, state: "wait", seconds: 5, reason: R.waitConcurrency }
    await db.auditBatch.updateMany({ where: { teamId: ctx.teamId, id: batchId, status: "PROCESSING" }, data: { status: "DONE" } })
    return { ok: true, state: "idle" }
  }
  const claimed = await db.auditConversation.updateMany({
    where: { ...claimable, id: next.id },
    data: { status: "PROCESSING", claimedAt: new Date(), statusChangedAt: new Date(), attempts: { increment: 1 } },
  })
  if (claimed.count === 0) return { ok: true, state: "wait", seconds: 1, reason: R.waitConcurrency }

  const conversation = await db.auditConversation.findFirst({
    where: { teamId: ctx.teamId, id: next.id },
    select: {
      id: true,
      externalId: true,
      fileName: true,
      memberId: true,
      analystName: true,
      multipleAnalysts: true,
      needsReview: true,
      attempts: true,
      startedAt: true,
      endedAt: true,
      meta: true,
      messages: { orderBy: { position: "asc" }, select: { position: true, sender: true, sentAt: true, text: true } },
    },
  })
  if (!conversation) return { ok: false, error: labels.validation.generic }
  const label = conversation.externalId ? `#${conversation.externalId}` : conversation.fileName
  const meta = (conversation.meta ?? {}) as Partial<ParsedMeta>
  const subject: EvaluationSubject = {
    analystName: conversation.analystName,
    customerContact: meta.customerContact ?? null,
    tags: meta.tags ?? [],
    firstResponse: meta.firstResponse ?? null,
    startedAt: conversation.startedAt,
    endedAt: conversation.endedAt,
    multipleAnalysts: conversation.multipleAnalysts,
    messages: conversation.messages,
  }
  const request = buildEvaluationRequest(subject, criteria, config.criteriaVersion, config.maskPersonalData)
  const base = { conversationId: conversation.id, model: config.model, criteriaVersion: config.criteriaVersion }
  const zero: OpenAiUsage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 }
  const prices = { inputPricePerMTok: config.inputPricePerMTok, cachedInputPricePerMTok: config.cachedInputPricePerMTok, outputPricePerMTok: config.outputPricePerMTok }
  const worst = worstCaseCostUsd(request.estimatedInputTokens, config.maxOutputTokens, prices)

  /** Falha definitiva desta conversa (as outras seguem). */
  const fail = async (message: string) => {
    await db.$transaction(async (tx) => {
      await tx.auditConversation.updateMany({
        where: { teamId: ctx.teamId, id: conversation.id },
        data: { status: "FAILED", lastError: message.slice(0, 500), claimedAt: null, statusChangedAt: new Date() },
      })
      await writeAudit({ action: "attendanceAudit.fail", entity: "AuditConversation", entityId: conversation.id, after: { error: message.slice(0, 160) } }, auditOf(ctx, tx))
    })
    return { ok: true as const, state: "processed" as const, conversationId: conversation.id, label, outcome: "failed" as const, detail: message }
  }
  /** Devolve a conversa à situação anterior (sem culpa dela) e esvazia a fila. */
  const stopAll = async (reason: string) => {
    await db.auditConversation.updateMany({
      where: { teamId: ctx.teamId, id: conversation.id },
      data: { status: restoredStatus(conversation.needsReview), claimedAt: null, attempts: { decrement: 1 }, statusChangedAt: new Date() },
    })
    await releaseQueued(ctx, batchId)
    return { ok: true as const, state: "blocked" as const, reason }
  }

  if (request.estimatedInputTokens > config.maxInputTokens) {
    await recordRun(ctx, { ...base, status: "ERROR", attempt: conversation.attempts, startedAt: new Date(), durationMs: 0, usage: zero, costUsd: 0, error: R.tooLong })
    return fail(R.tooLong)
  }

  if (config.simulation) {
    // O fluxo inteiro, menos a chamada: nenhum número de nota é inventado.
    await db.$transaction(async (tx) => {
      await recordRun(
        ctx,
        {
          ...base,
          status: "SIMULATED",
          attempt: conversation.attempts,
          startedAt: new Date(),
          durationMs: 0,
          usage: zero,
          costUsd: 0,
          response: {
            simulated: true,
            estimatedInputTokens: request.estimatedInputTokens,
            maxOutputTokens: config.maxOutputTokens,
            worstCaseCostUsd: config.inputPricePerMTok !== null && config.outputPricePerMTok !== null ? worst : null,
            masked: config.maskPersonalData,
            maskCounts: request.maskCounts,
            messages: conversation.messages.length,
          },
        },
        tx,
      )
      await tx.auditConversation.updateMany({
        where: { teamId: ctx.teamId, id: conversation.id },
        data: { status: restoredStatus(conversation.needsReview), claimedAt: null, lastError: null, statusChangedAt: new Date() },
      })
    })
    return { ok: true, state: "processed", conversationId: conversation.id, label, outcome: "simulated", detail: null }
  }

  const room = budgetFits(guard, worst)
  if (room) return stopAll(room)

  const stepStarted = Date.now()
  let invalidLeft = 1
  let transientLeft = 1
  for (let attempt = 1; ; attempt++) {
    const startedAt = new Date()
    const result = await callOpenAi(ctx, {
      model: config.model,
      instructions: request.instructions,
      input: request.input,
      maxOutputTokens: config.maxOutputTokens,
      schemaName: `attendance_audit_${config.criteriaVersion}`,
      schema: EVALUATION_JSON_SCHEMA as unknown as Record<string, unknown>,
    })
    const costUsd = estimateCostUsd(result.usage, prices)
    const runBase = { ...base, attempt, startedAt, durationMs: result.durationMs, usage: result.usage, costUsd }
    const timeLeft = Date.now() - stepStarted < STEP_RETRY_BUDGET_MS

    if (!result.ok) {
      await recordRun(ctx, { ...runBase, status: "ERROR", error: result.message })
      const blocking = BLOCKING[result.kind]
      if (blocking) return stopAll(`${blocking} (${result.message})`)
      if (transientLeft > 0 && timeLeft) {
        transientLeft--
        await sleep(result.kind === "rate_limit" ? 6_000 : 2_000)
        continue
      }
      // Sem tempo neste passo: volta para a fila e o próximo passo tenta (até MAX_CLAIMS pegas).
      if (conversation.attempts < MAX_CLAIMS) {
        await db.auditConversation.updateMany({
          where: { teamId: ctx.teamId, id: conversation.id },
          data: { status: "QUEUED", claimedAt: null, lastError: result.message.slice(0, 500), statusChangedAt: new Date() },
        })
        return { ok: true, state: "processed", conversationId: conversation.id, label, outcome: "retry", detail: result.message }
      }
      return fail(result.message)
    }

    const invalid = result.refusal
      ? `${R.refused}: ${result.refusal}`
      : result.incomplete
        ? `${R.incomplete} (${result.incomplete})`
        : null
    const validation = invalid ? ({ ok: false, error: invalid } as const) : validateEvaluation(result.text, criteria)
    if (!validation.ok) {
      await recordRun(ctx, { ...runBase, status: "INVALID_RESPONSE", error: validation.error })
      if (invalidLeft > 0 && timeLeft) {
        invalidLeft--
        continue
      }
      return fail(`${R.invalid}: ${validation.error}`)
    }

    // Sucesso: grava tudo numa transação (execução, critérios, evidências, sugestões, conversa).
    const response = validation.response
    const outcome = assessEvaluation(response, criteria, request.sentTexts, {
      importNeedsReview: conversation.needsReview,
      multipleAnalysts: conversation.multipleAnalysts,
    })
    const memberId = conversation.multipleAnalysts ? null : conversation.memberId
    await db.$transaction(async (tx) => {
      const runId = await recordRun(
        ctx,
        {
          ...runBase,
          status: "SUCCESS",
          response: JSON.parse(
            JSON.stringify({
              ...response,
              assessment: {
                score: outcome.score,
                verified: outcome.verified,
                reviewReasons: outcome.reviewReasons,
                masked: config.maskPersonalData,
                maskCounts: request.maskCounts,
              },
            }),
          ) as Prisma.InputJsonValue,
        },
        tx,
      )
      await tx.auditCriterionScore.createMany({
        data: criteria.map((c) => {
          const r = response.criteria.find((x) => x.key === c.key)!
          return { teamId: ctx.teamId, runId, criterion: c.key, weight: c.weight, score: r.applicable ? r.score : null, applicable: r.applicable, justification: r.justification }
        }),
      })
      if (response.evidences.length) {
        await tx.auditEvidence.createMany({
          data: response.evidences.map((e, i) => ({
            teamId: ctx.teamId,
            runId,
            criterion: e.criterion,
            kind: e.kind,
            messagePosition: e.messagePosition,
            quote: e.quote,
            verified: outcome.verified[i] ?? false,
          })),
        })
      }
      if (response.feedback.length) {
        await tx.auditFeedbackSuggestion.createMany({
          data: response.feedback.map((f) => ({
            teamId: ctx.teamId,
            memberId,
            conversationId: conversation.id,
            kind: f.kind,
            situation: f.situation,
            behavior: f.behavior,
            impact: f.impact,
            suggestion: f.suggestion,
            evidence: { runId, messagePositions: f.messagePositions },
          })),
        })
      }
      await tx.auditConversation.updateMany({
        where: { teamId: ctx.teamId, id: conversation.id },
        data: {
          status: outcome.needsReview ? "REVIEW_NEEDED" : "DONE",
          finalScore: outcome.score.finalScore,
          needsReview: outcome.needsReview,
          claimedAt: null,
          lastError: null,
          statusChangedAt: new Date(),
        },
      })
    })
    return { ok: true, state: "processed", conversationId: conversation.id, label, outcome: outcome.needsReview ? "review" : "done", detail: null }
  }
}
