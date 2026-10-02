"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireOwner } from "@/server/access"
import { memberIdOf, runAction } from "@/server/action-runner"
import {
  archiveTraitRecord,
  createPlanRecord,
  createTraitRecord,
  reviewPlanRecord,
  setActionStatusRecord,
  setExpectationRecord,
  setPlanStatusRecord,
} from "@/server/development"

/**
 * Server Actions de desenvolvimento: requireOwner → núcleo em
 * src/server/development.ts (zod + transação + timeline + auditoria) →
 * revalidate do perfil, de /development e de /team (alerta de PDI parado).
 */

const PATHS: (string | [string, "layout"])[] = ["/development", ["/team", "layout"]]

export async function createPlan(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => createPlanRecord(await requireOwner(), input), [
    ...PATHS,
    [`/team/${memberIdOf(input)}`, "layout"],
  ])
}

export async function reviewPlan(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => reviewPlanRecord(await requireOwner(), input), PATHS)
}

export async function setPlanStatus(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => setPlanStatusRecord(await requireOwner(), input), PATHS)
}

export async function setActionStatus(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => setActionStatusRecord(await requireOwner(), input), PATHS)
}

export async function createTrait(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => createTraitRecord(await requireOwner(), input), PATHS)
}

export async function archiveTrait(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => archiveTraitRecord(await requireOwner(), input), PATHS)
}

export async function setExpectation(input: unknown): Promise<ActionResult> {
  return runAction("development", async () => setExpectationRecord(await requireOwner(), input), [
    ...PATHS,
    ["/settings", "layout"],
  ])
}
