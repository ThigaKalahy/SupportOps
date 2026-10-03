"use server"

import type { ActionResult } from "@/lib/validators/fields"
import { requireOwner, requireUser } from "@/server/access"
import { memberIdOf, runAction } from "@/server/action-runner"
import { findEditableRecord, getOneOnOneContext, type EditableKind, type OneOnOneContext } from "@/server/queries/records"
import { formatDate } from "@/lib/dates"
import type { FeedbackInput, NoteInput, OneOnOneInput } from "@/lib/validators/records"
import {
  createFeedbackRecord,
  createNoteRecord,
  createOneOnOneRecord,
  deleteRecordRecord,
  setRecordVisibilityRecord,
  updateFeedbackRecord,
  updateNoteRecord,
  updateOneOnOneRecord,
} from "@/server/records"

/**
 * Server Actions de 1:1, feedback e anotação: requireOwner → núcleo em
 * src/server/records.ts (zod + transação + timeline + auditoria) → revalidate.
 */

function paths(input: unknown): (string | [string, "layout"])[] {
  return ["/team", "/records", "/agreements", [`/team/${memberIdOf(input)}`, "layout"]]
}

export async function createOneOnOne(input: unknown): Promise<ActionResult> {
  return runAction("records", async () => createOneOnOneRecord(await requireOwner(), input), paths(input))
}

export async function createFeedback(input: unknown): Promise<ActionResult> {
  return runAction("records", async () => createFeedbackRecord(await requireOwner(), input), paths(input))
}

export async function createNote(input: unknown): Promise<ActionResult> {
  return runAction("records", async () => createNoteRecord(await requireOwner(), input), paths(input))
}

/** Alterna privado/compartilhado a partir da timeline. `memberId` só serve para revalidar o perfil. */
export async function setRecordVisibility(input: unknown, memberId: string): Promise<ActionResult> {
  return runAction("records", async () => setRecordVisibilityRecord(await requireOwner(), input), [
    "/team",
    [`/team/${memberId}`, "layout"],
  ])
}

/**
 * Painel de contexto do 1:1 (somente leitura), carregado quando o formulário
 * abre. É leitura — passa pela query com visibilityFilter; existe como Server
 * Action só porque o dialog é aberto no cliente. Sem rota de API (D8).
 */
export async function loadOneOnOneContext(memberId: string): Promise<OneOnOneContext> {
  return getOneOnOneContext(await requireUser(), memberId)
}

export async function updateOneOnOne(id: string, input: unknown): Promise<ActionResult> {
  return runAction("records", async () => updateOneOnOneRecord(await requireOwner(), id, input), paths(input))
}

export async function updateFeedback(id: string, input: unknown): Promise<ActionResult> {
  return runAction("records", async () => updateFeedbackRecord(await requireOwner(), id, input), paths(input))
}

export async function updateNote(id: string, input: unknown): Promise<ActionResult> {
  return runAction("records", async () => updateNoteRecord(await requireOwner(), id, input), paths(input))
}

/** Exclusão lógica. `memberId` só serve para revalidar o perfil. */
export async function deleteRecord(input: unknown, memberId: string): Promise<ActionResult> {
  return runAction("records", async () => deleteRecordRecord(await requireOwner(), input), paths({ memberId }))
}

const d = (date: Date | null) => (date ? formatDate(date, "business") : "")

export type RecordForEdit =
  | { kind: "oneOnOne"; id: string; member: { id: string; preferredName: string }; values: OneOnOneInput }
  | { kind: "feedback"; id: string; member: { id: string; preferredName: string }; values: FeedbackInput }
  | { kind: "note"; id: string; member: { id: string; preferredName: string }; values: NoteInput }

/**
 * Valores de um registro para o formulário de edição (leitura, com a mesma
 * query de visibilidade). Só para quem escreve.
 */
export async function loadRecordForEdit(kind: EditableKind, id: string): Promise<RecordForEdit | null> {
  const found = await findEditableRecord(await requireOwner(), kind, id)
  if (!found) return null
  const member = found.record.member
  if (found.kind === "oneOnOne") {
    const r = found.record
    return {
      kind: "oneOnOne",
      id,
      member,
      values: {
        memberId: r.memberId,
        date: d(r.date),
        topics: r.topics ?? "",
        durationMinutes: r.durationMinutes ? String(r.durationMinutes) : "",
        memberPerception: r.memberPerception ?? "",
        managerPerception: r.managerPerception ?? "",
        wins: r.wins ?? "",
        difficulties: r.difficulties ?? "",
        development: r.development ?? "",
        nextReviewAt: d(r.nextReviewAt),
        visibility: r.visibility,
        agreements: [],
      },
    }
  }
  if (found.kind === "feedback") {
    const r = found.record
    return {
      kind: "feedback",
      id,
      member,
      values: {
        memberId: r.memberId,
        date: d(r.date),
        category: r.category,
        context: r.context ?? "",
        behavior: r.behavior,
        impact: r.impact ?? "",
        guidance: r.guidance ?? "",
        followUpAt: d(r.followUpAt),
        visibility: r.visibility,
        agreements: [],
      },
    }
  }
  const r = found.record
  return {
    kind: "note",
    id,
    member,
    values: { memberId: r.memberId, date: formatDate(r.occurredAt), title: r.title, body: r.body, visibility: r.visibility },
  }
}
