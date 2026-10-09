"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireWriteContext } from "@/server/scope"
import { memberIdOf, runAction } from "@/server/action-runner"
import {
  addPlanActionRecord,
  archiveTraitRecord,
  createMentorshipRecord,
  createPlanRecord,
  endMentorshipRecord,
  updatePlanRecord,
  createTraitRecord,
  reviewPlanRecord,
  setActionStatusRecord,
  setExpectationRecord,
  setPlanStatusRecord,
} from "@/server/development"

/**
 * Server Actions de desenvolvimento: requireWriteContext → núcleo em
 * src/server/development.ts (zod + transação + timeline + auditoria) →
 * revalidate do perfil, de /development e de /team (alerta de PDI parado).
 */

const PATHS: (string | [string, "layout"])[] = ["/development", ["/team", "layout"]]

export async function createPlan(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => createPlanRecord(await requireWriteContext(), input), [
    ...PATHS,
    [`/team/${memberIdOf(input)}`, "layout"],
  ])
}

export async function reviewPlan(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => reviewPlanRecord(await requireWriteContext(), input), PATHS)
}

export async function setPlanStatus(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => setPlanStatusRecord(await requireWriteContext(), input), PATHS)
}

export async function setActionStatus(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => setActionStatusRecord(await requireWriteContext(), input), PATHS)
}

export async function createTrait(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => createTraitRecord(await requireWriteContext(), input), PATHS)
}

export async function archiveTrait(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => archiveTraitRecord(await requireWriteContext(), input), PATHS)
}

export async function setExpectation(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => setExpectationRecord(await requireWriteContext(), input), [
    ...PATHS,
    ["/settings", "layout"],
  ])
}

export async function updatePlan(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => updatePlanRecord(await requireWriteContext(), input), PATHS)
}

export async function addPlanAction(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => addPlanActionRecord(await requireWriteContext(), input), PATHS)
}

export async function createMentorship(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => createMentorshipRecord(await requireWriteContext(), input), PATHS)
}

export async function endMentorship(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => endMentorshipRecord(await requireWriteContext(), input), PATHS)
}
