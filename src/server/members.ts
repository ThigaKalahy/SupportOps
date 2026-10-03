import { randomUUID } from "node:crypto"

import type { MemberChangeType, MemberStatus, Prisma } from "@prisma/client"

import { parseDisplayDate, todayBusinessDate } from "../lib/dates.ts"
import { enumLabel, labels } from "../lib/labels.ts"
import {
  createMemberSchema,
  deactivateMemberSchema,
  reactivateMemberSchema,
  fieldErrorsOf,
  managerSummarySchema,
  updateMemberSchema,
  type ActionResult,
} from "../lib/validators/member.ts"

import { writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { recordTimelineEvents, timelineEventFor } from "./timeline.ts"
import { canWrite, memberScope, type Viewer } from "./visibility.ts"

/**
 * Escrita de pessoas do time (núcleo das Server Actions de src/actions/members.ts,
 * que só acrescentam requireOwner e revalidatePath). Recebe o usuário já
 * autenticado — por isso é testável sem sessão.
 *
 * Toda escrita: zod → transação (registro + MemberChange + TimelineEvent +
 * AuditLog). Mudança de senioridade, cargo ou status é evento de carreira com
 * motivo obrigatório, nunca edição silenciosa. Desativar nunca apaga (D10).
 */

export type Writer = Viewer & { email?: string }

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

function forbidden(): ActionResult {
  return { ok: false, error: labels.access.forbidden }
}

async function teamFor(user: Writer) {
  return db.team.findFirst({
    where: user.role === "MANAGER" ? { managerUserId: user.id } : { organizationId: user.organizationId },
    orderBy: { name: "asc" },
  })
}

async function assertCatalogs(user: Writer, input: { seniorityId: string; responsibilityIds: string[]; competencies: { competencyId: string }[] }) {
  const [seniority, responsibilities, competencies] = await Promise.all([
    db.seniority.count({ where: { id: input.seniorityId, organizationId: user.organizationId } }),
    db.responsibility.count({ where: { id: { in: input.responsibilityIds }, organizationId: user.organizationId } }),
    db.competency.count({ where: { id: { in: input.competencies.map((c) => c.competencyId) }, organizationId: user.organizationId } }),
  ])
  return seniority === 1 && responsibilities === input.responsibilityIds.length && competencies === input.competencies.length
}

function memberSnapshot(m: {
  fullName: string
  preferredName: string
  position: string
  seniorityId: string
  joinedAt: Date
  status: MemberStatus
  email: string | null
}): Prisma.InputJsonObject {
  return {
    fullName: m.fullName,
    preferredName: m.preferredName,
    position: m.position,
    seniorityId: m.seniorityId,
    joinedAt: m.joinedAt.toISOString().slice(0, 10),
    status: m.status,
    email: m.email,
  }
}

/** Grava MemberChange + linha da timeline de cada mudança de carreira. */
async function recordCareerChanges(
  tx: Tx,
  user: Writer,
  memberId: string,
  reason: string,
  changes: { type: MemberChangeType; from: string; to: string; fromLabel: string; toLabel: string }[],
) {
  const today = todayBusinessDate()
  for (const change of changes) {
    const created = await tx.memberChange.create({
      data: {
        memberId,
        changeType: change.type,
        fromValue: change.from,
        toValue: change.to,
        effectiveAt: today,
        reason,
        authorUserId: user.id,
      },
    })
    await recordTimelineEvents(tx, [
      timelineEventFor.memberChange({
        ...created,
        effectiveAt: new Date(),
        fromLabel: change.fromLabel,
        toLabel: change.toLabel,
      }),
    ])
  }
}

export async function createMemberRecord(user: Writer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = createMemberSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  const team = await teamFor(user)
  if (!team || !(await assertCatalogs(user, data))) return { ok: false, error: labels.validation.generic }
  const joinedAt = parseDisplayDate(data.joinedAt)
  if (!joinedAt) return { ok: false, error: labels.validation.date, fieldErrors: { joinedAt: labels.validation.date } }
  const today = todayBusinessDate()

  await db.$transaction(async (tx) => {
    const member = await tx.teamMember.create({
      data: {
        teamId: team.id,
        fullName: data.fullName,
        preferredName: data.preferredName,
        position: data.position,
        seniorityId: data.seniorityId,
        joinedAt,
        status: data.status,
        email: data.email || null,
        avatarSeed: randomUUID(),
      },
    })
    if (data.responsibilityIds.length) {
      await tx.memberResponsibility.createMany({
        data: data.responsibilityIds.map((responsibilityId, i) => ({
          memberId: member.id,
          responsibilityId,
          isPrimary: i === 0,
          assignedAt: today,
        })),
      })
    }
    if (data.competencies.length) {
      await tx.memberCompetency.createMany({
        data: data.competencies.map((c) => ({
          memberId: member.id,
          competencyId: c.competencyId,
          currentLevel: c.level,
          assessedAt: today,
        })),
      })
    }
    await writeAudit(
      {
        action: "member.create",
        entity: "TeamMember",
        entityId: member.id,
        after: { ...memberSnapshot(member), responsibilityIds: data.responsibilityIds, competencies: data.competencies },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })

  return { ok: true }
}

export async function updateMemberRecord(user: Writer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = updateMemberSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }
  const data = parsed.data
  if (!(await assertCatalogs(user, data))) return { ok: false, error: labels.validation.generic }
  const joinedAt = parseDisplayDate(data.joinedAt)
  if (!joinedAt) return { ok: false, error: labels.validation.date, fieldErrors: { joinedAt: labels.validation.date } }

  const before = await db.teamMember.findFirst({
    where: { id: data.id, ...memberScope(user) },
    include: {
      seniority: true,
      responsibilities: { where: { endedAt: null } },
      competencies: true,
    },
  })
  if (!before) return { ok: false, error: labels.validation.generic }

  const newSeniority = await db.seniority.findUniqueOrThrow({ where: { id: data.seniorityId } })
  const changes: { type: MemberChangeType; from: string; to: string; fromLabel: string; toLabel: string }[] = []
  if (before.seniorityId !== data.seniorityId) {
    changes.push({
      type: "SENIORITY",
      from: before.seniority.key,
      to: newSeniority.key,
      fromLabel: before.seniority.label,
      toLabel: newSeniority.label,
    })
  }
  if (before.position !== data.position) {
    changes.push({ type: "POSITION", from: before.position, to: data.position, fromLabel: before.position, toLabel: data.position })
  }
  if (before.status !== data.status) {
    changes.push({
      type: "STATUS",
      from: before.status,
      to: data.status,
      fromLabel: enumLabel("memberStatus", before.status),
      toLabel: enumLabel("memberStatus", data.status),
    })
  }
  if (changes.length > 0 && data.reason.length < 3) {
    return { ok: false, error: labels.validation.reasonRequired, fieldErrors: { reason: labels.validation.reasonRequired } }
  }

  const today = todayBusinessDate()
  const currentResponsibilities = new Set(before.responsibilities.map((r) => r.responsibilityId))
  const nextResponsibilities = new Set(data.responsibilityIds)

  await db.$transaction(async (tx) => {
    const after = await tx.teamMember.update({
      where: { id: before.id },
      data: {
        fullName: data.fullName,
        preferredName: data.preferredName,
        position: data.position,
        seniorityId: data.seniorityId,
        joinedAt,
        status: data.status,
        email: data.email || null,
      },
    })

    // Responsabilidades: histórico por assignedAt/endedAt, nunca apagado.
    for (const r of before.responsibilities) {
      if (!nextResponsibilities.has(r.responsibilityId)) {
        await tx.memberResponsibility.update({
          where: { memberId_responsibilityId_assignedAt: { memberId: before.id, responsibilityId: r.responsibilityId, assignedAt: r.assignedAt } },
          data: { endedAt: today },
        })
      }
    }
    for (const responsibilityId of nextResponsibilities) {
      if (currentResponsibilities.has(responsibilityId)) continue
      await tx.memberResponsibility.upsert({
        where: { memberId_responsibilityId_assignedAt: { memberId: before.id, responsibilityId, assignedAt: today } },
        create: { memberId: before.id, responsibilityId, assignedAt: today },
        update: { endedAt: null },
      })
    }

    // Competências: nível atual; em branco remove a avaliação.
    const keep = new Set(data.competencies.map((c) => c.competencyId))
    await tx.memberCompetency.deleteMany({ where: { memberId: before.id, competencyId: { notIn: [...keep] } } })
    for (const c of data.competencies) {
      const previous = before.competencies.find((p) => p.competencyId === c.competencyId)
      if (previous?.currentLevel === c.level) continue
      await tx.memberCompetency.upsert({
        where: { memberId_competencyId: { memberId: before.id, competencyId: c.competencyId } },
        create: { memberId: before.id, competencyId: c.competencyId, currentLevel: c.level, assessedAt: today },
        update: { currentLevel: c.level, assessedAt: today },
      })
    }

    await recordCareerChanges(tx, user, before.id, data.reason, changes)

    await writeAudit(
      {
        action: "member.update",
        entity: "TeamMember",
        entityId: before.id,
        before: {
          ...memberSnapshot(before),
          responsibilityIds: [...currentResponsibilities],
          competencies: before.competencies.map((c) => ({ competencyId: c.competencyId, level: c.currentLevel })),
        },
        after: {
          ...memberSnapshot(after),
          responsibilityIds: data.responsibilityIds,
          competencies: data.competencies,
          careerChanges: changes.map((c) => c.type),
          reason: changes.length ? data.reason : null,
        },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })

  return { ok: true }
}

/** Desativar: status INACTIVE + deletedAt. Nunca apaga fisicamente (D10). */
export async function deactivateMemberRecord(user: Writer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = deactivateMemberSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.reasonRequired, fieldErrors: fieldErrorsOf(parsed.error) }

  const before = await db.teamMember.findFirst({ where: { id: parsed.data.id, ...memberScope(user) } })
  if (!before) return { ok: false, error: labels.validation.generic }

  await db.$transaction(async (tx) => {
    const after = await tx.teamMember.update({
      where: { id: before.id },
      data: { status: "INACTIVE", deletedAt: new Date() },
    })
    await recordCareerChanges(tx, user, before.id, parsed.data.reason, [
      {
        type: "STATUS",
        from: before.status,
        to: "INACTIVE",
        fromLabel: enumLabel("memberStatus", before.status),
        toLabel: enumLabel("memberStatus", "INACTIVE"),
      },
    ])
    await writeAudit(
      {
        action: "member.deactivate",
        entity: "TeamMember",
        entityId: before.id,
        before: memberSnapshot(before),
        after: { ...memberSnapshot(after), deletedAt: after.deletedAt?.toISOString() ?? null, reason: parsed.data.reason },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })

  return { ok: true }
}

/**
 * Reativa uma pessoa desativada: volta a ATIVO, sai do soft delete e grava o
 * evento de carreira (com motivo) na timeline.
 */
export async function reactivateMemberRecord(user: Writer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = reactivateMemberSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.reasonRequired, fieldErrors: fieldErrorsOf(parsed.error) }

  // deletedAt: undefined desliga o filtro automático de excluídos (a pessoa está desativada).
  const before = await db.teamMember.findFirst({ where: { id: parsed.data.id, ...memberScope(user), deletedAt: undefined } })
  if (!before || before.status !== "INACTIVE") return { ok: false, error: labels.validation.generic }

  await db.$transaction(async (tx) => {
    const after = await tx.teamMember.update({ where: { id: before.id }, data: { status: "ACTIVE", deletedAt: null } })
    await recordCareerChanges(tx, user, before.id, parsed.data.reason, [
      {
        type: "STATUS",
        from: before.status,
        to: "ACTIVE",
        fromLabel: enumLabel("memberStatus", before.status),
        toLabel: enumLabel("memberStatus", "ACTIVE"),
      },
    ])
    await writeAudit(
      {
        action: "member.reactivate",
        entity: "TeamMember",
        entityId: before.id,
        before: { ...memberSnapshot(before), deletedAt: before.deletedAt?.toISOString() ?? null },
        after: { ...memberSnapshot(after), deletedAt: null, reason: parsed.data.reason },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })

  return { ok: true }
}

/**
 * Resumo gerencial do perfil, editado inline. Não é evento de carreira nem
 * registro: não gera linha na timeline, só AuditLog com o texto anterior.
 */
export async function updateManagerSummaryRecord(user: Writer, input: unknown): Promise<ActionResult> {
  if (!canWrite(user)) return forbidden()
  const parsed = managerSummarySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic, fieldErrors: fieldErrorsOf(parsed.error) }

  const before = await db.teamMember.findFirst({ where: { id: parsed.data.id, ...memberScope(user) } })
  if (!before) return { ok: false, error: labels.validation.generic }
  const summary = parsed.data.managerSummary === "" ? null : parsed.data.managerSummary
  if (summary === before.managerSummary) return { ok: true }

  await db.$transaction(async (tx) => {
    await tx.teamMember.update({ where: { id: before.id }, data: { managerSummary: summary } })
    await writeAudit(
      {
        action: "member.summary.update",
        entity: "TeamMember",
        entityId: before.id,
        before: { managerSummary: before.managerSummary },
        after: { managerSummary: summary },
      },
      { organizationId: user.organizationId, userId: user.id, tx },
    )
  })
  return { ok: true }
}
