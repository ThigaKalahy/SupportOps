"use server"

import type { ActionResult } from "@/lib/validators/member"
import { requireWriteContext } from "@/server/scope"
import { memberIdOf, runAction } from "@/server/action-runner"
import {
  createMemberRecord,
  deactivateMemberRecord,
  reactivateMemberRecord,
  updateManagerSummaryRecord,
  updateMemberRecord,
} from "@/server/members"

/**
 * Server Actions de pessoas do time: requireWriteContext → núcleo em
 * src/server/members.ts (zod + transação + MemberChange + timeline + auditoria)
 * → revalidatePath.
 */

export async function createMember(input: unknown): Promise<ActionResult> {
  return runAction("members", async () => createMemberRecord(await requireWriteContext(), input), ["/team"])
}

export async function updateMember(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("members", async () => updateMemberRecord(await requireWriteContext(), input), ["/team", [`/team/${id}`, "layout"]])
}

export async function deactivateMember(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("members", async () => deactivateMemberRecord(await requireWriteContext(), input), ["/team", [`/team/${id}`, "layout"]])
}

export async function updateManagerSummary(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("members", async () => updateManagerSummaryRecord(await requireWriteContext(), input), [`/team/${id}`])
}

export async function reactivateMember(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("members", async () => reactivateMemberRecord(await requireWriteContext(), input), ["/team", [`/team/${id}`, "layout"]])
}
