import type { Prisma } from "@prisma/client"

import { db } from "../db.ts"
import { memberScope, visibilityFilter, type Viewer } from "../visibility.ts"

/**
 * Leituras de registros sensíveis: OneOnOne, Feedback, Note e TimelineEvent.
 *
 * Toda leitura desses quatro models no produto vive em src/server/queries e
 * aplica `visibilityFilter(viewer)` — VIEWER nunca recebe PRIVATE. Timeline,
 * busca, command palette e contadores usam estas funções (ou novas funções
 * aqui, com o mesmo filtro). tests/visibility.test.ts reprova qualquer leitura
 * fora deste padrão.
 */

export const TIMELINE_PAGE_SIZE = 40

/** Timeline de uma pessoa, mais recente primeiro, paginada por cursor. */
export function getMemberTimeline(viewer: Viewer, memberId: string, options: { cursor?: string; take?: number } = {}) {
  return db.timelineEvent.findMany({
    where: { memberId, member: memberScope(viewer), ...visibilityFilter(viewer) },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: options.take ?? TIMELINE_PAGE_SIZE,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  })
}

/** Busca textual nos registros (título e resumo das linhas da timeline). */
export function searchRecords(viewer: Viewer, term: string, take = 20) {
  const text = term.trim()
  if (!text) return Promise.resolve([])
  return db.timelineEvent.findMany({
    where: {
      member: memberScope(viewer),
      ...visibilityFilter(viewer),
      OR: [{ title: { contains: text, mode: "insensitive" } }, { summary: { contains: text, mode: "insensitive" } }],
    },
    orderBy: { occurredAt: "desc" },
    take,
  })
}

/** Contagem de registros por pessoa (contadores e indicadores de volume). */
export async function countRecordsByMember(viewer: Viewer, where: Prisma.TimelineEventWhereInput = {}) {
  const rows = await db.timelineEvent.groupBy({
    by: ["memberId"],
    where: { ...where, member: memberScope(viewer), ...visibilityFilter(viewer) },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.memberId, r._count._all]))
}

export function listOneOnOnes(viewer: Viewer, memberId: string) {
  return db.oneOnOne.findMany({
    where: { memberId, member: memberScope(viewer), ...visibilityFilter(viewer) },
    orderBy: { date: "desc" },
  })
}

export function listFeedbacks(viewer: Viewer, memberId: string) {
  return db.feedback.findMany({
    where: { memberId, member: memberScope(viewer), ...visibilityFilter(viewer) },
    orderBy: { date: "desc" },
  })
}

export function listNotes(viewer: Viewer, memberId: string) {
  return db.note.findMany({
    where: { memberId, member: memberScope(viewer), ...visibilityFilter(viewer) },
    orderBy: { occurredAt: "desc" },
  })
}

/**
 * Origem de uma linha da timeline cuja visibilidade pode ser alternada
 * (1:1, feedback ou anotação), para a escrita em src/server/records.ts.
 * null quando a linha não existe, está fora do escopo ou não tem
 * visibilidade própria (combinado, daily, PDI, mudança de carreira).
 */
export async function findToggleableSource(viewer: Viewer, eventId: string) {
  const event = await db.timelineEvent.findFirst({
    where: { id: eventId, member: memberScope(viewer), ...visibilityFilter(viewer) },
    select: { memberId: true, visibility: true, oneOnOneId: true, feedbackId: true, noteId: true },
  })
  if (!event) return null
  const source = event.oneOnOneId
    ? ({ kind: "oneOnOne", id: event.oneOnOneId } as const)
    : event.feedbackId
      ? ({ kind: "feedback", id: event.feedbackId } as const)
      : event.noteId
        ? ({ kind: "note", id: event.noteId } as const)
        : null
  return source ? { source, memberId: event.memberId, visibility: event.visibility } : null
}
