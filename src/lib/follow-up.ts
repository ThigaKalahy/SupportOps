import { deadlineSeverity, type DeadlineSeverity } from "./severity.ts"

/**
 * Follow-up de 1:1 (próxima revisão) e de feedback (follow-up). O modelo não
 * tem campo "feito"; a conversa seguinte é o que encerra a pendência:
 *
 * - 1:1: a revisão marcada fica pendente até existir um 1:1 posterior da
 *   mesma pessoa (mesma regra do "próximo acompanhamento" do perfil).
 * - Feedback: o follow-up fica pendente até existir um 1:1 ou feedback da
 *   mesma pessoa na data do follow-up ou depois.
 *
 * Só contam registros que quem consulta pode ler: para o VIEWER, um 1:1
 * privado não encerra pendência (senão a tela revelaria que ele existe).
 */

export type FollowUpState =
  | { status: "none" }
  | { status: "done"; date: Date; resolvedAt: Date }
  | { status: "pending"; date: Date; deadline: DeadlineSeverity }

export interface ConversationDate {
  kind: "oneOnOne" | "feedback"
  date: Date
}

export function oneOnOneFollowUp(
  record: { date: Date; nextReviewAt: Date | null },
  laterConversations: ConversationDate[],
  today: Date,
): FollowUpState {
  if (!record.nextReviewAt) return { status: "none" }
  const next = laterConversations
    .filter((c) => c.kind === "oneOnOne" && c.date.getTime() > record.date.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]
  if (next) return { status: "done", date: record.nextReviewAt, resolvedAt: next.date }
  return { status: "pending", date: record.nextReviewAt, deadline: deadlineSeverity(record.nextReviewAt, { today }) }
}

export function feedbackFollowUp(
  record: { id: string; followUpAt: Date | null },
  conversations: (ConversationDate & { id: string })[],
  today: Date,
): FollowUpState {
  if (!record.followUpAt) return { status: "none" }
  const due = record.followUpAt.getTime()
  const next = conversations
    .filter((c) => c.id !== record.id && c.date.getTime() >= due)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]
  if (next) return { status: "done", date: record.followUpAt, resolvedAt: next.date }
  return { status: "pending", date: record.followUpAt, deadline: deadlineSeverity(record.followUpAt, { today }) }
}
