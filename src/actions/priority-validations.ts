"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireWriteContext } from "@/server/scope"
import { runAction } from "@/server/action-runner"
import {
  createValidationRecord,
  deleteValidationRecord,
  updateValidationRecord,
  type ValidationResult,
} from "@/server/priority-validations"

/**
 * Server Actions de validação de prioridade: requireWriteContext → núcleo em
 * src/server/priority-validations.ts (zod + transação + auditoria, sem
 * timeline — D15) → revalidate da tela e do perfil (bloco de 90 dias).
 */

const PATHS: (string | [string, "layout"])[] = ["/priority-validations", ["/team", "layout"]]

export async function createValidation(input: unknown): Promise<ValidationResult> {
  return runAction("priority-validations", async () => createValidationRecord(await requireWriteContext(), input), PATHS)
}

export async function updateValidation(input: unknown): Promise<ValidationResult> {
  return runAction("priority-validations", async () => updateValidationRecord(await requireWriteContext(), input), PATHS)
}

export async function deleteValidation(input: unknown): Promise<ActionResult> {
  return runAction("priority-validations", async () => deleteValidationRecord(await requireWriteContext(), input), PATHS)
}
