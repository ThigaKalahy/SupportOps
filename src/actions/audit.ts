"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { runAction } from "@/server/action-runner"
import { requireAuditContext } from "@/server/audit/access"
import { updateAuditConfigRecord } from "@/server/audit/config"
import { createAuditBatchRecord, importAuditFilesRecord, linkAnalystAliasRecord } from "@/server/audit/import"

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

/** Fase C: liga um nome de analista dos TXT a uma pessoa do time. */
export async function linkAnalystAlias(input: unknown) {
  return runAction("attendance-audit", async () => linkAnalystAliasRecord(await requireAuditContext(), input), ["/audit"])
}
