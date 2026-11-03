import { labels } from "../../lib/labels.ts"
import { fieldErrorsOf, type ActionResult } from "../../lib/validators/fields.ts"
import { auditConfigSchema } from "../../lib/validators/audit.ts"
import { auditOf, writeAudit } from "../audit.ts"
import { db } from "../db.ts"
import type { AuditContext } from "./access.ts"

/**
 * C23 — configuração da Auditoria de Atendimentos (uma linha por time). Sem linha, valem os
 * padrões SEGUROS do schema do banco: desligada, em simulação, orçamento zero, sem preços.
 * Ler não cria a linha; só "Salvar" grava (auditado `attendanceAudit.config.update`).
 * A chave da OpenAI NUNCA passa por aqui: vive na variável de ambiente, e a tela só fica
 * sabendo SE existe (`apiKeyConfigured`).
 */

export interface AuditConfigView {
  enabled: boolean
  simulation: boolean
  model: string
  criteriaVersion: string
  maxPerRun: number
  concurrency: number
  requestsPerMinute: number
  tokensPerMinute: number
  maxInputTokens: number
  maxOutputTokens: number
  monthlyBudgetUsd: number
  batchBudgetUsd: number
  inputPricePerMTok: number | null
  cachedInputPricePerMTok: number | null
  outputPricePerMTok: number | null
  maskPersonalData: boolean
  retentionDays: number
  updatedAt: Date | null
  /** A variável OPENAI_API_KEY existe no servidor (o valor nunca sai dele). */
  apiKeyConfigured: boolean
}

const DEFAULTS: Omit<AuditConfigView, "updatedAt" | "apiKeyConfigured"> = {
  enabled: false,
  simulation: true,
  model: "gpt-5.4-nano",
  criteriaVersion: "v1",
  maxPerRun: 5,
  concurrency: 1,
  requestsPerMinute: 10,
  tokensPerMinute: 60_000,
  maxInputTokens: 12_000,
  maxOutputTokens: 2_500,
  monthlyBudgetUsd: 0,
  batchBudgetUsd: 0,
  inputPricePerMTok: null,
  cachedInputPricePerMTok: null,
  outputPricePerMTok: null,
  maskPersonalData: true,
  retentionDays: 180,
}

const num = (value: { toString(): string } | null) => (value === null ? null : Number(value.toString()))

export async function getAuditConfig(ctx: AuditContext): Promise<AuditConfigView> {
  const row = await db.auditConfig.findUnique({ where: { teamId: ctx.teamId } })
  const apiKeyConfigured = Boolean(process.env.OPENAI_API_KEY?.trim())
  if (!row) return { ...DEFAULTS, updatedAt: null, apiKeyConfigured }
  return {
    enabled: row.enabled,
    simulation: row.simulation,
    model: row.model,
    criteriaVersion: row.criteriaVersion,
    maxPerRun: row.maxPerRun,
    concurrency: row.concurrency,
    requestsPerMinute: row.requestsPerMinute,
    tokensPerMinute: row.tokensPerMinute,
    maxInputTokens: row.maxInputTokens,
    maxOutputTokens: row.maxOutputTokens,
    monthlyBudgetUsd: num(row.monthlyBudgetUsd) ?? 0,
    batchBudgetUsd: num(row.batchBudgetUsd) ?? 0,
    inputPricePerMTok: num(row.inputPricePerMTok),
    cachedInputPricePerMTok: num(row.cachedInputPricePerMTok),
    outputPricePerMTok: num(row.outputPricePerMTok),
    maskPersonalData: row.maskPersonalData,
    retentionDays: row.retentionDays,
    updatedAt: row.updatedAt,
    apiKeyConfigured,
  }
}

export async function updateAuditConfigRecord(ctx: AuditContext, input: unknown): Promise<ActionResult> {
  const parsed = auditConfigSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  // Ligar as avaliações reais exige os preços (sem eles não há estimativa de custo nem teto).
  if (data.enabled && !data.simulation && (data.inputPricePerMTok === null || data.outputPricePerMTok === null)) {
    return { ok: false, error: labels.audit.config.pricesRequired, fieldErrors: { inputPricePerMTok: labels.audit.config.pricesRequired } }
  }
  const before = await db.auditConfig.findUnique({ where: { teamId: ctx.teamId } })
  await db.$transaction(async (tx) => {
    await tx.auditConfig.upsert({
      where: { teamId: ctx.teamId },
      create: { teamId: ctx.teamId, ...data, updatedByUserId: ctx.userId },
      update: { ...data, updatedByUserId: ctx.userId },
    })
    await writeAudit(
      {
        action: "attendanceAudit.config.update",
        entity: "AuditConfig",
        entityId: ctx.teamId,
        before: before ? JSON.parse(JSON.stringify({ ...before, id: undefined, teamId: undefined })) : null,
        after: JSON.parse(JSON.stringify(data)),
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}
