import { createHash } from "node:crypto"

import type { AuditConversationStatus, Prisma } from "@prisma/client"

import { nameKey, normalizeText, parseConversation } from "../../lib/audit/parser.ts"
import { labels } from "../../lib/labels.ts"
import { fieldErrorsOf, type ActionResult } from "../../lib/validators/fields.ts"
import { auditAliasSchema, createAuditBatchSchema, importAuditFilesSchema } from "../../lib/validators/audit.ts"
import { auditOf, writeAudit } from "../audit.ts"
import { db } from "../db.ts"
import type { AuditContext } from "./access.ts"

/**
 * C23 Fase C — importação das conversas (sem IA). O navegador lê os arquivos e manda só o
 * texto, em pacotes; aqui tudo é lido de novo (o servidor não confia no que veio) e gravado:
 * - duplicata (mesmo conteúdo, SHA-256, no time) não entra, mas aparece no relatório;
 * - arquivo que o leitor não entende entra como FALHA, com o motivo — nada some calado;
 * - dúvida de quem disse o quê (remetente desconhecido, transferência) vai para REVISÃO;
 * - o analista só é ligado à pessoa do time por apelido cadastrado ou nome completo IGUAL
 *   (sem acento, sem caixa). Nunca por aproximação: sem certeza, "não reconhecido".
 * Logs e auditoria levam só contagens — nunca a transcrição.
 */

export type ImportReportEntry = {
  file: string
  result: "imported" | "duplicate" | "failed" | "rejected"
  conversationId?: string
  externalId?: string | null
  analyst?: string | null
  recognized?: boolean
  review?: boolean
  warnings: string[]
}

export async function createAuditBatchRecord(ctx: AuditContext, input: unknown): Promise<{ ok: true; id: string } | Extract<ActionResult, { ok: false }>> {
  const parsed = createAuditBatchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const batch = await db.$transaction(async (tx) => {
    const row = await tx.auditBatch.create({ data: { teamId: ctx.teamId, name: parsed.data.name, createdByUserId: ctx.userId, report: [] }, select: { id: true } })
    await writeAudit({ action: "attendanceAudit.batch.create", entity: "AuditBatch", entityId: row.id, after: { name: parsed.data.name } }, auditOf(ctx, tx))
    return row
  })
  return { ok: true, id: batch.id }
}

/** Pessoas do time pela chave do nome completo e pelos apelidos cadastrados. */
async function analystIndex(ctx: AuditContext) {
  const [aliases, members] = await Promise.all([
    db.auditAnalystAlias.findMany({ where: { teamId: ctx.teamId }, select: { aliasKey: true, memberId: true } }),
    db.teamMember.findMany({ where: { teamId: ctx.teamId }, select: { id: true, fullName: true } }),
  ])
  const byName = new Map<string, string | null>()
  for (const m of members) {
    const key = nameKey(m.fullName)
    // Dois com o mesmo nome completo: ambíguo, ninguém é escolhido.
    byName.set(key, byName.has(key) ? null : m.id)
  }
  for (const a of aliases) byName.set(a.aliasKey, a.memberId)
  return (name: string | null) => (name ? (byName.get(nameKey(name)) ?? null) : null)
}

export async function importAuditFilesRecord(
  ctx: AuditContext,
  input: unknown,
): Promise<{ ok: true; entries: ImportReportEntry[] } | Extract<ActionResult, { ok: false }>> {
  const parsed = importAuditFilesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const { batchId, files, rejected } = parsed.data
  const batch = await db.auditBatch.findFirst({ where: { teamId: ctx.teamId, id: batchId, status: "OPEN" }, select: { id: true } })
  if (!batch) return { ok: false, error: labels.audit.import.batchClosed }

  const recognize = await analystIndex(ctx)
  const entries: ImportReportEntry[] = rejected.map((r) => ({ file: r.name, result: "rejected", warnings: [r.reason] }))

  for (const file of files) {
    const text = normalizeText(file.text)
    const contentHash = createHash("sha256").update(text).digest("hex")
    const existing = await db.auditConversation.findFirst({ where: { teamId: ctx.teamId, contentHash }, select: { id: true } })
    if (existing) {
      entries.push({ file: file.name, result: "duplicate", conversationId: existing.id, warnings: [labels.audit.import.duplicate] })
      continue
    }
    const result = parseConversation(text)
    if (!result.ok) {
      const row = await db.auditConversation.create({
        data: {
          teamId: ctx.teamId,
          batchId,
          fileName: file.name,
          contentHash,
          encoding: file.encoding,
          rawText: text,
          status: "FAILED",
          lastError: result.error,
          parseWarnings: result.warnings,
        },
        select: { id: true },
      })
      entries.push({ file: file.name, result: "failed", conversationId: row.id, warnings: [result.error, ...result.warnings] })
      continue
    }
    const { meta, messages, warnings } = result
    const memberId = recognize(meta.analystName)
    const allWarnings = memberId || !meta.analystName ? warnings : [...warnings, labels.audit.import.analystUnknown]
    const status: AuditConversationStatus = result.needsReview ? "REVIEW_NEEDED" : "IMPORTED"
    const id = await db.$transaction(async (tx) => {
      const row = await tx.auditConversation.create({
        data: {
          teamId: ctx.teamId,
          batchId,
          fileName: file.name,
          contentHash,
          encoding: file.encoding,
          rawText: text,
          externalId: meta.externalId,
          customerName: meta.customerCompany,
          analystName: meta.analystName,
          memberId,
          multipleAnalysts: result.multipleAnalysts,
          startedAt: meta.startedAt,
          endedAt: meta.endedAt ?? meta.finishedAt,
          messageCount: messages.length,
          parseWarnings: allWarnings,
          meta: JSON.parse(JSON.stringify(meta)) as Prisma.InputJsonValue,
          status,
          needsReview: result.needsReview,
        },
        select: { id: true },
      })
      await tx.auditMessage.createMany({
        data: messages.map((m) => ({
          teamId: ctx.teamId,
          conversationId: row.id,
          position: m.position,
          sender: m.sender,
          authorName: m.authorName,
          sentAt: m.sentAt,
          text: m.text,
        })),
      })
      return row.id
    })
    entries.push({
      file: file.name,
      result: "imported",
      conversationId: id,
      externalId: meta.externalId,
      analyst: meta.analystName,
      recognized: memberId !== null,
      review: result.needsReview,
      warnings: allWarnings,
    })
  }

  // Contadores e relatório do lote (acumulados a cada pacote).
  await db.$transaction(async (tx) => {
    const current = await tx.auditBatch.findFirst({ where: { teamId: ctx.teamId, id: batchId }, select: { report: true } })
    const report = [...(Array.isArray(current?.report) ? (current.report as ImportReportEntry[]) : []), ...entries]
    await tx.auditBatch.updateMany({
      where: { teamId: ctx.teamId, id: batchId },
      data: {
        report: JSON.parse(JSON.stringify(report)) as Prisma.InputJsonValue,
        fileCount: { increment: entries.length },
        importedCount: { increment: entries.filter((e) => e.result === "imported").length },
        duplicateCount: { increment: entries.filter((e) => e.result === "duplicate").length },
        failedCount: { increment: entries.filter((e) => e.result === "failed" || e.result === "rejected").length },
        warningCount: { increment: entries.filter((e) => e.result === "imported" && e.warnings.length > 0).length },
      },
    })
    await writeAudit(
      {
        action: "attendanceAudit.batch.import",
        entity: "AuditBatch",
        entityId: batchId,
        after: {
          files: entries.length,
          imported: entries.filter((e) => e.result === "imported").length,
          duplicates: entries.filter((e) => e.result === "duplicate").length,
          failed: entries.filter((e) => e.result === "failed" || e.result === "rejected").length,
        },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true, entries }
}

/**
 * Liga um nome de analista dos TXT a uma pessoa do time (apelido) e reconhece as conversas
 * já importadas com esse nome que estavam sem pessoa. Não mexe em quem já foi reconhecido.
 */
export async function linkAnalystAliasRecord(ctx: AuditContext, input: unknown): Promise<{ ok: true; linked: number } | Extract<ActionResult, { ok: false }>> {
  const parsed = auditAliasSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const member = await db.teamMember.findFirst({ where: { teamId: ctx.teamId, id: parsed.data.memberId }, select: { id: true } })
  if (!member) return { ok: false, error: labels.validation.generic }
  const aliasKey = nameKey(parsed.data.alias)
  const pending = await db.auditConversation.findMany({ where: { teamId: ctx.teamId, memberId: null, analystName: { not: null } }, select: { id: true, analystName: true } })
  const ids = pending.filter((c) => nameKey(c.analystName!) === aliasKey).map((c) => c.id)
  await db.$transaction(async (tx) => {
    await tx.auditAnalystAlias.upsert({
      where: { teamId_aliasKey: { teamId: ctx.teamId, aliasKey } },
      create: { teamId: ctx.teamId, alias: parsed.data.alias, aliasKey, memberId: member.id },
      update: { alias: parsed.data.alias, memberId: member.id },
    })
    if (ids.length) await tx.auditConversation.updateMany({ where: { teamId: ctx.teamId, id: { in: ids } }, data: { memberId: member.id } })
    await writeAudit(
      { action: "attendanceAudit.alias.link", entity: "AuditAnalystAlias", entityId: aliasKey, after: { alias: parsed.data.alias, memberId: member.id, conversations: ids.length } },
      auditOf(ctx, tx),
    )
  })
  return { ok: true, linked: ids.length }
}
