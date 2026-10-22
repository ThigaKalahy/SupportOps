import { randomInt } from "node:crypto"

import { Prisma, type ScrumMasterDrawMethod } from "@prisma/client"

import { isBusinessDay, todayBusinessDate } from "../lib/dates.ts"
import { labels } from "../lib/labels.ts"
import { MODULES } from "../lib/modules.ts"
import { vacationCovering } from "../lib/vacations.ts"

import { auditOf, writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { hasModule, requireManager, type TeamContext } from "./scope.ts"

/**
 * C19 — scrum master da daily (D46): quem conduz e registra a daily do dia.
 *
 * Rodada sem repetição: cada pessoa ATIVA, fora de férias no dia, conduz uma vez por rodada,
 * em ordem sorteada; só quando todos da rodada conduziram começa a próxima. Sorteio pulado
 * (a pessoa faltou — "Sortear de novo", só gestor) não conta: ela continua devendo a vez.
 *
 * Com o módulo DAILY_ROULETTE (só o Suporte), o time gira a roleta das 09h às 10h, em dia
 * útil, e o gestor gira a qualquer hora. Sem o módulo, a escolha é automática no primeiro
 * acesso do dia útil (`ensureAutoScrumMaster`), pela mesma regra. Um sorteio válido por time
 * e data (índice único parcial): dois giros ao mesmo tempo ficam com um só.
 */

export type ScrumMasterDrawResult =
  | { ok: true; memberId: string; name: string; round: number; candidates: string[] }
  | { ok: false; error: string }

const S = labels.scrumMaster

type Actor = { teamId: string; organizationId: string; userId: string | null }

/**
 * Sorteia o scrum master do dia, ou devolve o já sorteado. Núcleo comum ao gestor, ao
 * colaborador na roleta (pela ponte src/server/member-daily.ts) e ao sorteio automático.
 */
export async function drawScrumMasterFor(actor: Actor, method: ScrumMasterDrawMethod, today: Date = todayBusinessDate()): Promise<ScrumMasterDrawResult> {
  const { teamId } = actor
  const current = await db.scrumMasterDraw.findFirst({
    where: { teamId, date: today, skippedAt: null },
    select: { memberId: true, round: true, member: { select: { preferredName: true } } },
  })
  if (current) return { ok: true, memberId: current.memberId, name: current.member.preferredName, round: current.round, candidates: [current.member.preferredName] }

  const [skipped, pool, last] = await Promise.all([
    db.scrumMasterDraw.findMany({ where: { teamId, date: today, skippedAt: { not: null } }, select: { memberId: true } }),
    db.teamMember.findMany({
      where: { teamId, status: "ACTIVE", deletedAt: null, vacations: { none: vacationCovering(teamId, today) } },
      orderBy: { preferredName: "asc" },
      select: { id: true, preferredName: true },
    }),
    db.scrumMasterDraw.aggregate({ where: { teamId, skippedAt: null }, _max: { round: true } }),
  ])
  const absent = new Set(skipped.map((s) => s.memberId))
  const eligible = pool.filter((p) => !absent.has(p.id))
  if (!eligible.length) return { ok: false, error: S.noneEligible }

  let round = last._max.round ?? 1
  const done = new Set(
    (await db.scrumMasterDraw.findMany({ where: { teamId, round, skippedAt: null }, select: { memberId: true } })).map((d) => d.memberId),
  )
  let candidates = eligible.filter((p) => !done.has(p.id))
  // Todo mundo disponível já conduziu nesta rodada: começa a próxima.
  if (!candidates.length) {
    round++
    candidates = eligible
  }
  const winner = candidates[randomInt(candidates.length)]!

  try {
    await db.$transaction(async (tx) => {
      const draw = await tx.scrumMasterDraw.create({
        data: { teamId, date: today, memberId: winner.id, round, method, drawnByUserId: actor.userId },
        select: { id: true },
      })
      await writeAudit(
        { action: "daily.scrumMaster.draw", entity: "ScrumMasterDraw", entityId: draw.id, after: { memberId: winner.id, round, method, candidates: candidates.length } },
        { organizationId: actor.organizationId, teamId, userId: actor.userId, tx },
      )
    })
  } catch (error) {
    // Outra pessoa girou no mesmo instante: vale o sorteio dela.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return drawScrumMasterFor(actor, method, today)
    throw error
  }
  return { ok: true, memberId: winner.id, name: winner.preferredName, round, candidates: candidates.map((c) => c.preferredName) }
}

/** Gestor gira a roleta (ou sorteia, sem o módulo) a qualquer hora, em qualquer dia. */
export async function drawScrumMasterRecord(ctx: TeamContext): Promise<ScrumMasterDrawResult> {
  requireManager(ctx)
  return drawScrumMasterFor(ctx, hasModule(ctx, MODULES.DAILY_ROULETTE) ? "ROULETTE" : "AUTO")
}

/**
 * "Sortear de novo" (só gestor): o sorteado não pode conduzir hoje. O sorteio dele fica
 * marcado como pulado — não conta na rodada, ele continua devendo a vez — e sai outro.
 */
export async function skipScrumMasterRecord(ctx: TeamContext): Promise<ScrumMasterDrawResult> {
  requireManager(ctx)
  const today = todayBusinessDate()
  const current = await db.scrumMasterDraw.findFirst({ where: { teamId: ctx.teamId, date: today, skippedAt: null }, select: { id: true, memberId: true } })
  if (current) {
    await db.$transaction(async (tx) => {
      await tx.scrumMasterDraw.updateMany({ where: { teamId: ctx.teamId, id: current.id, skippedAt: null }, data: { skippedAt: new Date(), skippedByUserId: ctx.userId } })
      await writeAudit({ action: "daily.scrumMaster.skip", entity: "ScrumMasterDraw", entityId: current.id, before: { memberId: current.memberId } }, auditOf(ctx, tx))
    })
  }
  return drawScrumMasterFor(ctx, hasModule(ctx, MODULES.DAILY_ROULETTE) ? "ROULETTE" : "AUTO", today)
}

/**
 * Times sem a roleta: a escolha é automática no primeiro acesso do dia útil (home do
 * gestor ou portal). Idempotente — com sorteio válido no dia, não faz nada.
 */
export async function ensureAutoScrumMaster(team: { teamId: string; organizationId: string; roulette: boolean }, now: Date = new Date()): Promise<void> {
  const today = todayBusinessDate(now)
  if (team.roulette || !isBusinessDay(today)) return
  const exists = await db.scrumMasterDraw.count({ where: { teamId: team.teamId, date: today, skippedAt: null } })
  if (exists) return
  const result = await drawScrumMasterFor({ teamId: team.teamId, organizationId: team.organizationId, userId: null }, "AUTO", today)
  // Sem ninguém disponível (time vazio, todos de férias): não há scrum master hoje, e tudo bem.
  if (!result.ok) return
}
