import { differenceInCalendarDays, differenceInCalendarMonths, format } from "date-fns";
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

/**
 * Instante que representa uma data de negócio numa coluna `timestamptz`
 * (ex.: TimelineEvent.occurredAt de um 1:1): meio-dia em São Paulo do mesmo
 * dia. Gravar a meia-noite UTC faria o dia aparecer como o anterior no fuso
 * de São Paulo.
 */
export function businessDateAtNoon(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 15));
}

/**
 * Instante da meia-noite em São Paulo de uma data de negócio — o início do
 * dia para filtrar timestamps (ex.: validações "de hoje"). O deslocamento é
 * lido do fuso, não fixado em -3h.
 */
export function startOfBusinessDay(date: Date): Date {
  const midnightUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const probe = new Date(midnightUtc + 12 * 3_600_000);
  const wall = toSaoPaulo(probe);
  const offset =
    Date.UTC(wall.getFullYear(), wall.getMonth(), wall.getDate(), wall.getHours(), wall.getMinutes()) - probe.getTime();
  return new Date(midnightUtc - offset);
}

/** [início, fim) em instantes de um intervalo inclusivo de datas de negócio. */
export function businessRangeInstants(from: Date, to: Date): { gte: Date; lt: Date } {
  const after = new Date(to);
  after.setUTCDate(after.getUTCDate() + 1);
  return { gte: startOfBusinessDay(from), lt: startOfBusinessDay(after) };
}

/** Domingo de Páscoa (algoritmo gregoriano anônimo), como data de negócio. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Feriados nacionais de data fixa, "MM-DD". 20/11 só a partir de 2024 (Lei 14.759/2023). */
const FIXED_HOLIDAYS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];

/**
 * Feriado nacional: os de data fixa, a Consciência Negra (desde 2024) e a
 * Sexta-feira Santa. Carnaval e Corpus Christi são ponto facultativo, e
 * feriados estaduais e municipais não entram.
 */
export function isNationalHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  const key = `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  if (FIXED_HOLIDAYS.includes(key) || (key === "11-20" && year >= 2024)) return true;
  const goodFriday = easterSunday(year);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  return goodFriday.getTime() === date.getTime();
}

/** Dia útil: segunda a sexta, fora dos feriados nacionais. */
export function isBusinessDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isNationalHoliday(date);
}

/**
 * Próximo dia útil depois de uma data de negócio — o padrão de "próxima
 * daily". Pula fins de semana e feriados nacionais.
 */
export function nextBusinessDay(date: Date): Date {
  const next = new Date(date);
  do next.setUTCDate(next.getUTCDate() + 1);
  while (!isBusinessDay(next));
  return next;
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

/** "2 anos e 3 meses", "8 meses", "menos de 1 mês" — tempo desde uma data de negócio. */
export function formatTenure(since: Date, today: Date = todayBusinessDate()): string {
  const months = differenceInCalendarMonths(fromBusinessDate(today), fromBusinessDate(since))
  const adjusted = fromBusinessDate(today).getDate() < fromBusinessDate(since).getDate() ? months - 1 : months
  if (adjusted < 1) return "menos de 1 mês"
  const years = Math.floor(adjusted / 12)
  const rest = adjusted % 12
  const y = years === 1 ? "1 ano" : `${years} anos`
  const m = rest === 1 ? "1 mês" : `${rest} meses`
  if (years === 0) return m
  return rest === 0 ? y : `${y} e ${m}`
}

/**
 * Campo de data com máscara DD/MM/AAAA (o <input type="date"> nativo segue o
 * idioma do navegador). Mantém só dígitos e insere as barras.
 */
export function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8)
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean)
  return parts.join("/")
}

/** "DD/MM/AAAA" → data de negócio (meia-noite UTC), ou null se inválida. */
export function parseDisplayDate(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const [, dd, mm, yyyy] = match
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
  const valid =
    date.getUTCFullYear() === Number(yyyy) && date.getUTCMonth() === Number(mm) - 1 && date.getUTCDate() === Number(dd)
  return valid ? date : null
}
