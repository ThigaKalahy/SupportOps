"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireOwner } from "@/server/access"
import { memberIdOf, runAction } from "@/server/action-runner"
import {
  cancelAgreementRecord,
  completeAgreementRecord,
  createAgreementRecord,
  updateAgreementRecord,
} from "@/server/agreements"

/**
 * Server Actions de combinados: requireOwner → núcleo em
 * src/server/agreements.ts (zod + transação + timeline + auditoria) → revalidate.
 */

export async function createAgreement(input: unknown): Promise<ActionResult> {
  return runAction("agreements", async () => createAgreementRecord(await requireOwner(), input), [
    "/team",
    "/agreements",
    [`/team/${memberIdOf(input)}`, "layout"],
  ])
}

export async function completeAgreement(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("agreements", async () => completeAgreementRecord(await requireOwner(), input), [
    "/agreements",
    `/agreements/${id}`,
    ["/team", "layout"],
  ])
}

export async function updateAgreement(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("agreements", async () => updateAgreementRecord(await requireOwner(), input), [
    "/agreements",
    `/agreements/${id}`,
    ["/team", "layout"],
  ])
}

export async function cancelAgreement(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("agreements", async () => cancelAgreementRecord(await requireOwner(), input), [
    "/agreements",
    `/agreements/${id}`,
    ["/team", "layout"],
  ])
}
