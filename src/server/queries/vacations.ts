import { todayBusinessDate } from "../../lib/dates.ts"
import { db } from "../db.ts"
import { teamScope, type TeamContext } from "../scope.ts"

/** Um período de férias de uma pessoa, com o estado em relação a hoje (derivado). */
export interface VacationRow {
  id: string
  startDate: Date
  endDate: Date
  note: string | null
  /** "current" = cobre hoje; "upcoming" = começa depois de hoje; "past" = já terminou. */
  state: "current" | "upcoming" | "past"
}

/** Férias da pessoa: em curso e futuras, mais as 3 últimas que já terminaram. */
export async function listMemberVacations(ctx: TeamContext, memberId: string, today: Date = todayBusinessDate()): Promise<VacationRow[]> {
  const [ahead, past] = await Promise.all([
    db.memberVacation.findMany({
      where: { ...teamScope(ctx), memberId, endDate: { gte: today } },
      orderBy: { startDate: "asc" },
      select: { id: true, startDate: true, endDate: true, note: true },
    }),
    db.memberVacation.findMany({
      where: { ...teamScope(ctx), memberId, endDate: { lt: today } },
      orderBy: { endDate: "desc" },
      take: 3,
      select: { id: true, startDate: true, endDate: true, note: true },
    }),
  ])
  return [
    ...ahead.map((v) => ({ ...v, state: v.startDate <= today ? ("current" as const) : ("upcoming" as const) })),
    ...past.map((v) => ({ ...v, state: "past" as const })),
  ]
}
