import { parseDisplayDate, todayBusinessDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { ownAgreementSchema } from "../lib/validators/member-portal.ts"

import { db } from "./db.ts"
import { getDailyLock, memberAudit, type MemberContext } from "./member-scope.ts"
import { recordTimelineEvents, timelineEventFor } from "./timeline.ts"

/**
 * C14 — o colaborador CRIA o próprio combinado (decisão do usuário em 20/10/2026, revisa a
 * D42: os analistas têm autonomia; o gestor edita, cancela, transfere ou põe em observação
 * na daily ou depois). É a ÚNICA ponte do portal para fora do namespace dele, e só ESCREVE:
 * o combinado da própria pessoa (origem MEMBER, prioridade normal, prazo original = prazo —
 * D17) e a linha da timeline, pelo único escritor dela (src/server/timeline.ts), na mesma
 * transação. Não lê nada gerencial. Confere o travamento dentro da transação (D43).
 */

export type OwnAgreementResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }

class PortalLockedError extends Error {}

export async function createOwnAgreement(ctx: MemberContext, input: unknown): Promise<OwnAgreementResult> {
  const parsed = ownAgreementSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[issue.path.map(String).join(".")] ??= issue.message
    return { ok: false, error: labels.validation.generic, fieldErrors }
  }
  const due = parsed.data.dueDate ? parseDisplayDate(parsed.data.dueDate)! : todayBusinessDate()
  try {
    return await db.$transaction(async (tx) => {
      if ((await getDailyLock(ctx.teamId, tx)).locked) throw new PortalLockedError()
      const created = await tx.agreement.create({
        data: {
          teamId: ctx.teamId,
          memberId: ctx.memberId,
          title: parsed.data.title,
          origin: "MEMBER",
          originalDueDate: due,
          dueDate: due,
          authorUserId: ctx.userId,
        },
      })
      await recordTimelineEvents(tx, { teamId: ctx.teamId }, [timelineEventFor.agreementCreated(created)])
      await memberAudit(
        ctx,
        { action: "member.agreement.create", entity: "Agreement", entityId: created.id, after: { title: created.title, dueDate: parsed.data.dueDate || "hoje" } },
        tx,
      )
      return { ok: true, id: created.id }
    })
  } catch (error) {
    if (error instanceof PortalLockedError) return { ok: false, error: labels.memberPortal.locked.refused }
    throw error
  }
}
