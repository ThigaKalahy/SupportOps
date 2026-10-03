import type {
  AgreementOrigin,
  FeedbackCategory,
  MemberChangeType,
  Prisma,
  TimelineEventType,
  Visibility,
} from "@prisma/client"

// Import relativo com extensão: este arquivo também roda no Node puro (seed).
import { businessDateAtNoon } from "../lib/dates.ts"
import { fill, labels, plural } from "../lib/labels.ts"

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
 *
 * occurredAt é `timestamptz`. Registros datados por dia (1:1, feedback, daily,
 * conclusão de combinado) entram como meio-dia em São Paulo daquele dia
 * (`businessDateAtNoon`); os demais recebem o instante real.
 */

/**
 * Transação do cliente base ou do cliente com extensão (`db`): tipo estrutural
 * de propósito, porque os dois têm tipos de transação diferentes no Prisma.
 */
type Tx = {
  timelineEvent: {
    createMany(args: { data: Prisma.TimelineEventCreateManyInput[] }): Promise<unknown>
    updateMany(args: { where: Prisma.TimelineEventWhereInput; data: Prisma.TimelineEventUpdateManyMutationInput }): Promise<unknown>
    deleteMany(args: { where: Prisma.TimelineEventWhereInput }): Promise<unknown>
  }
}

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

/**
 * Edição de um registro: troca as linhas de um tipo daquela origem pelas novas
 * (ex.: as linhas DAILY de uma daily editada — pode sumir ou surgir gente).
 */
export async function replaceTimelineEvents(
  tx: Tx,
  source: TimelineSource,
  type: TimelineEventType,
  inputs: TimelineEventInput[],
): Promise<void> {
  await tx.timelineEvent.deleteMany({ where: { [SOURCE_COLUMN[source.kind]]: source.id, type } })
  await recordTimelineEvents(tx, inputs)
}

/**
 * Edição de um registro de linha única (1:1, feedback, anotação): refaz todas
 * as linhas daquela origem — data, título, tipo e visibilidade podem mudar.
 */
export async function rebuildTimelineEvents(tx: Tx, source: TimelineSource, inputs: TimelineEventInput[]): Promise<void> {
  await tx.timelineEvent.deleteMany({ where: { [SOURCE_COLUMN[source.kind]]: source.id } })
  await recordTimelineEvents(tx, inputs)
}

/** Registro excluído (soft delete): as linhas-espelho saem da timeline. */
export async function removeTimelineEvents(tx: Tx, source: TimelineSource): Promise<void> {
  await tx.timelineEvent.deleteMany({ where: { [SOURCE_COLUMN[source.kind]]: source.id } })
}

/**
 * Edição de um PDI: só a linha de criação (sem tag) acompanha o texto novo —
 * acompanhamentos e conclusão registraram o objetivo como era naquele dia.
 */
export async function syncPlanCreatedEvent(tx: Tx, planId: string, content: { title: string; summary: string }): Promise<void> {
  await tx.timelineEvent.updateMany({
    where: { developmentPlanId: planId, type: "DEVELOPMENT", tags: { isEmpty: true } },
    data: { title: clip(content.title), summary: content.summary },
  })
}

/** Edição do texto de um registro: título e resumo de todas as linhas dele. */
export async function syncTimelineContent(
  tx: Tx,
  source: TimelineSource,
  content: { title: string; summary?: string | null },
  type?: TimelineEventType,
): Promise<void> {
  await tx.timelineEvent.updateMany({
    where: { [SOURCE_COLUMN[source.kind]]: source.id, ...(type ? { type } : {}) },
    data: { title: clip(content.title), ...(content.summary === undefined ? {} : { summary: content.summary }) },
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
  /** Desfechos dos combinados da pessoa revisados nesta daily. */
  reviewed?: { DONE: number; PARTIAL: number; NOT_DONE: number }
}

/** "Revisão de 3 combinados: 2 feitos, 1 parcial". */
export function dailyReviewText(reviewed: { DONE: number; PARTIAL: number; NOT_DONE: number }): string | null {
  const parts = labels.timeline.dailyReviewParts
  const total = reviewed.DONE + reviewed.PARTIAL + reviewed.NOT_DONE
  if (total === 0) return null
  const detail = [
    reviewed.DONE ? fill(reviewed.DONE === 1 ? parts.done : parts.doneMany, { count: reviewed.DONE }) : null,
    reviewed.PARTIAL ? fill(reviewed.PARTIAL === 1 ? parts.partial : parts.partialMany, { count: reviewed.PARTIAL }) : null,
    reviewed.NOT_DONE ? fill(reviewed.NOT_DONE === 1 ? parts.notDone : parts.notDoneMany, { count: reviewed.NOT_DONE }) : null,
  ]
    .filter(Boolean)
    .join(", ")
  return plural(labels.timeline.dailyReview, total, { detail })
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
      occurredAt: businessDateAtNoon(a.completedAt),
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
      occurredAt: businessDateAtNoon(o.date),
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
      occurredAt: businessDateAtNoon(f.date),
      type: f.category === "RECOGNITION" ? "RECOGNITION" : "FEEDBACK",
      title: f.behavior,
      summary: f.impact,
      authorUserId: f.authorUserId,
      visibility: f.visibility,
      tags: [f.category.toLowerCase()],
      source: { kind: "feedback", id: f.id },
    }
  },

  /**
   * Uma linha por pessoa que teve nota, impeditivo ou combinado revisado na
   * daily. Presença simples não vira evento — presença não é fato de prontuário.
   */
  dailyParticipation(p: DailyParticipationLike): TimelineEventInput | null {
    const review = p.reviewed ? dailyReviewText(p.reviewed) : null
    const title = p.note ?? p.blocker ?? review
    if (!title) return null
    const rest = [p.note ? p.blocker : null, title === review ? null : review].filter(Boolean).join(" · ")
    return {
      memberId: p.memberId,
      occurredAt: businessDateAtNoon(p.date),
      type: "DAILY",
      title,
      summary: rest || null,
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
      // startedAt é data de negócio: meio-dia em São Paulo (meia-noite UTC cairia no dia anterior).
      occurredAt: businessDateAtNoon(p.startedAt),
      type: "DEVELOPMENT",
      title: p.objective,
      summary: p.currentSituation,
      authorUserId: p.authorUserId,
      visibility: "SHARED",
      source: { kind: "developmentPlan", id: p.id },
    }
  },

  /** Acompanhamento de PDI: o que mudou desde o último, no instante do registro. */
  developmentReview(p: { id: string; memberId: string; objective: string; note: string; reviewedAt: Date; authorUserId: string }): TimelineEventInput {
    return {
      memberId: p.memberId,
      occurredAt: p.reviewedAt,
      type: "DEVELOPMENT",
      title: fill(labels.timeline.planReview, { objective: p.objective }),
      summary: p.note,
      authorUserId: p.authorUserId,
      visibility: "SHARED",
      tags: ["acompanhamento"],
      source: { kind: "developmentPlan", id: p.id },
    }
  },

  /** PDI concluído (data de negócio da conclusão). */
  developmentDone(p: { id: string; memberId: string; objective: string; completedAt: Date; authorUserId: string }): TimelineEventInput {
    return {
      memberId: p.memberId,
      occurredAt: businessDateAtNoon(p.completedAt),
      type: "DEVELOPMENT",
      title: fill(labels.timeline.planDone, { objective: p.objective }),
      summary: null,
      authorUserId: p.authorUserId,
      visibility: "SHARED",
      tags: ["concluido"],
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
