import type { AuditConversationStatus, AuditSender } from "@prisma/client"

import { criteriaFor } from "../../lib/audit/criteria.ts"
import { buildEvaluationRequest } from "../../lib/audit/evaluation.ts"
import { nameKey, type ParsedMeta } from "../../lib/audit/parser.ts"
import { db } from "../db.ts"
import type { AuditContext } from "./access.ts"
import { getAuditConfig } from "./config.ts"
import type { ImportReportEntry } from "./import.ts"

/**
 * C23 — leituras da Auditoria de Atendimentos. Todas recebem o `AuditContext` (as três
 * travas) e filtram pelo time. Só a conta autorizada chega aqui.
 */

export async function listAuditBatches(ctx: AuditContext) {
  return db.auditBatch.findMany({
    where: { teamId: ctx.teamId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, name: true, status: true, createdAt: true, fileCount: true, importedCount: true, duplicateCount: true, failedCount: true, warningCount: true },
  })
}

export interface AuditConversationRow {
  id: string
  fileName: string
  externalId: string | null
  customerName: string | null
  analystName: string | null
  member: { id: string; name: string } | null
  multipleAnalysts: boolean
  startedAt: Date | null
  messageCount: number
  status: AuditConversationStatus
  needsReview: boolean
  finalScore: number | null
  warnings: string[]
  lastError: string | null
}

export async function getAuditBatch(ctx: AuditContext, id: string) {
  const batch = await db.auditBatch.findFirst({
    where: { teamId: ctx.teamId, id },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      fileCount: true,
      importedCount: true,
      duplicateCount: true,
      failedCount: true,
      warningCount: true,
      report: true,
      conversations: {
        orderBy: [{ startedAt: "asc" }, { fileName: "asc" }],
        select: {
          id: true,
          fileName: true,
          externalId: true,
          customerName: true,
          analystName: true,
          multipleAnalysts: true,
          startedAt: true,
          messageCount: true,
          status: true,
          needsReview: true,
          parseWarnings: true,
          lastError: true,
          finalScore: true,
          member: { select: { id: true, preferredName: true } },
        },
      },
    },
  })
  if (!batch) return null
  const conversations: AuditConversationRow[] = batch.conversations.map((c) => ({
    id: c.id,
    fileName: c.fileName,
    externalId: c.externalId,
    customerName: c.customerName,
    analystName: c.analystName,
    member: c.member ? { id: c.member.id, name: c.member.preferredName } : null,
    multipleAnalysts: c.multipleAnalysts,
    startedAt: c.startedAt,
    messageCount: c.messageCount,
    status: c.status,
    needsReview: c.needsReview,
    finalScore: c.finalScore === null ? null : Number(c.finalScore.toString()),
    warnings: Array.isArray(c.parseWarnings) ? (c.parseWarnings as string[]) : [],
    lastError: c.lastError,
  }))
  const report = Array.isArray(batch.report) ? (batch.report as ImportReportEntry[]) : []
  return { ...batch, conversations, report }
}

export interface AuditTranscriptMessage {
  position: number
  sender: AuditSender
  authorName: string | null
  sentAt: Date | null
  text: string
}

export async function getAuditConversation(ctx: AuditContext, id: string) {
  const row = await db.auditConversation.findFirst({
    where: { teamId: ctx.teamId, id },
    select: {
      id: true,
      batchId: true,
      fileName: true,
      encoding: true,
      externalId: true,
      customerName: true,
      analystName: true,
      multipleAnalysts: true,
      startedAt: true,
      endedAt: true,
      messageCount: true,
      status: true,
      needsReview: true,
      parseWarnings: true,
      lastError: true,
      meta: true,
      createdAt: true,
      finalScore: true,
      batch: { select: { name: true } },
      member: { select: { id: true, preferredName: true } },
      messages: { orderBy: { position: "asc" }, select: { position: true, sender: true, authorName: true, sentAt: true, text: true } },
    },
  })
  if (!row) return null
  return {
    ...row,
    member: row.member ? { id: row.member.id, name: row.member.preferredName } : null,
    finalScore: row.finalScore === null ? null : Number(row.finalScore.toString()),
    warnings: Array.isArray(row.parseWarnings) ? (row.parseWarnings as string[]) : [],
    meta: (row.meta ?? null) as Partial<ParsedMeta> | null,
    messages: row.messages as AuditTranscriptMessage[],
  }
}

/** Nomes de analista dos TXT ainda sem pessoa do time, com quantas conversas cada um tem. */
export async function listUnrecognizedAnalysts(ctx: AuditContext) {
  const rows = await db.auditConversation.findMany({
    where: { teamId: ctx.teamId, memberId: null, analystName: { not: null } },
    select: { analystName: true },
  })
  const byKey = new Map<string, { name: string; count: number }>()
  for (const r of rows) {
    const key = nameKey(r.analystName!)
    const current = byKey.get(key)
    if (current) current.count++
    else byKey.set(key, { name: r.analystName!, count: 1 })
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/** Pessoas ativas do time, para ligar um nome de analista a alguém. */
export async function listMembersForAudit(ctx: AuditContext) {
  const rows = await db.teamMember.findMany({
    where: { teamId: ctx.teamId, status: { in: ["ACTIVE", "OFFBOARDING", "ON_LEAVE"] } },
    orderBy: { preferredName: "asc" },
    select: { id: true, preferredName: true, fullName: true },
  })
  return rows.map((m) => ({ id: m.id, name: m.preferredName, fullName: m.fullName }))
}

/* ─────────────── Fase D: avaliação ─────────────── */

export interface AuditRunView {
  id: string
  status: "SUCCESS" | "SIMULATED" | "INVALID_RESPONSE" | "ERROR"
  model: string
  criteriaVersion: string
  attempt: number
  startedAt: Date
  durationMs: number
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  reasoningTokens: number
  costUsd: number
  error: string | null
  response: Record<string, unknown> | null
}

/** Execuções da conversa (mais recente primeiro), as notas da vigente e as sugestões de feedback. */
export async function getAuditEvaluation(ctx: AuditContext, conversationId: string) {
  const [runs, feedback] = await Promise.all([
    db.auditRun.findMany({
      where: { teamId: ctx.teamId, conversationId },
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        model: true,
        criteriaVersion: true,
        attempt: true,
        startedAt: true,
        durationMs: true,
        inputTokens: true,
        cachedTokens: true,
        outputTokens: true,
        reasoningTokens: true,
        costUsd: true,
        error: true,
        response: true,
        scores: { select: { criterion: true, weight: true, score: true, applicable: true, justification: true } },
      },
    }),
    db.auditFeedbackSuggestion.findMany({
      where: { teamId: ctx.teamId, conversationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true, situation: true, behavior: true, impact: true, suggestion: true, evidence: true },
    }),
  ])
  const views: (AuditRunView & { scores: { criterion: string; weight: number; score: number | null; applicable: boolean; justification: string }[] })[] = runs.map((r) => ({
    ...r,
    costUsd: Number(r.costUsd.toString()),
    response: r.response && typeof r.response === "object" && !Array.isArray(r.response) ? (r.response as Record<string, unknown>) : null,
    scores: r.scores.map((s) => ({ ...s, score: s.score === null ? null : Number(s.score.toString()) })),
  }))
  const current = views.find((r) => r.status === "SUCCESS") ?? null
  // Sugestões da avaliação vigente (a execução está no vínculo de evidência).
  const currentFeedback = current
    ? feedback.filter((f) => (f.evidence as { runId?: string } | null)?.runId === current.id).map((f) => ({ ...f, positions: ((f.evidence as { messagePositions?: number[] } | null)?.messagePositions ?? []) }))
    : []
  return { runs: views, current, feedback: currentFeedback }
}

/**
 * O pedido EXATO que iria à IA para esta conversa, com a configuração atual (mascaramento
 * incluído) — para conferir o que sai antes de autorizar. Só para a conta autorizada.
 */
export async function getAuditPayloadPreview(ctx: AuditContext, conversationId: string) {
  const [config, conversation] = await Promise.all([
    getAuditConfig(ctx),
    db.auditConversation.findFirst({
      where: { teamId: ctx.teamId, id: conversationId },
      select: {
        analystName: true,
        multipleAnalysts: true,
        startedAt: true,
        endedAt: true,
        meta: true,
        messages: { orderBy: { position: "asc" }, select: { position: true, sender: true, sentAt: true, text: true } },
      },
    }),
  ])
  const criteria = criteriaFor(config.criteriaVersion)
  if (!conversation || !criteria || conversation.messages.length === 0) return null
  const meta = (conversation.meta ?? {}) as Partial<ParsedMeta>
  const request = buildEvaluationRequest(
    {
      analystName: conversation.analystName,
      customerContact: meta.customerContact ?? null,
      tags: meta.tags ?? [],
      firstResponse: meta.firstResponse ?? null,
      startedAt: conversation.startedAt,
      endedAt: conversation.endedAt,
      multipleAnalysts: conversation.multipleAnalysts,
      messages: conversation.messages,
    },
    criteria,
    config.criteriaVersion,
    config.maskPersonalData,
  )
  return {
    instructions: request.instructions,
    input: request.input,
    masked: config.maskPersonalData,
    maskCounts: request.maskCounts,
    estimatedInputTokens: request.estimatedInputTokens,
    maxInputTokens: config.maxInputTokens,
    model: config.model,
  }
}
