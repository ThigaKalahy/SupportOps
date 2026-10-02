"use server"

import type { ActionResult } from "@/lib/validators/member"
import { requireOwner } from "@/server/access"
import { memberIdOf, runAction } from "@/server/action-runner"
import {
  createMemberRecord,
  deactivateMemberRecord,
  updateManagerSummaryRecord,
  updateMemberRecord,
} from "@/server/members"

/**
 * Server Actions de pessoas do time: requireOwner → núcleo em
 * src/server/members.ts (zod + transação + MemberChange + timeline + auditoria)
 * → revalidatePath.
 */

export async function createMember(input: unknown): Promise<ActionResult> {
  return runAction("members", async () => createMemberRecord(await requireOwner(), input), ["/team"])
}

export async function updateMember(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("members", async () => updateMemberRecord(await requireOwner(), input), ["/team", [`/team/${id}`, "layout"]])
}

export async function deactivateMember(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("members", async () => deactivateMemberRecord(await requireOwner(), input), ["/team", [`/team/${id}`, "layout"]])
}

export async function updateManagerSummary(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("members", async () => updateManagerSummaryRecord(await requireOwner(), input), [`/team/${id}`])
}
