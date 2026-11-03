"use server"

import { labels } from "@/lib/labels"
import type { ActionResult } from "@/lib/validators/fields"
import { runAction } from "@/server/action-runner"
import { requireAuditContext } from "@/server/audit/access"
import { ScopeError } from "@/server/scope"
import { updateAuditConfigRecord } from "@/server/audit/config"
import { getAuditRunState, queueAuditRecord, runAuditStepRecord, stopAuditRecord } from "@/server/audit/evaluate"
import { createAuditBatchRecord, importAuditFilesRecord, linkAnalystAliasRecord, recognizeAnalystsRecord } from "@/server/audit/import"

/**
 * C23 — Server Actions da Auditoria de Atendimentos (D47). Toda action começa por
 * `requireAuditContext` (gestor + módulo + conta autorizada); sem as três, erro.
 */

export async function updateAuditConfig(input: unknown): Promise<ActionResult> {
  return runAction("attendance-audit", async () => updateAuditConfigRecord(await requireAuditContext(), input), ["/audit"])
}

/** Fase C: novo lote de importação. */
export async function createAuditBatch(input: unknown) {
  return runAction("attendance-audit", async () => createAuditBatchRecord(await requireAuditContext(), input), ["/audit"])
}

/** Fase C: um pacote de arquivos do lote (o navegador envia em pacotes pequenos). Sem IA. */
export async function importAuditFiles(input: unknown) {
  return runAction("attendance-audit", async () => importAuditFilesRecord(await requireAuditContext(), input), [])
}

/** Reconhece pelo primeiro nome as conversas já importadas que ficaram sem pessoa. */
export async function recognizeAnalysts() {
  return runAction("attendance-audit", async () => recognizeAnalystsRecord(await requireAuditContext()), [["/audit", "layout"]])
}

/** Fase C: liga um nome de analista dos TXT a uma pessoa do time. */
export async function linkAnalystAlias(input: unknown) {
  return runAction("attendance-audit", async () => linkAnalystAliasRecord(await requireAuditContext(), input), ["/audit"])
}

/**
 * Fase D: põe conversas do lote na fila (até o teto por execução). As travas (avaliações
 * ligadas; fora da simulação, chave, preços e orçamento) são conferidas no servidor.
 */
export async function queueAudit(input: unknown) {
  return runAction("attendance-audit", async () => queueAuditRecord(await requireAuditContext(), input), [])
}

/** Fase D: avalia UMA conversa da fila (a tela chama de novo até a fila acabar). */
export async function runAuditStep(input: unknown) {
  try {
    return await runAuditStepRecord(await requireAuditContext(), input)
  } catch (error) {
    if (error instanceof ScopeError) return { ok: false as const, error: error.message }
    // Só o tipo do erro no log, nunca a conversa.
    console.error("[attendance-audit] falha no passo da avaliação", error instanceof Error ? error.name : "erro")
    return { ok: false as const, error: labels.validation.generic }
  }
}

/** Fase D: "Parar" — nenhuma conversa nova é pega. */
export async function stopAudit(input: unknown) {
  return runAction("attendance-audit", async () => stopAuditRecord(await requireAuditContext(), input), [])
}

/** Fase D: estado da fila do lote (leitura), para a tela retomar depois de recarregar. */
export async function loadAuditRunState(batchId: string) {
  const ctx = await requireAuditContext()
  return getAuditRunState(ctx, batchId)
}
