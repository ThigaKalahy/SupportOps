"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { runAction } from "@/server/action-runner"
import { requireAuditContext } from "@/server/audit/access"
import { updateAuditConfigRecord } from "@/server/audit/config"

/**
 * C23 — Server Actions da Auditoria de Atendimentos (D47). Toda action começa por
 * `requireAuditContext` (gestor + módulo + conta autorizada); sem as três, erro.
 */

export async function updateAuditConfig(input: unknown): Promise<ActionResult> {
  return runAction("attendance-audit", async () => updateAuditConfigRecord(await requireAuditContext(), input), ["/audit"])
}
