import { businessDaysBetween, todayBusinessDate } from "@/lib/dates";
import { fill, labels } from "@/lib/labels";

/**
 * Escala de severidade do Prontuário (DESIGN.md, "Severidade").
 *
 * A cor comunica apenas estado e prioridade. Quatro tons:
 *   calm      concluído, em dia
 *   attention vencendo, atenção
 *   overdue   vencido, crítico
 *   neutral   aberto, sem prazo
 *
 * A escala graduada (neutro → âmbar → laranja → vermelho) tem um degrau a mais
 * que as quatro severidades: o "laranja" é `attention` com `strong: true`, e
 * StatusPill/SeverityDot o pintam com o token `--attention-strong`.
 */

export const SEVERITIES = ["calm", "attention", "overdue", "neutral"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface GradedSeverity<Stage extends string> {
  stage: Stage;
  severity: Severity;
  /** Degrau "laranja" da escala: atenção forte. */
  strong: boolean;
}

/* ───────────────────────────── Prazo ───────────────────────────── */

/**
 * Limiares de prazo (MANUAL-COMPLETO.md, P9):
 * em dia = neutro; vence em ≤ 3 dias = attention; vencido ≤ 7 dias = attention
 * forte; vencido > 7 dias = overdue; vencido > 30 dias = overdue com rótulo
 * "provavelmente esquecido".
 */
export const DEADLINE_THRESHOLDS = {
  dueSoonDays: 3,
  recentOverdueDays: 7,
  forgottenDays: 30,
} as const;

export type DeadlineStage =
  | "resolved"
  | "no-due-date"
  | "on-track"
  | "due-soon"
  | "overdue-recent"
  | "overdue"
  | "forgotten";

export interface DeadlineSeverity extends GradedSeverity<DeadlineStage> {
  /** Dias até o prazo; negativo quando vencido; null sem prazo. */
  daysUntilDue: number | null;
  label: string;
}

/**
 * Severidade de um prazo. `dueDate` e `today` são datas de negócio (`@db.Date`).
 * Registro resolvido (concluído/cancelado) não tem severidade de prazo: é calm.
 */
export function deadlineSeverity(
  dueDate: Date | null,
  options: { resolved?: boolean; today?: Date } = {},
): DeadlineSeverity {
  const { resolved = false, today = todayBusinessDate() } = options;

  if (resolved) {
    return { stage: "resolved", severity: "calm", strong: false, daysUntilDue: null, label: labels.deadline.onTrack };
  }
  if (!dueDate) {
    return { stage: "no-due-date", severity: "neutral", strong: false, daysUntilDue: null, label: labels.deadline.noDueDate };
  }

  const days = businessDaysBetween(today, dueDate);
  const t = DEADLINE_THRESHOLDS;

  if (days > t.dueSoonDays) {
    return { stage: "on-track", severity: "neutral", strong: false, daysUntilDue: days, label: labels.deadline.onTrack };
  }
  if (days >= 0) {
    const label =
      days === 0
        ? labels.deadline.dueToday
        : days === 1
          ? labels.deadline.dueTomorrow
          : fill(labels.deadline.dueInDays, { days });
    return { stage: "due-soon", severity: "attention", strong: false, daysUntilDue: days, label };
  }

  const late = -days;
  const lateLabel = late === 1 ? labels.deadline.overdueOneDay : fill(labels.deadline.overdueDays, { days: late });

  if (late <= t.recentOverdueDays) {
    return { stage: "overdue-recent", severity: "attention", strong: true, daysUntilDue: days, label: lateLabel };
  }
  if (late <= t.forgottenDays) {
    return { stage: "overdue", severity: "overdue", strong: false, daysUntilDue: days, label: lateLabel };
  }
  return {
    stage: "forgotten",
    severity: "overdue",
    strong: false,
    daysUntilDue: days,
    label: labels.deadline.probablyForgotten,
  };
}

/* ───────────────────────────── Idade ───────────────────────────── */

/**
 * Limiares de idade em dias, sem resolução. Não há padrão global: cada módulo
 * define os seus (ex.: PDI parado há mais de 45 dias, P14) e documenta a origem.
 * Exige attention < strong < overdue.
 */
export interface AgeThresholds {
  attention: number;
  strong: number;
  overdue: number;
}

export type AgeStage = "fresh" | "aging" | "stale" | "abandoned";

/** Escala graduada de idade: neutro → âmbar → laranja → vermelho. */
export function ageSeverity(ageDays: number, thresholds: AgeThresholds): GradedSeverity<AgeStage> {
  if (!(thresholds.attention < thresholds.strong && thresholds.strong < thresholds.overdue)) {
    throw new Error("Limiares de idade fora de ordem: attention < strong < overdue");
  }
  if (ageDays > thresholds.overdue) return { stage: "abandoned", severity: "overdue", strong: false };
  if (ageDays > thresholds.strong) return { stage: "stale", severity: "attention", strong: true };
  if (ageDays > thresholds.attention) return { stage: "aging", severity: "attention", strong: false };
  return { stage: "fresh", severity: "neutral", strong: false };
}
