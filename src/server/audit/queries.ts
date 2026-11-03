import type { AuditConversationStatus, AuditSender } from "@prisma/client"

import { nameKey, type ParsedMeta } from "../../lib/audit/parser.ts"
import { db } from "../db.ts"
import type { AuditContext } from "./access.ts"
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
      batch: { select: { name: true } },
      member: { select: { id: true, preferredName: true } },
      messages: { orderBy: { position: "asc" }, select: { position: true, sender: true, authorName: true, sentAt: true, text: true } },
    },
  })
  if (!row) return null
  return {
    ...row,
    member: row.member ? { id: row.member.id, name: row.member.preferredName } : null,
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
