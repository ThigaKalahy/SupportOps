import { isDropping, makeRate, makeTrend, percent, type Trend } from "../lib/adherence.ts"
import { businessDaysBetween } from "../lib/dates.ts"
import { labels, plural, fill } from "../lib/labels.ts"
import { deadlineSeverity, type Severity } from "../lib/severity.ts"

/**
 * Motor de alertas — DERIVADO, nunca persistido (D9). O P15 completa este
 * arquivo com `getAlerts(teamId, userId)` e move os limiares para Settings.
 *
 * Por ora: `memberAttention`, usada pela coluna de atenção de /team e pelo
 * cabeçalho do perfil. Recebe os fatos já agregados de uma pessoa (uma única
 * query em src/server/queries/members.ts) e devolve a severidade e os motivos,
 * cada um numa frase que o tooltip mostra literalmente.
 *
 * Alertas do P12, consumidos pelo P15:
 * - `adherenceDropAlert`: cumprimento no prazo dos últimos 30 dias caiu 20
 *   pontos ou mais em relação aos 30 anteriores, com 5+ combinados em cada
 *   janela (regras em src/lib/adherence.ts).
 * - Combinado crônico: aberto com 3+ reagendamentos (`chronicAgreements`).
 */

/** Limiares padrão (tabela do P15). Viram configuração no P15. */
export const ATTENTION_THRESHOLDS = {
  oneOnOneDays: { JUNIOR: 21, PLENO: 30, SENIOR: 30 } as Record<string, number>,
  defaultOneOnOneDays: 30,
  dueSoonDays: 3,
  chronicReschedules: 3,
  stalePlanDays: 45,
} as const

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
export function oneOnOneCadence(seniorityKey: string, days: number): { limit: number; severity: Severity; strong: boolean } {
  const limit = ATTENTION_THRESHOLDS.oneOnOneDays[seniorityKey] ?? ATTENTION_THRESHOLDS.defaultOneOnOneDays
  if (days <= limit) return { limit, severity: "neutral", strong: false }
  return { limit, severity: days > limit * 2 ? "overdue" : "attention", strong: days > limit * 1.5 }
}

/** "Cumprimento em queda": null se não caiu 20+ pontos ou se falta amostra em alguma janela. */
export function adherenceDropAlert(trend: Trend): AttentionReason | null {
  if (!isDropping(trend)) return null
  return {
    severity: "attention",
    strong: true,
    text: fill(labels.attention.adherenceDrop, {
      previous: percent(trend.previous) ?? 0,
      current: percent(trend.current) ?? 0,
      previousTotal: trend.previous.denominator,
      currentTotal: trend.current.denominator,
    }),
  }
}

export function memberAttention(facts: MemberFacts, today: Date): MemberAttention | null {
  const t = ATTENTION_THRESHOLDS
  const reasons: AttentionReason[] = []

  if (facts.adherenceWindows) {
    const w = facts.adherenceWindows
    const drop = adherenceDropAlert(
      makeTrend(makeRate(w.current.onTime, w.current.due), makeRate(w.previous.onTime, w.previous.due)),
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
    if (days > oneOnOneCadence(facts.seniorityKey, days).limit) {
      reasons.push({ severity: "attention", strong: true, text: fill(labels.attention.noOneOnOne, { days }) })
    }
  } else {
    const days = businessDaysBetween(facts.lastOneOnOne, today)
    const cadence = oneOnOneCadence(facts.seniorityKey, days)
    if (days > cadence.limit) {
      reasons.push({
        severity: cadence.severity,
        strong: cadence.strong,
        text: fill(labels.attention.lateOneOnOne, {
          days,
          seniority: facts.seniorityLabel,
          limit: cadence.limit,
        }),
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
