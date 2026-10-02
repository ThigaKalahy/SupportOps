"use server"

import { revalidatePath } from "next/cache"

import { labels } from "@/lib/labels"
import type { ActionResult } from "@/lib/validators/member"
import { ForbiddenError, requireOwner } from "@/server/access"
import { createMemberRecord, deactivateMemberRecord, updateMemberRecord } from "@/server/members"

/**
 * Server Actions de pessoas do time: requireOwner → núcleo em
 * src/server/members.ts (zod + transação + MemberChange + timeline + auditoria)
 * → revalidatePath.
 */

async function run(write: () => Promise<ActionResult>, paths: string[]): Promise<ActionResult> {
  try {
    const result = await write()
    if (result.ok) for (const path of paths) revalidatePath(path)
    return result
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message }
    console.error("[members] falha ao salvar", error)
    return { ok: false, error: labels.validation.generic }
  }
}

export async function createMember(input: unknown): Promise<ActionResult> {
  return run(async () => createMemberRecord(await requireOwner(), input), ["/team"])
}

export async function updateMember(input: unknown): Promise<ActionResult> {
  const id = typeof input === "object" && input !== null && "id" in input ? String(input.id) : ""
  return run(async () => updateMemberRecord(await requireOwner(), input), ["/team", `/team/${id}`])
}

export async function deactivateMember(input: unknown): Promise<ActionResult> {
  return run(async () => deactivateMemberRecord(await requireOwner(), input), ["/team"])
}
