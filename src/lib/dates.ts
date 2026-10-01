import { differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";

/**
 * Datas no Prontuário.
 *
 * Dois tipos de valor, que NÃO se misturam:
 * - Timestamp (`timestamptz`): um instante. Exibido no horário de São Paulo,
 *   independentemente do fuso do servidor (a Vercel roda em UTC).
 * - Data de negócio (`@db.Date`): um dia do calendário, sem hora. O Prisma a
 *   entrega como meia-noite UTC; formatá-la no fuso de São Paulo a jogaria para
 *   o dia anterior. Por isso é lida pelos componentes UTC.
 *
 * Formato visível ao usuário: DD/MM/AAAA e HH:mm (24h). ISO só internamente.
 */

export const TIME_ZONE = "America/Sao_Paulo";

const wallClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Converte um instante para um Date cujos campos locais (getDate, getHours...)
 * são o horário de parede de São Paulo. Uso exclusivo para formatação e
 * aritmética de calendário com date-fns — nunca persistir o resultado.
 */
export function toSaoPaulo(instant: Date): Date {
  const parts: Record<string, number> = {};
  for (const part of wallClockFormatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return new Date(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
}

/** Data de negócio (`@db.Date`, meia-noite UTC) como Date local do mesmo dia. */
export function fromBusinessDate(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Converte "AAAA-MM-DD" (valor de input/chave) em data de negócio, meia-noite UTC. */
export function parseBusinessDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Data de negócio inválida: ${iso}`);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Hoje em São Paulo, como data de negócio (meia-noite UTC). */
export function todayBusinessDate(now: Date = new Date()): Date {
  const sp = toSaoPaulo(now);
  return new Date(Date.UTC(sp.getFullYear(), sp.getMonth(), sp.getDate()));
}

/** Chave ISO "AAAA-MM-DD" de uma data de negócio. Uso interno — nunca exibir. */
export function toBusinessDateKey(date: Date): string {
  return format(fromBusinessDate(date), "yyyy-MM-dd");
}

export type DateKind = "timestamp" | "business";

function toDisplayDate(date: Date, kind: DateKind): Date {
  return kind === "business" ? fromBusinessDate(date) : toSaoPaulo(date);
}

/** 01/10/2026 */
export function formatDate(date: Date, kind: DateKind = "timestamp"): string {
  return format(toDisplayDate(date, kind), "dd/MM/yyyy", { locale: ptBR });
}

/** 01/10/2026 14:05 — só para timestamps. */
export function formatDateTime(date: Date): string {
  return format(toSaoPaulo(date), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

/** 14:05 — só para timestamps. */
export function formatTime(date: Date): string {
  return format(toSaoPaulo(date), "HH:mm", { locale: ptBR });
}

/** 01/10 — data curta, para colunas estreitas e calhas. */
export function formatDayMonth(date: Date, kind: DateKind = "timestamp"): string {
  return format(toDisplayDate(date, kind), "dd/MM", { locale: ptBR });
}

/** "quinta-feira, 1 de outubro de 2026" (+ " às 14:05" em timestamps). Para o title. */
export function formatDateLong(date: Date, kind: DateKind = "timestamp"): string {
  const day = format(toDisplayDate(date, kind), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  return kind === "timestamp" ? `${day} às ${formatTime(date)}` : day;
}

/** "out/2026" — cabeçalho de mês. */
export function formatMonthYear(date: Date, kind: DateKind = "timestamp"): string {
  return format(toDisplayDate(date, kind), "MMM/yyyy", { locale: ptBR });
}

/**
 * Dias de calendário de `from` até `to` (positivo se `to` é depois).
 * Ambos são datas de negócio.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(fromBusinessDate(to), fromBusinessDate(from));
}

/** Dias de calendário, em São Paulo, desde um instante até `now`. */
export function daysSince(instant: Date, now: Date = new Date()): number {
  return differenceInCalendarDays(toSaoPaulo(now), toSaoPaulo(instant));
}
