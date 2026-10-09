"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireTeamContext, requireWriteContext } from "@/server/scope"
import { runAction } from "@/server/action-runner"
import {
  createDevReturnRecord,
  deleteDevReturnRecord,
  resolveDevReturnRecord,
  updateDevReturnRecord,
  type DevReturnResult,
} from "@/server/dev-returns"
import { getTicketContext, type TicketContext } from "@/server/queries/dev-returns"

/**
 * Server Actions de devolução do desenvolvimento (P20): requireWriteContext → núcleo
 * em src/server/dev-returns.ts (zod + transação + auditoria, sem timeline) →
 * revalidate da tela, do perfil (bloco de 90 dias) e da home (alertas).
 */

const PATHS: (string | [string, "layout"])[] = ["/dev-returns", ["/team", "layout"], ["/", "layout"]]

export async function createDevReturn(input: unknown): Promise<DevReturnResult> {
  return runAction("dev-returns", async () => createDevReturnRecord(await requireWriteContext(), input), PATHS)
}

export async function updateDevReturn(input: unknown): Promise<DevReturnResult> {
  return runAction("dev-returns", async () => updateDevReturnRecord(await requireWriteContext(), input), PATHS)
}

export async function resolveDevReturn(input: unknown): Promise<ActionResult> {
  return runAction("dev-returns", async () => resolveDevReturnRecord(await requireWriteContext(), input), PATHS)
}

export async function deleteDevReturn(input: unknown): Promise<ActionResult> {
  return runAction("dev-returns", async () => deleteDevReturnRecord(await requireWriteContext(), input), PATHS)
}

/** Leitura: contexto do chamado colado (validação mais recente e devoluções anteriores). */
export async function loadTicketContext(ticketRef: string, exceptId?: string): Promise<TicketContext | null> {
  const ref = typeof ticketRef === "string" ? ticketRef.trim().slice(0, 64) : ""
  if (!ref) return null
  return getTicketContext(await requireTeamContext(), ref, typeof exceptId === "string" ? exceptId : undefined)
}
