import type {
  AgreementOrigin,
  FeedbackCategory,
  MemberChangeType,
  Prisma,
  TimelineEventType,
  Visibility,
} from "@prisma/client"

// Import relativo com extensão: este arquivo também roda no Node puro (seed).
import { fill, labels } from "../lib/labels.ts"

/**
 * ÚNICO lugar do código que escreve em TimelineEvent (D2, CLAUDE.md).
 *
 * TimelineEvent é índice denormalizado: cada linha espelha um registro
 * concreto e é escrita na MESMA transação que ele. Server Actions e o seed
 * montam a linha com os construtores `timelineEventFor.*` e gravam com
 * `recordTimelineEvents(tx, ...)` — nunca com `tx.timelineEvent` direto.
 *
 * Visibilidade: a linha SEMPRE espelha a do registro de origem. Registros sem
 * campo de visibilidade (combinado, daily, PDI, mudança de carreira) não são
 * privados por modelo e geram linha SHARED. Ao mudar a visibilidade de um
 * 1:1, feedback ou anotação, chame `syncTimelineVisibility` na mesma transação.
 *
 * Não geram linha: PriorityValidation (D15), métricas e score (D5),
 * AgreementCheckin (o arrasto aparece no próprio combinado).
 */

type Tx = Prisma.TransactionClient

export type TimelineSource =
  | { kind: "agreement"; id: string }
  | { kind: "oneOnOne"; id: string }
  | { kind: "feedback"; id: string }
  | { kind: "daily"; id: string }
  | { kind: "note"; id: string }
  | { kind: "developmentPlan"; id: string }
  | { kind: "memberChange"; id: string }

const SOURCE_COLUMN = {
  agreement: "agreementId",
  oneOnOne: "oneOnOneId",
  feedback: "feedbackId",
  daily: "dailyId",
  note: "noteId",
  developmentPlan: "developmentPlanId",
  memberChange: "memberChangeId",
} as const satisfies Record<TimelineSource["kind"], keyof Prisma.TimelineEventUncheckedCreateInput>

export interface TimelineEventInput {
  memberId: string
  occurredAt: Date
  type: TimelineEventType
  title: string
  summary?: string | null
  authorUserId: string
  visibility: Visibility
  tags?: string[]
  source: TimelineSource
}

const TITLE_MAX = 160

function clip(text: string): string {
  const firstLine = text.split("\n")[0]?.trim() ?? ""
  return firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1)}…` : firstLine
}

function toRow(input: TimelineEventInput): Prisma.TimelineEventCreateManyInput {
  return {
    memberId: input.memberId,
    occurredAt: input.occurredAt,
    type: input.type,
    title: clip(input.title),
    summary: input.summary ?? null,
    authorUserId: input.authorUserId,
    visibility: input.visibility,
    tags: input.tags ?? [],
    [SOURCE_COLUMN[input.source.kind]]: input.source.id,
  }
}

/** Grava linhas da timeline. Chamar dentro da transação que grava a origem. */
export async function recordTimelineEvents(tx: Tx, inputs: TimelineEventInput[]): Promise<void> {
  if (inputs.length === 0) return
  await tx.timelineEvent.createMany({ data: inputs.map(toRow) })
}

/** Propaga a visibilidade do registro de origem para todas as linhas dele. */
export async function syncTimelineVisibility(tx: Tx, source: TimelineSource, visibility: Visibility): Promise<void> {
  await tx.timelineEvent.updateMany({
    where: { [SOURCE_COLUMN[source.kind]]: source.id },
    data: { visibility },
  })
}

/* ───────────────────── Construtores por tipo de registro ───────────────────── */

interface AgreementLike {
  id: string
  memberId: string
  title: string
  description: string | null
  origin: AgreementOrigin
  createdAt: Date
  completedAt: Date | null
  outcome: string | null
  authorUserId: string
}

interface OneOnOneLike {
  id: string
  memberId: string
  date: Date
  topics: string | null
  managerPerception: string | null
  visibility: Visibility
  authorUserId: string
}

interface FeedbackLike {
  id: string
  memberId: string
  date: Date
  category: FeedbackCategory
  behavior: string
  impact: string | null
  visibility: Visibility
  authorUserId: string
}

interface DailyParticipationLike {
  dailyId: string
  memberId: string
  date: Date
  note: string | null
  blocker: string | null
  authorUserId: string
}

interface NoteLike {
  id: string
  memberId: string
  occurredAt: Date
  title: string
  body: string
  visibility: Visibility
  authorUserId: string
}

interface DevelopmentPlanLike {
  id: string
  memberId: string
  startedAt: Date
  objective: string
  currentSituation: string
  authorUserId: string
}

interface MemberChangeLike {
  id: string
  memberId: string
  changeType: MemberChangeType
  effectiveAt: Date
  reason: string
  authorUserId: string
  /** Rótulos legíveis dos valores (ex.: "Pleno", "Sênior"). */
  fromLabel: string | null
  toLabel: string
}

export const timelineEventFor = {
  agreementCreated(a: AgreementLike): TimelineEventInput {
    return {
      memberId: a.memberId,
      occurredAt: a.createdAt,
      type: "AGREEMENT",
      title: a.title,
      summary: a.description,
      authorUserId: a.authorUserId,
      visibility: "SHARED",
      tags: [a.origin.toLowerCase()],
      source: { kind: "agreement", id: a.id },
    }
  },

  /** Só para combinado com completedAt (data de negócio da conclusão). */
  agreementDone(a: AgreementLike & { completedAt: Date }): TimelineEventInput {
    return {
      memberId: a.memberId,
      occurredAt: a.completedAt,
      type: "AGREEMENT_DONE",
      title: a.title,
      summary: a.outcome,
      authorUserId: a.authorUserId,
      visibility: "SHARED",
      tags: [a.origin.toLowerCase()],
      source: { kind: "agreement", id: a.id },
    }
  },

  oneOnOne(o: OneOnOneLike): TimelineEventInput {
    return {
      memberId: o.memberId,
      occurredAt: o.date,
      type: "ONE_ON_ONE",
      title: o.topics ?? labels.timeline.oneOnOneFallback,
      summary: o.managerPerception,
      authorUserId: o.authorUserId,
      visibility: o.visibility,
      source: { kind: "oneOnOne", id: o.id },
    }
  },

  feedback(f: FeedbackLike): TimelineEventInput {
    return {
      memberId: f.memberId,
      occurredAt: f.date,
      type: f.category === "RECOGNITION" ? "RECOGNITION" : "FEEDBACK",
      title: f.behavior,
      summary: f.impact,
      authorUserId: f.authorUserId,
      visibility: f.visibility,
      tags: [f.category.toLowerCase()],
      source: { kind: "feedback", id: f.id },
    }
  },

  /** Uma linha por participante com nota ou impeditivo; presença simples não vira evento. */
  dailyParticipation(p: DailyParticipationLike): TimelineEventInput | null {
    const title = p.note ?? p.blocker
    if (!title) return null
    return {
      memberId: p.memberId,
      occurredAt: p.date,
      type: "DAILY",
      title,
      summary: p.note ? p.blocker : null,
      authorUserId: p.authorUserId,
      visibility: "SHARED",
      tags: p.blocker ? ["impeditivo"] : [],
      source: { kind: "daily", id: p.dailyId },
    }
  },

  note(n: NoteLike): TimelineEventInput {
    return {
      memberId: n.memberId,
      occurredAt: n.occurredAt,
      type: "NOTE",
      title: n.title,
      summary: n.body,
      authorUserId: n.authorUserId,
      visibility: n.visibility,
      source: { kind: "note", id: n.id },
    }
  },

  developmentPlan(p: DevelopmentPlanLike): TimelineEventInput {
    return {
      memberId: p.memberId,
      occurredAt: p.startedAt,
      type: "DEVELOPMENT",
      title: p.objective,
      summary: p.currentSituation,
      authorUserId: p.authorUserId,
      visibility: "SHARED",
      source: { kind: "developmentPlan", id: p.id },
    }
  },

  memberChange(c: MemberChangeLike): TimelineEventInput {
    return {
      memberId: c.memberId,
      occurredAt: c.effectiveAt,
      type: c.changeType === "SENIORITY" ? "SENIORITY_CHANGE" : "ROLE_CHANGE",
      title: fill(labels.timeline.memberChange, { from: c.fromLabel ?? "—", to: c.toLabel }),
      summary: c.reason,
      authorUserId: c.authorUserId,
      visibility: "SHARED",
      tags: [c.changeType.toLowerCase()],
      source: { kind: "memberChange", id: c.id },
    }
  },
}
