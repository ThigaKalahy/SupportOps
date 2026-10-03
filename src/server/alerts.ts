import { makeRate, makeTrend, percent, type Rate, type Trend } from "../lib/adherence.ts"
import { DEFAULT_THRESHOLDS, oneOnOneLimit, type AlertThresholds } from "../lib/alert-thresholds.ts"
import { businessDaysBetween, isBusinessDay, todayBusinessDate, toSaoPaulo } from "../lib/dates.ts"
import { PLAN_REVIEW_THRESHOLDS } from "../lib/development.ts"
import { fill, labels, plural } from "../lib/labels.ts"
import { ageSeverity, deadlineSeverity, type Severity } from "../lib/severity.ts"

import { getAlertFacts, type AlertFacts } from "./queries/alerts.ts"
import { getThresholds } from "./queries/thresholds.ts"
import type { Viewer } from "./visibility.ts"

/**
 * Motor de alertas — DERIVADO em query, nunca persistido (D9). Só os
 * limiares ficam no banco (AlertThreshold, editáveis em /settings).
 *
 * - `getAlerts(viewer, teamId?)`: a lista única da home ("quem precisa da
 *   minha atenção hoje?"), ordenada por urgência real, e os contadores da
 *   sidebar — a mesma fonte para os dois.
 * - `deriveAlerts(facts, today, t)`: a regra, pura e testável.
 * - `memberAttention`: o resumo por pessoa da coluna de atenção de /team e do
 *   cabeçalho do perfil (fatos agregados numa consulta só, em
 *   src/server/queries/members.ts), com os mesmos limiares.
 *
 * Os dez alertas (tabela do P15): combinado vencido, vencendo, crônico, sem
 * 1:1 há muito tempo, silêncio gerencial, PDI parado, follow-up de feedback
 * vencido, daily não registrada, cumprimento em queda e prontidão — este
 * último informativo, nunca automático: não conta nos contadores e vai para o
 * fim da lista.
 */

/* ───────────────────────── Atenção por pessoa (/team, perfil) ───────────────────────── */

export interface MemberFacts {
  seniorityKey: string
  seniorityLabel: string
  joinedAt: Date
  /** Último 1:1 VISÍVEL para quem consulta (VIEWER não conta 1:1 privado). */
  lastOneOnOne: Date | null
  overdueAgreements: number
  oldestOverdueDue: Date | null
  dueSoonAgreements: number
  chronicAgreements: number
  /** Data do acompanhamento mais antigo entre os PDIs ativos (ou início, se nunca acompanhado). */
  oldestPlanReview: Date | null
  /** Combinados devidos e cumpridos no prazo nas duas janelas de 30 dias (tendência). */
  adherenceWindows?: {
    current: { due: number; onTime: number }
    previous: { due: number; onTime: number }
  }
}

export interface AttentionReason {
  severity: Severity
  strong: boolean
  text: string
}

export interface MemberAttention {
  severity: Severity
  strong: boolean
  reasons: AttentionReason[]
}

/** Ordem de gravidade: vermelho > laranja > âmbar > neutro > calmo. */
function weight(r: { severity: Severity; strong: boolean }): number {
  if (r.severity === "overdue") return 4
  if (r.severity === "attention") return r.strong ? 3 : 2
  if (r.severity === "neutral") return 1
  return 0
}

/**
 * Cadência de 1:1: referência de dias por senioridade e a severidade de
 * quantos dias se passaram. Acima da referência: atenção; acima de 1,5x:
 * atenção forte; acima do dobro: vencido. Usada pelo alerta e pelo perfil.
 */
export function oneOnOneCadence(
  seniorityKey: string,
  days: number,
  t: AlertThresholds = DEFAULT_THRESHOLDS,
): { limit: number; severity: Severity; strong: boolean } {
  const limit = oneOnOneLimit(t, seniorityKey)
  if (days <= limit) return { limit, severity: "neutral", strong: false }
  return { limit, severity: days > limit * 2 ? "overdue" : "attention", strong: days > limit * 1.5 }
}

/**
 * "Cumprimento em queda": a taxa no prazo dos últimos 30 dias caiu
 * `adherenceDropPoints` ou mais em relação aos 30 anteriores, com pelo menos
 * `adherenceMinSample` combinados devidos em CADA janela.
 */
export function isAdherenceDropping(trend: Pick<Trend, "current" | "previous" | "deltaPoints">, t: AlertThresholds = DEFAULT_THRESHOLDS): boolean {
  return (
    trend.current.denominator >= t.adherenceMinSample &&
    trend.previous.denominator >= t.adherenceMinSample &&
    trend.deltaPoints !== null &&
    trend.deltaPoints <= -t.adherenceDropPoints
  )
}

function dropText(current: Rate, previous: Rate): string {
  return fill(labels.attention.adherenceDrop, {
    previous: percent(previous) ?? 0,
    current: percent(current) ?? 0,
    previousTotal: previous.denominator,
    currentTotal: current.denominator,
  })
}

/** "Cumprimento em queda" como motivo de atenção: null se não caiu o bastante ou falta amostra. */
export function adherenceDropAlert(trend: Trend, t: AlertThresholds = DEFAULT_THRESHOLDS): AttentionReason | null {
  if (!isAdherenceDropping(trend, t)) return null
  return { severity: "attention", strong: true, text: dropText(trend.current, trend.previous) }
}

export function memberAttention(facts: MemberFacts, today: Date, t: AlertThresholds = DEFAULT_THRESHOLDS): MemberAttention | null {
  const reasons: AttentionReason[] = []

  if (facts.adherenceWindows) {
    const w = facts.adherenceWindows
    const drop = adherenceDropAlert(
      makeTrend(makeRate(w.current.onTime, w.current.due), makeRate(w.previous.onTime, w.previous.due)),
      t,
    )
    if (drop) reasons.push(drop)
  }

  if (facts.overdueAgreements > 0 && facts.oldestOverdueDue) {
    const deadline = deadlineSeverity(facts.oldestOverdueDue, { today })
    const days = -(deadline.daysUntilDue ?? 0)
    reasons.push({
      severity: deadline.severity,
      strong: deadline.strong,
      text: plural(labels.attention.overdue, facts.overdueAgreements, { days }),
    })
  }

  if (facts.chronicAgreements > 0) {
    reasons.push({
      severity: "attention",
      strong: true,
      text: plural(labels.attention.chronic, facts.chronicAgreements, { limit: t.chronicReschedules }),
    })
  }

  if (facts.lastOneOnOne === null) {
    const days = businessDaysBetween(facts.joinedAt, today)
    if (days > oneOnOneCadence(facts.seniorityKey, days, t).limit) {
      reasons.push({ severity: "attention", strong: true, text: fill(labels.attention.noOneOnOne, { days }) })
    }
  } else {
    const days = businessDaysBetween(facts.lastOneOnOne, today)
    const cadence = oneOnOneCadence(facts.seniorityKey, days, t)
    if (days > cadence.limit) {
      reasons.push({
        severity: cadence.severity,
        strong: cadence.strong,
        text: fill(labels.attention.lateOneOnOne, { days, seniority: facts.seniorityLabel, limit: cadence.limit }),
      })
    }
  }

  if (facts.oldestPlanReview) {
    const days = businessDaysBetween(facts.oldestPlanReview, today)
    if (days > t.stalePlanDays) {
      reasons.push({ severity: "attention", strong: true, text: fill(labels.attention.stalePlan, { days }) })
    }
  }

  if (facts.dueSoonAgreements > 0) {
    reasons.push({
      severity: "attention",
      strong: false,
      text: plural(labels.attention.dueSoon, facts.dueSoonAgreements, { limit: t.dueSoonDays }),
    })
  }

  if (reasons.length === 0) return null
  reasons.sort((a, b) => weight(b) - weight(a))
  const top = reasons[0]
  if (!top) return null
  return { severity: top.severity, strong: top.strong, reasons }
}

/* ───────────────────────────── Lista da home ───────────────────────────── */

export type AlertKind =
  | "overdue"
  | "dueSoon"
  | "chronic"
  | "lateOneOnOne"
  | "silence"
  | "stalePlan"
  | "feedbackFollowUp"
  | "dailyMissing"
  | "adherenceDrop"
  | "readiness"

/** Item da navegação onde o alerta é resolvido (contador da sidebar). */
export type AlertNav = "agreements" | "records" | "development" | "dailies"

/** Ação direta da linha. "oneOnOne"/"feedback" abrem o formulário; o resto é link. */
export type AlertAction =
  | { kind: "oneOnOne" | "feedback"; label: string; memberId: string }
  | { kind: "link"; label: string; href: string }

export interface Alert {
  /** Estável entre renderizações (tipo + registro). */
  id: string
  kind: AlertKind
  severity: Severity
  strong: boolean
  /** null nos alertas do time (daily). */
  member: { id: string; preferredName: string; fullName: string } | null
  /** O que aconteceu, numa frase. */
  text: string
  /** Há quanto tempo, em texto curto ("há 12 dias", "vence amanhã"). */
  age: string
  /** Dias de atraso/idade, para a ordem (maior = mais urgente dentro da mesma gravidade). */
  ageDays: number
  action: AlertAction
  nav: AlertNav
  /** Informativo (prontidão): fim da lista, fora dos contadores. */
  informative: boolean
}

export interface AlertsResult {
  alerts: Alert[]
  /** Contadores da sidebar: o que pede ação (sem "vencendo" nem informativos). */
  counts: { today: number; team: number } & Record<AlertNav, number>
}

const L = labels.today.alerts

function ago(days: number): string {
  if (days <= 0) return L.ageToday
  return plural(L.ageDays, days)
}

/** Dia (de negócio) de um instante, no fuso de São Paulo. */
function businessDayOf(instant: Date): Date {
  const sp = toSaoPaulo(instant)
  return new Date(Date.UTC(sp.getFullYear(), sp.getMonth(), sp.getDate()))
}

/** Dias úteis estritamente entre a última daily e hoje (hoje ainda pode ter daily). */
export function missedBusinessDays(lastDaily: Date, today: Date): number {
  let missed = 0
  const d = new Date(lastDaily)
  d.setUTCDate(d.getUTCDate() + 1)
  while (d.getTime() < today.getTime()) {
    if (isBusinessDay(d)) missed++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return missed
}

/** Regra do motor, pura: fatos + limiares → lista ordenada por urgência real. */
export function deriveAlerts(facts: AlertFacts, today: Date, t: AlertThresholds): Alert[] {
  const alerts: Alert[] = []
  const memberById = new Map(facts.members.map((m) => [m.id, m]))
  const who = (id: string) => {
    const m = memberById.get(id)
    return m ? { id: m.id, preferredName: m.preferredName, fullName: m.fullName } : null
  }
  const agreementsHref = (memberId: string) => `/team/${memberId}/agreements`

  // Combinados: vencido (com o arrasto na frase), crônico ainda no prazo, vencendo (agrupado por pessoa).
  const dueSoonBy = new Map<string, { count: number; first: Date }>()
  for (const a of facts.agreements) {
    const member = who(a.memberId)
    if (!member) continue
    const deadline = deadlineSeverity(a.dueDate, { today })
    const daysUntil = deadline.daysUntilDue ?? 0
    const chronic = a.reschedules >= t.chronicReschedules
    const action: AlertAction = { kind: "link", label: L.actions.openAgreement, href: `/agreements/${a.id}` }
    if (daysUntil < 0) {
      alerts.push({
        id: `overdue:${a.id}`,
        kind: "overdue",
        severity: deadline.severity,
        strong: deadline.strong,
        member,
        text: chronic ? fill(L.overdueChronic, { title: a.title, count: a.reschedules }) : fill(L.overdue, { title: a.title }),
        age: plural(L.lateDays, -daysUntil),
        ageDays: -daysUntil,
        action,
        nav: "agreements",
        informative: false,
      })
    } else if (chronic) {
      alerts.push({
        id: `chronic:${a.id}`,
        kind: "chronic",
        severity: "attention",
        strong: true,
        member,
        text: fill(L.chronic, { title: a.title, count: a.reschedules }),
        age: deadline.label,
        ageDays: 0,
        action,
        nav: "agreements",
        informative: false,
      })
    } else if (daysUntil <= t.dueSoonDays) {
      const current = dueSoonBy.get(a.memberId)
      dueSoonBy.set(a.memberId, {
        count: (current?.count ?? 0) + 1,
        first: current && current.first < a.dueDate ? current.first : a.dueDate,
      })
    }
  }
  for (const [memberId, { count, first }] of dueSoonBy) {
    const member = who(memberId)
    if (!member) continue
    alerts.push({
      id: `dueSoon:${memberId}`,
      kind: "dueSoon",
      severity: "attention",
      strong: false,
      member,
      text: plural(L.dueSoon, count, { limit: t.dueSoonDays }),
      age: deadlineSeverity(first, { today }).label,
      ageDays: 0,
      action: { kind: "link", label: L.actions.seeAgreements, href: agreementsHref(memberId) },
      nav: "agreements",
      informative: false,
    })
  }

  // Cadência: silêncio gerencial (nenhum registro) cobre o "sem 1:1" da mesma pessoa.
  for (const m of facts.members) {
    if (m.status === "ON_LEAVE") continue
    const member = who(m.id)!
    const silenceDays = businessDaysBetween(m.lastRecordAt ? businessDayOf(m.lastRecordAt) : m.joinedAt, today)
    if (silenceDays > t.silenceDays) {
      alerts.push({
        id: `silence:${m.id}`,
        kind: "silence",
        severity: silenceDays > t.silenceDays * 2 ? "overdue" : "attention",
        strong: silenceDays > t.silenceDays * 1.5,
        member,
        text: m.lastRecordAt ? L.silence : L.silenceNever,
        age: ago(silenceDays),
        ageDays: silenceDays,
        action: { kind: "oneOnOne", label: L.actions.oneOnOne, memberId: m.id },
        nav: "records",
        informative: false,
      })
      continue
    }
    const oneOnOneDays = businessDaysBetween(m.lastOneOnOne ?? m.joinedAt, today)
    const cadence = oneOnOneCadence(m.seniorityKey, oneOnOneDays, t)
    if (oneOnOneDays > cadence.limit) {
      alerts.push({
        id: `lateOneOnOne:${m.id}`,
        kind: "lateOneOnOne",
        severity: cadence.severity,
        strong: cadence.strong,
        member,
        text: m.lastOneOnOne
          ? fill(L.lateOneOnOne, { seniority: m.seniorityLabel, limit: cadence.limit })
          : fill(L.noOneOnOne, { seniority: m.seniorityLabel, limit: cadence.limit }),
        age: ago(oneOnOneDays),
        ageDays: oneOnOneDays,
        action: { kind: "oneOnOne", label: L.actions.oneOnOne, memberId: m.id },
        nav: "records",
        informative: false,
      })
    }
  }

  // PDI parado: um por plano, com a escala da idade do PDI (laranja > limiar, vermelho > 90).
  for (const p of facts.plans) {
    const member = who(p.memberId)
    if (!member) continue
    const since = p.lastReviewedAt ? businessDayOf(p.lastReviewedAt) : p.startedAt
    const days = businessDaysBetween(since, today)
    if (days <= t.stalePlanDays) continue
    const scale = ageSeverity(days, PLAN_REVIEW_THRESHOLDS)
    alerts.push({
      id: `stalePlan:${p.id}`,
      kind: "stalePlan",
      severity: scale.severity === "overdue" ? "overdue" : "attention",
      strong: scale.severity !== "overdue",
      member,
      text: fill(p.lastReviewedAt ? L.stalePlan : L.stalePlanNever, { objective: p.objective }),
      age: ago(days),
      ageDays: days,
      action: { kind: "link", label: L.actions.reviewPlan, href: `/team/${p.memberId}/development` },
      nav: "development",
      informative: false,
    })
  }

  // Follow-up de feedback vencido sem conversa depois.
  for (const f of facts.followUps) {
    const member = who(f.memberId)
    if (!member) continue
    const deadline = deadlineSeverity(f.followUpAt, { today })
    const late = -(deadline.daysUntilDue ?? 0)
    alerts.push({
      id: `followUp:${f.id}`,
      kind: "feedbackFollowUp",
      severity: deadline.severity,
      strong: deadline.strong,
      member,
      text: fill(L.followUp, { behavior: f.behavior.split("\n")[0]?.trim() ?? "" }),
      age: plural(L.lateDays, late),
      ageDays: late,
      action: { kind: "feedback", label: L.actions.feedback, memberId: f.memberId },
      nav: "records",
      informative: false,
    })
  }

  // Daily do time.
  if (facts.members.length > 0) {
    const missed = facts.lastDaily ? missedBusinessDays(facts.lastDaily, today) : null
    if (missed === null || missed >= t.dailyMissingDays) {
      alerts.push({
        id: "dailyMissing",
        kind: "dailyMissing",
        severity: missed !== null && missed >= t.dailyMissingDays * 2 ? "overdue" : "attention",
        strong: true,
        member: null,
        text: missed === null ? L.dailyNever : plural(L.dailyMissing, missed),
        age: facts.lastDaily ? ago(businessDaysBetween(facts.lastDaily, today)) : "—",
        ageDays: missed ?? 0,
        action: { kind: "link", label: L.actions.daily, href: "/dailies/new" },
        nav: "dailies",
        informative: false,
      })
    }
  }

  // Cumprimento em queda.
  for (const [memberId, w] of facts.adherence) {
    const member = who(memberId)
    if (!member) continue
    const current = makeRate(w.current.onTime, w.current.due)
    const previous = makeRate(w.previous.onTime, w.previous.due)
    if (!isAdherenceDropping(makeTrend(current, previous), t)) continue
    alerts.push({
      id: `adherenceDrop:${memberId}`,
      kind: "adherenceDrop",
      severity: "attention",
      strong: true,
      member,
      text: dropText(current, previous),
      age: L.last30,
      ageDays: 0,
      action: { kind: "link", label: L.actions.seeAdherence, href: agreementsHref(memberId) },
      nav: "agreements",
      informative: false,
    })
  }

  // Prontidão: informativo — só quem já atende a TODAS as competências esperadas da próxima senioridade.
  for (const r of facts.readiness) {
    if (r.readiness.total === 0 || r.readiness.met < r.readiness.total) continue
    const member = who(r.member.id)
    if (!member) continue
    alerts.push({
      id: `readiness:${r.member.id}`,
      kind: "readiness",
      severity: "neutral",
      strong: false,
      member,
      text: fill(L.readiness, { seniority: r.readiness.next.label, total: r.readiness.total }),
      age: L.informative,
      ageDays: 0,
      action: { kind: "link", label: L.actions.seeDevelopment, href: `/team/${r.member.id}/development` },
      nav: "development",
      informative: true,
    })
  }

  return alerts.sort(
    (a, b) =>
      Number(a.informative) - Number(b.informative) ||
      weight(b) - weight(a) ||
      b.ageDays - a.ageDays ||
      (a.member?.preferredName ?? "").localeCompare(b.member?.preferredName ?? ""),
  )
}

/** Contadores da sidebar, da mesma lista: o que pede ação hoje. */
export function alertCounts(alerts: Alert[]): AlertsResult["counts"] {
  const actionable = alerts.filter((a) => !a.informative && a.kind !== "dueSoon")
  const counts: AlertsResult["counts"] = { today: actionable.length, team: 0, agreements: 0, records: 0, development: 0, dailies: 0 }
  for (const a of actionable) counts[a.nav]++
  counts.team = new Set(actionable.flatMap((a) => (a.member ? [a.member.id] : []))).size
  return counts
}

/** "Quem precisa da minha atenção hoje?" — a lista e os contadores, da mesma fonte. */
export async function getAlerts(viewer: Viewer, options: { teamId?: string; today?: Date } = {}): Promise<AlertsResult> {
  const today = options.today ?? todayBusinessDate()
  const t = await getThresholds(viewer)
  const facts = await getAlertFacts(viewer, today, t, options.teamId)
  const alerts = deriveAlerts(facts, today, t)
  return { alerts, counts: alertCounts(alerts) }
}
