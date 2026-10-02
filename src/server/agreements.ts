import { parseDisplayDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { fieldErrorsOf, textOrNull, type ActionResult } from "../lib/validators/fields.ts"
import { createAgreementSchema } from "../lib/validators/agreement.ts"

import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { recordTimelineEvents, timelineEventFor } from "./timeline.ts"
import { canWrite, memberScope, type Viewer } from "./visibility.ts"

/**
 * Escrita de combinados (núcleo das Server Actions de src/actions/agreements.ts).
 * Criar grava o combinado com originalDueDate = dueDate (D17), a linha da
 * timeline e o AuditLog na mesma transação. Conclusão, reagendamento e
 * substituição entram no P9.
 */

export async function createAgreementRecord(user: Viewer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return { ok: false, error: labels.access.forbidden }
  const parsed = createAgreementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const data = parsed.data
  const member = await db.teamMember.findFirst({ where: { id: data.memberId, ...memberScope(user) }, select: { id: true } })
  if (!member) return { ok: false, error: labels.validation.generic }
  const due = parseDisplayDate(data.dueDate)
  if (!due) return { ok: false, error: labels.validation.date, fieldErrors: { dueDate: labels.validation.date } }

  await db.$transaction(async (tx) => {
    const created = await tx.agreement.create({
      data: {
        memberId: member.id,
        title: data.title,
        description: textOrNull(data.description),
        origin: data.origin,
        priority: data.priority,
        originalDueDate: due,
        dueDate: due,
        authorUserId: user.id,
      },
    })
    await recordTimelineEvents(tx, [timelineEventFor.agreementCreated(created)])
    await writeAudit(
      {
        action: "agreement.create",
        entity: "Agreement",
        entityId: created.id,
        after: {
          memberId: created.memberId,
          title: created.title,
          origin: created.origin,
          priority: created.priority,
          dueDate: data.dueDate,
        },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}
