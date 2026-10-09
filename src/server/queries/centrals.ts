import { businessRangeInstants } from "../../lib/dates.ts"
import { rate } from "../../lib/priority-validation.ts"
import { db } from "../db.ts"
import { MODULES } from "../../lib/modules.ts"
import { hasModule, requireModule, teamScope, type TeamContext } from "../scope.ts"

/**
 * Leituras de Central (P19, D20). As métricas recebem um intervalo de datas de
 * negócio (inclusivo) e contam por central — `null` é "sem central informada",
 * linha legítima que mostra a cobertura real do campo. Combinado conta pela
 * data de criação; validação pela data da validação; daily pela data da daily.
 *
 * A unidade de análise é a central. `centralByMember` existe para investigar
 * carga, nunca para comparar desempenho de pessoas (D7): não há tela que
 * ordene pessoas por ele.
 *
 * Módulo CENTRALS (D32): toda leitura daqui lança com ele desligado. As contagens de
 * validação só existem com o módulo de validação de prioridade ligado.
 */

/** Centrais ativas, por nome, para os comboboxes. */
export async function listActiveCentrals(ctx: TeamContext): Promise<{ id: string; name: string }[]> {
  requireModule(ctx, MODULES.CENTRALS)
  return db.central.findMany({
    where: { ...teamScope(ctx), isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
}

/** Todas as centrais (inclusive desativadas), para filtros de listagem: o histórico aponta para elas. */
export async function listCentralsForFilter(ctx: TeamContext): Promise<{ id: string; name: string; isActive: boolean }[]> {
  requireModule(ctx, MODULES.CENTRALS)
  return db.central.findMany({
    where: teamScope(ctx),
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  })
}

/** Combinados e validações por central no período, separados. */
export async function volumeByCentral(ctx: TeamContext, from: Date, to: Date) {
  requireModule(ctx, MODULES.CENTRALS)
  const range = businessRangeInstants(from, to)
  const [agreements, validations] = await Promise.all([
    db.agreement.groupBy({ by: ["centralId"], where: { ...teamScope(ctx), createdAt: range }, _count: { _all: true } }),
    hasModule(ctx, MODULES.PRIORITY_VALIDATION)
      ? db.priorityValidation.groupBy({ by: ["centralId"], where: { ...teamScope(ctx), validatedAt: range }, _count: { _all: true } })
      : Promise.resolve([]),
  ])
  return {
    agreements: new Map(agreements.map((r) => [r.centralId, r._count._all])),
    validations: new Map(validations.map((r) => [r.centralId, r._count._all])),
  }
}

/** Centrais que apareceram em combinados criados em daily, com o número de dailies distintas. */
export async function centralsInDailies(ctx: TeamContext, from: Date, to: Date): Promise<Map<string, number>> {
  requireModule(ctx, MODULES.CENTRALS)
  const rows = await db.agreement.findMany({
    where: { ...teamScope(ctx), centralId: { not: null }, sourceDaily: { date: { gte: from, lte: to } } },
    select: { centralId: true, sourceDailyId: true },
  })
  const dailies = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.centralId || !r.sourceDailyId) continue
    const set = dailies.get(r.centralId) ?? new Set<string>()
    set.add(r.sourceDailyId)
    dailies.set(r.centralId, set)
  }
  return new Map([...dailies].map(([id, set]) => [id, set.size]))
}

export interface CentralMemberLoad {
  centralId: string | null
  memberId: string
  agreements: number
  validations: number
}

/** Cruzamento central × analista: quanto de cada central passou por cada pessoa (carga, não desempenho). */
export async function centralByMember(ctx: TeamContext, from: Date, to: Date): Promise<CentralMemberLoad[]> {
  requireModule(ctx, MODULES.CENTRALS)
  const range = businessRangeInstants(from, to)
  const [agreements, validations] = await Promise.all([
    db.agreement.groupBy({ by: ["centralId", "memberId"], where: { ...teamScope(ctx), createdAt: range }, _count: { _all: true } }),
    hasModule(ctx, MODULES.PRIORITY_VALIDATION)
      ? db.priorityValidation.groupBy({ by: ["centralId", "memberId"], where: { ...teamScope(ctx), validatedAt: range }, _count: { _all: true } })
      : Promise.resolve([]),
  ])
  const key = (centralId: string | null, memberId: string) => `${centralId ?? ""}|${memberId}`
  const out = new Map<string, CentralMemberLoad>()
  const get = (centralId: string | null, memberId: string) => {
    const k = key(centralId, memberId)
    const row = out.get(k) ?? { centralId, memberId, agreements: 0, validations: 0 }
    out.set(k, row)
    return row
  }
  for (const r of agreements) get(r.centralId, r.memberId).agreements += r._count._all
  for (const r of validations) get(r.centralId, r.memberId).validations += r._count._all
  return [...out.values()]
}

export interface CentralDispute {
  total: number
  /** Elevadas + rebaixadas + devolvidas (mesma regra do resumo de /priority-validations). */
  changed: number
  /** % inteiro; null sem validação (nunca 0% de nada). */
  changeRate: number | null
}

/** Taxa de alteração de prioridade por central, sempre com o total ao lado (D19). */
export async function priorityDisputeByCentral(ctx: TeamContext, from: Date, to: Date): Promise<Map<string | null, CentralDispute>> {
  requireModule(ctx, MODULES.CENTRALS)
  if (!hasModule(ctx, MODULES.PRIORITY_VALIDATION)) return new Map()
  const rows = await db.priorityValidation.groupBy({
    by: ["centralId", "outcome"],
    where: { ...teamScope(ctx), validatedAt: businessRangeInstants(from, to) },
    _count: { _all: true },
  })
  const out = new Map<string | null, CentralDispute>()
  for (const r of rows) {
    const row = out.get(r.centralId) ?? { total: 0, changed: 0, changeRate: null }
    row.total += r._count._all
    if (r.outcome !== "MAINTAINED") row.changed += r._count._all
    out.set(r.centralId, row)
  }
  for (const row of out.values()) row.changeRate = rate(row.changed, row.total)
  return out
}

export interface CentralMetricRow {
  /** null = sem central informada. */
  id: string | null
  name: string | null
  isActive: boolean
  agreements: number
  validations: number
  dispute: CentralDispute | null
  dailies: number
}

/**
 * Tabela da seção "Por central" de /agreements/adherence: uma linha por central
 * com movimento no período, por volume total decrescente, e a linha "sem central
 * informada" sempre no fim (com a contagem, mesmo zero quando há outras linhas).
 */
export async function centralMetrics(ctx: TeamContext, from: Date, to: Date): Promise<{ rows: CentralMetricRow[]; none: CentralMetricRow; totals: { agreements: number; validations: number } }> {
  const [volume, dailies, dispute, centrals] = await Promise.all([
    volumeByCentral(ctx, from, to),
    centralsInDailies(ctx, from, to),
    priorityDisputeByCentral(ctx, from, to),
    listCentralsForFilter(ctx),
  ])
  const row = (id: string | null, name: string | null, isActive: boolean): CentralMetricRow => ({
    id,
    name,
    isActive,
    agreements: volume.agreements.get(id) ?? 0,
    validations: volume.validations.get(id) ?? 0,
    dispute: dispute.get(id) ?? null,
    dailies: id ? (dailies.get(id) ?? 0) : 0,
  })
  const rows = centrals
    .map((c) => row(c.id, c.name, c.isActive))
    .filter((r) => r.agreements + r.validations + r.dailies > 0)
    .sort((a, b) => b.agreements + b.validations - (a.agreements + a.validations) || (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"))
  const sum = (m: Map<string | null, number>) => [...m.values()].reduce((a, b) => a + b, 0)
  return {
    rows,
    none: row(null, null, true),
    totals: { agreements: sum(volume.agreements), validations: sum(volume.validations) },
  }
}
