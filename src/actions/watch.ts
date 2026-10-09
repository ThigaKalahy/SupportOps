"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireOwner, requireUser } from "@/server/access"
import { runAction } from "@/server/action-runner"
import { getThresholds } from "@/server/queries/thresholds"
import { getWatchItem, type WatchDetail } from "@/server/queries/watch"
import {
  archiveWatchItemRecord,
  changeWatchHeatRecord,
  createWatchItemRecord,
  resolveWatchItemRecord,
  reviewWatchItemRecord,
  setWatchVisibilityRecord,
} from "@/server/watch"

/**
 * Server Actions de "Em observação" (P21): requireOwner → núcleo em
 * src/server/watch.ts (zod + transação + auditoria + timeline só com pessoa).
 */

const PATHS: (string | [string, "layout"])[] = ["/watch", ["/", "layout"], ["/team", "layout"]]

/**
 * Criar não revalida: o WatchButton vive dentro de formulários (daily, 1:1,
 * validação) e revalidar a rota atual recarregaria as props deles no meio do
 * preenchimento. As páginas que listam observações são dinâmicas.
 */
export async function createWatch(input: unknown) {
  return runAction("watch", async () => createWatchItemRecord(await requireOwner(), input), [])
}

export async function reviewWatch(input: unknown): Promise<ActionResult> {
  return runAction("watch", async () => reviewWatchItemRecord(await requireOwner(), input), PATHS)
}

export async function changeWatchHeat(input: unknown) {
  return runAction("watch", async () => changeWatchHeatRecord(await requireOwner(), input), PATHS)
}

export async function resolveWatch(input: unknown): Promise<ActionResult> {
  return runAction("watch", async () => resolveWatchItemRecord(await requireOwner(), input), PATHS)
}

export async function archiveWatch(input: unknown): Promise<ActionResult> {
  return runAction("watch", async () => archiveWatchItemRecord(await requireOwner(), input), PATHS)
}

export async function setWatchVisibility(input: unknown): Promise<ActionResult> {
  return runAction("watch", async () => setWatchVisibilityRecord(await requireOwner(), input), PATHS)
}

/** Leitura: a observação com o histórico de revisões (painel lateral de /watch). */
export async function loadWatchItem(id: string): Promise<WatchDetail | null> {
  if (typeof id !== "string" || !id) return null
  const user = await requireUser()
  return getWatchItem(user, id, await getThresholds(user))
}
