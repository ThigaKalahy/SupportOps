import { isBusinessDay, todayBusinessDate, toSaoPaulo } from "./dates.ts"

/**
 * C19: janela da roleta do scrum master para o time — das 09h às 10h (São Paulo), em dia
 * útil. O gestor gira a qualquer hora. Regra pura, usada pelo portal e pelo gestor.
 */
export function rouletteWindowOpen(now: Date = new Date()): boolean {
  return toSaoPaulo(now).getHours() === 9 && isBusinessDay(todayBusinessDate(now))
}
