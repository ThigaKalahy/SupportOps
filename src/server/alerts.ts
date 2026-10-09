import { makeRate, makeTrend, percent, type Rate, type Trend } from "../lib/adherence.ts"
import { DEFAULT_THRESHOLDS, oneOnOneLimit, type AlertThresholds } from "../lib/alert-thresholds.ts"
import { businessDaysBetween, isBusinessDay, todayBusinessDate, toSaoPaulo, toUrlDate } from "../lib/dates.ts"
import { DEV_RETURN_ALERTS } from "../lib/dev-returns.ts"
import { coldHighDays, reviewState as watchReviewState, showsOnHome, stalledDays } from "../lib/watch.ts"
import { PLAN_REVIEW_THRESHOLDS } from "../lib/development.ts"
import { fill, labels, plural } from "../lib/labels.ts"
import { ageSeverity, deadlineSeverity, type Severity } from "../lib/severity.ts"

import { getAlertFacts, type AlertFacts } from "./queries/alerts.ts"
import { getThresholds } from "./queries/thresholds.ts"
import type { TeamContext } from "./scope.ts"

/**
 * Motor de alertas — DERIVADO em query, nunca persistido (D9). Só os
 * limiares ficam no banco (AlertThreshold, editáveis em /settings).
 *
 * - `getAlerts(ctx)`: a lista única da home ("quem precisa da minha atenção
 *   hoje?"), ordenada por urgência real, e os contadores da sidebar — a mesma
 *   fonte para os dois. Um time por chamada: o do contexto (P22).
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
  | "devReturnsRecurring"
  | "devReturnUnresolved"
  | "watchUnreviewed"
  | "watchColdHigh"
  | "watchStalled"

/** Item da navegação onde o alerta é resolvido (contador da sidebar). */
export type AlertNav = "watch" | "agreements" | "validations" | "records" | "development" | "dailies"

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
  /** Em observação ativas e quantas em fogo alto (ritmo de gestão da home). */
  watch?: { active: number; high: number }
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

/** Link para /dev-returns com os filtros na URL (mesmos parâmetros de src/lib/dev-return-filters.ts). */
function devReturnsHref(filters: { member: string; reason?: string; from?: Date; to?: Date; open?: boolean }): string {
  const params = new URLSearchParams({ member: filters.member })
  if (filters.reason) params.set("reason", filters.reason)
  if (filters.from && filters.to) {
    params.set("period", "custom")
    params.set("from", toUrlDate(filters.from))
    params.set("to", toUrlDate(filters.to))
  }
  if (filters.open) {
    params.set("period", "custom")
    params.set("from", "01-01-2000")
    params.set("to", toUrlDate(todayBusinessDate()))
    params.set("open", "1")
  }
  return `/dev-returns?${params}`
}

/** Regra do motor, pura: fatos + limiares → lista ordenada por urgência real. */
export function deriveAlerts(facts: AlertFacts, today: Date, t: AlertThresholds, now: Date = new Date()): Alert[] {
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
    } else if (daysUntil > 0 && daysUntil <= t.dueSoonDays) {
      // Prazo hoje fica fora (D28): é o trabalho do dia, revisado pela daily de amanhã.
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

  // Devoluções do desenvolvimento (P20). Recorrentes: 3+ ANALYST pelo mesmo motivo em 60 dias —
  // padrão, não acidente, e a coisa mais treinável que o sistema detecta. PROCESS não conta (D22).
  const recurringFrom = new Date(today)
  recurringFrom.setUTCDate(recurringFrom.getUTCDate() - (DEV_RETURN_ALERTS.recurringWindowDays - 1))
  const recurring = new Map<string, { memberId: string; reasonId: string; reasonLabel: string; count: number; last: Date }>()
  for (const r of facts.devReturns) {
    if (r.category !== "ANALYST" || r.returnedAt < recurringFrom || r.returnedAt > today) continue
    const key = `${r.memberId}|${r.reasonId}`
    const row = recurring.get(key) ?? { memberId: r.memberId, reasonId: r.reasonId, reasonLabel: r.reasonLabel, count: 0, last: r.returnedAt }
    row.count++
    if (r.returnedAt > row.last) row.last = r.returnedAt
    recurring.set(key, row)
  }
  for (const row of recurring.values()) {
    if (row.count < DEV_RETURN_ALERTS.recurringCount) continue
    const member = who(row.memberId)
    if (!member) continue
    const days = businessDaysBetween(row.last, today)
    alerts.push({
      id: `devReturnsRecurring:${row.memberId}:${row.reasonId}`,
      kind: "devReturnsRecurring",
      severity: "attention",
      strong: true,
      member,
      text: fill(L.devReturnsRecurring, { count: row.count, days: DEV_RETURN_ALERTS.recurringWindowDays, reason: row.reasonLabel }),
      age: ago(days),
      ageDays: days,
      action: {
        kind: "link",
        label: L.actions.seeDevReturns,
        href: devReturnsHref({ member: row.memberId, reason: row.reasonId, from: recurringFrom, to: today }),
      },
      nav: "validations",
      informative: false,
    })
  }
  // Sem reenvio há mais de 7 dias: âmbar; mais de 14, laranja; mais de 30, vermelho.
  for (const r of facts.devReturns) {
    if (r.resolvedAt) continue
    const days = businessDaysBetween(r.returnedAt, today)
    if (days <= DEV_RETURN_ALERTS.unresolvedDays) continue
    const member = who(r.memberId)
    if (!member) continue
    alerts.push({
      id: `devReturnUnresolved:${r.id}`,
      kind: "devReturnUnresolved",
      severity: days > 30 ? "overdue" : "attention",
      strong: days > 14 && days <= 30,
      member,
      text: fill(L.devReturnUnresolved, { ref: r.ticketRef }),
      age: ago(days),
      ageDays: days,
      action: { kind: "link", label: L.actions.seeDevReturns, href: devReturnsHref({ member: r.memberId, open: true }) },
      nav: "validations",
      informative: false,
    })
  }

  // Em observação (P21): no máximo um alerta por item, o mais forte. "Fogo alto frio" (overdue,
  // com a frase "fogo alto há N dias sem mudar de grau") > "sem revisão" (alto: overdue; médio:
  // atenção; baixo só passado o dobro da cadência — D28) > "parada" (nunca revisada há 14+ dias).
  for (const w of facts.watchItems) {
    const member = w.memberId ? who(w.memberId) : null
    if (w.memberId && !member) continue
    const href = `/watch?open=${w.id}`
    const base = { member, nav: "watch" as const, informative: false, action: { kind: "link" as const, label: L.actions.openWatch, href } }
    const cold = coldHighDays({ ...w, status: "ACTIVE" }, now, t)
    if (cold !== null) {
      alerts.push({ ...base, id: `watchColdHigh:${w.id}`, kind: "watchColdHigh", severity: "overdue", strong: false, text: fill(L.watchColdHigh, { title: w.title, days: cold }), age: ago(cold), ageDays: cold })
      continue
    }
    const state = watchReviewState(w, now, t)
    if (showsOnHome(w.heat, state)) {
      alerts.push({
        ...base,
        id: `watchUnreviewed:${w.id}`,
        kind: "watchUnreviewed",
        severity: w.heat === "HIGH" ? "overdue" : "attention",
        strong: w.heat === "MEDIUM" && state.status === "late",
        text: fill(L.watchUnreviewed, { title: w.title, heat: labels.watch.heat[w.heat].toLowerCase(), cadence: state.cadence }),
        age: ago(state.daysSinceReview),
        ageDays: state.daysSinceReview,
      })
      continue
    }
    const stalled = stalledDays({ ...w, status: "ACTIVE" }, now)
    if (stalled !== null) {
      alerts.push({ ...base, id: `watchStalled:${w.id}`, kind: "watchStalled", severity: "attention", strong: true, text: fill(L.watchStalled, { title: w.title }), age: ago(stalled), ageDays: stalled })
    }
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
  const counts: AlertsResult["counts"] = { today: actionable.length, team: 0, watch: 0, agreements: 0, validations: 0, records: 0, development: 0, dailies: 0 }
  for (const a of actionable) counts[a.nav]++
  counts.team = new Set(actionable.flatMap((a) => (a.member ? [a.member.id] : []))).size
  return counts
}

/** "Quem precisa da minha atenção hoje?" — a lista e os contadores, da mesma fonte. */
export async function getAlerts(ctx: TeamContext, options: { today?: Date } = {}): Promise<AlertsResult> {
  const today = options.today ?? todayBusinessDate()
  const t = await getThresholds(ctx)
  const facts = await getAlertFacts(ctx, today, t)
  const alerts = deriveAlerts(facts, today, t)
  const counts = alertCounts(alerts)
  // Contador de "Em observação" na sidebar: o fogo alto ativo (mesma fonte, os fatos do motor).
  counts.watch = facts.watchItems.filter((w) => w.heat === "HIGH").length
  return { alerts, counts, watch: { active: facts.watchItems.length, high: counts.watch } }
}
