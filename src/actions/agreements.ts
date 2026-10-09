"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireWriteContext } from "@/server/scope"
import { memberIdOf, runAction } from "@/server/action-runner"
import {
  cancelAgreementRecord,
  completeAgreementRecord,
  createAgreementRecord,
  updateAgreementRecord,
} from "@/server/agreements"

/**
 * Server Actions de combinados: requireWriteContext → núcleo em
 * src/server/agreements.ts (zod + transação + timeline + auditoria) → revalidate.
 */

export async function createAgreement(input: unknown): Promise<ActionResult> {
  return runAction("agreements", async () => createAgreementRecord(await requireWriteContext(), input), [
    "/team",
    "/agreements",
    [`/team/${memberIdOf(input)}`, "layout"],
  ])
}

export async function completeAgreement(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("agreements", async () => completeAgreementRecord(await requireWriteContext(), input), [
    "/agreements",
    `/agreements/${id}`,
    ["/team", "layout"],
  ])
}

export async function updateAgreement(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("agreements", async () => updateAgreementRecord(await requireWriteContext(), input), [
    "/agreements",
    `/agreements/${id}`,
    ["/team", "layout"],
  ])
}

export async function cancelAgreement(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("agreements", async () => cancelAgreementRecord(await requireWriteContext(), input), [
    "/agreements",
    `/agreements/${id}`,
    ["/team", "layout"],
  ])
}
