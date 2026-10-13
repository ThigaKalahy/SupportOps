import { parseDisplayDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import { cancelVacationSchema, createVacationSchema } from "../lib/validators/vacation.ts"

import { auditOf, writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { requireManager, teamScope, type TeamContext } from "./scope.ts"

/**
 * Férias (C4). Registrar grava o período; nada muda de status — "de férias hoje"
 * é derivado em query (src/lib/vacations.ts), e a pessoa volta sozinha no dia
 * seguinte ao fim. Períodos da mesma pessoa não se sobrepõem. Cancelar apaga o
 * período (é planejamento, não registro de avaliação); a auditoria guarda os dois.
 */

const F = labels.vacations

export async function createVacationRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = createVacationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const startDate = parseDisplayDate(parsed.data.startDate)!
  const endDate = parseDisplayDate(parsed.data.endDate)!
  const member = await db.teamMember.findFirst({
    where: { id: parsed.data.memberId, ...teamScope(ctx), status: { not: "INACTIVE" } },
    select: { id: true },
  })
  if (!member) return { ok: false, error: labels.validation.generic }
  const overlap = await db.memberVacation.findFirst({
    where: { ...teamScope(ctx), memberId: member.id, startDate: { lte: endDate }, endDate: { gte: startDate } },
    select: { id: true },
  })
  if (overlap) return { ok: false, error: F.validation.overlap, fieldErrors: { startDate: F.validation.overlap } }

  await db.$transaction(async (tx) => {
    const created = await tx.memberVacation.create({
      data: { ...teamScope(ctx), memberId: member.id, startDate, endDate, note: textOrNull(parsed.data.note), createdByUserId: ctx.userId },
    })
    await writeAudit(
      {
        action: "member.vacation.create",
        entity: "MemberVacation",
        entityId: created.id,
        after: { memberId: member.id, startDate: parsed.data.startDate, endDate: parsed.data.endDate },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}

export async function cancelVacationRecord(ctx: TeamContext, input: unknown): Promise<ActionResult> {
  requireManager(ctx)
  const parsed = cancelVacationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const vacation = await db.memberVacation.findFirst({ where: { id: parsed.data.id, ...teamScope(ctx) } })
  if (!vacation) return { ok: false, error: labels.validation.generic }
  await db.$transaction(async (tx) => {
    await tx.memberVacation.delete({ where: { id: vacation.id, ...teamScope(ctx) } })
    await writeAudit(
      {
        action: "member.vacation.cancel",
        entity: "MemberVacation",
        entityId: vacation.id,
        before: { memberId: vacation.memberId, startDate: vacation.startDate.toISOString(), endDate: vacation.endDate.toISOString(), note: vacation.note },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true }
}
