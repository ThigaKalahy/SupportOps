/**
 * Travamento da daily (P26, D41, D43). Uma daily em DRAFT trava o portal do time
 * enquanto foi aberta há menos de 4 horas; mais antiga que isso é daily abandonada e
 * deixa de travar — derivado na hora da leitura, sem cron e sem estado persistido (D9).
 */

export const DAILY_LOCK_HOURS = 4

const LOCK_MS = DAILY_LOCK_HOURS * 60 * 60 * 1000

/** A daily aberta em `openedAt` ainda trava o portal em `now`? */
export function isLockActive(openedAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!openedAt) return false
  return now.getTime() - openedAt.getTime() < LOCK_MS
}

/** Instante a partir do qual uma DRAFT aberta antes dele já não trava (para `where`). */
export function lockCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - LOCK_MS)
}
