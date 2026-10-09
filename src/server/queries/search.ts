import { Prisma, type TimelineEventType, type Visibility } from "@prisma/client"

import { todayBusinessDate } from "../../lib/dates.ts"
import { searchPeriodStart, toTsQuery, type SearchKind, type SearchPeriod } from "../../lib/search.ts"

import { db } from "../db.ts"
import { teamScope, teamSql, type TeamContext } from "../scope.ts"
import { visibilitySql } from "../visibility.ts"

/**
 * Busca global (P16): Postgres full-text em português sobre as colunas
 * tsvector geradas (migration full_text_search) — 1:1, feedback, anotação,
 * combinado e as demais linhas da timeline (daily, PDI, mudança de carreira).
 * Pessoas por nome, sem acento.
 *
 * Cada tabela sensível passa por visibilitySql no próprio SQL: o VIEWER não
 * encontra registro PRIVATE nem por busca, nem pela contagem (o total é
 * contado depois do filtro). Escopo de organização (e de time, para MANAGER)
 * pelo join com TeamMember/Team. Registros excluídos (deletedAt) ficam fora;
 * pessoas desligadas continuam encontráveis — o histórico é delas.
 */

export interface SearchHit {
  kind: SearchKind
  id: string
  member: { id: string; preferredName: string }
  /** Rótulo curto do registro (assuntos do 1:1, comportamento do feedback...). */
  title: string
  /** Texto onde o trecho e o destaque são procurados. */
  body: string
  date: Date
  /** true quando `date` é data de negócio (@db.Date); false quando é instante. */
  businessDate: boolean
  href: string
  visibility: Visibility | null
  /** Subtipo da timeline ("other"): daily, PDI, mudança de carreira. */
  eventType?: TimelineEventType
}

export interface SearchGroup {
  kind: SearchKind
  hits: SearchHit[]
  /** Total de resultados do tipo (a lista traz até `limit`). */
  total: number
}

export interface SearchResults {
  query: string
  groups: SearchGroup[]
  /** Tempo da busca no servidor, em ms (critério de aceite: < 300ms). */
  ms: number
}

/** Tipos da timeline que não têm tabela própria na busca. */
const OTHER_TYPES: TimelineEventType[] = ["DAILY", "DEVELOPMENT", "SENIORITY_CHANGE", "ROLE_CHANGE", "INCIDENT"]

interface Row {
  id: string
  memberId: string
  preferredName: string
  title: string | null
  body: string | null
  date: Date
  visibility: Visibility | null
  total: number
  type?: TimelineEventType
  dailyId?: string | null
}

const firstLine = (text: string | null) => (text ?? "").split("\n")[0]?.trim() ?? ""

export async function searchAll(
  ctx: TeamContext,
  query: string,
  options: { kinds?: SearchKind[] | null; limit?: number; period?: SearchPeriod } = {},
): Promise<SearchResults> {
  const started = performance.now()
  const tsq = toTsQuery(query)
  const kinds = options.kinds?.length ? options.kinds : null
  const limit = options.limit ?? 5
  if (!tsq) return { query, groups: [], ms: 0 }

  const want = (k: SearchKind) => !kinds || kinds.includes(k)
  const start = searchPeriodStart(options.period ?? "all", todayBusinessDate())
  const sinceDate = (column: Prisma.Sql) => (start ? Prisma.sql`AND ${column} >= ${start}` : Prisma.empty)
  const like = `%${query.trim().slice(0, 80).replace(/[\\%_]/g, (c) => `\\${c}`)}%`

  const [people, ones, feedbacks, notes, agreements, others] = await Promise.all([
    want("person")
      ? db.$queryRaw<Row[]>`
          SELECT m."id", m."id" AS "memberId", m."preferredName", m."fullName" AS "title", m."position" AS "body",
                 m."joinedAt" AS "date", NULL AS "visibility", count(*) OVER ()::int AS "total"
          FROM "TeamMember" m
          WHERE ${teamSql(ctx, "m")}
            AND (public.immutable_unaccent(m."preferredName") ILIKE public.immutable_unaccent(${like})
              OR public.immutable_unaccent(m."fullName") ILIKE public.immutable_unaccent(${like}))
          ORDER BY m."deletedAt" NULLS FIRST, m."preferredName"
          LIMIT ${limit}`
      : [],
    want("oneOnOne")
      ? db.$queryRaw<Row[]>`
          SELECT o."id", o."memberId", m."preferredName", o."topics" AS "title",
                 concat_ws(' · ', o."topics", o."memberPerception", o."managerPerception", o."wins", o."difficulties", o."development") AS "body",
                 o."date", o."visibility", count(*) OVER ()::int AS "total"
          FROM "OneOnOne" o JOIN "TeamMember" m ON m."id" = o."memberId",
               to_tsquery('portuguese', ${tsq}) q
          WHERE o."searchVector" @@ q AND o."deletedAt" IS NULL AND ${teamSql(ctx, "o")} AND m."teamId" = o."teamId"
            ${visibilitySql(ctx, "o")} ${sinceDate(Prisma.sql`o."date"`)}
          ORDER BY ts_rank(o."searchVector", q) DESC, o."date" DESC
          LIMIT ${limit}`
      : [],
    want("feedback")
      ? db.$queryRaw<Row[]>`
          SELECT f."id", f."memberId", m."preferredName", f."behavior" AS "title",
                 concat_ws(' · ', f."behavior", f."context", f."impact", f."guidance") AS "body",
                 f."date", f."visibility", count(*) OVER ()::int AS "total"
          FROM "Feedback" f JOIN "TeamMember" m ON m."id" = f."memberId",
               to_tsquery('portuguese', ${tsq}) q
          WHERE f."searchVector" @@ q AND f."deletedAt" IS NULL AND ${teamSql(ctx, "f")} AND m."teamId" = f."teamId"
            ${visibilitySql(ctx, "f")} ${sinceDate(Prisma.sql`f."date"`)}
          ORDER BY ts_rank(f."searchVector", q) DESC, f."date" DESC
          LIMIT ${limit}`
      : [],
    want("note")
      ? db.$queryRaw<Row[]>`
          SELECT n."id", n."memberId", m."preferredName", n."title", n."body",
                 n."occurredAt" AS "date", n."visibility", count(*) OVER ()::int AS "total"
          FROM "Note" n JOIN "TeamMember" m ON m."id" = n."memberId",
               to_tsquery('portuguese', ${tsq}) q
          WHERE n."searchVector" @@ q AND n."deletedAt" IS NULL AND ${teamSql(ctx, "n")} AND m."teamId" = n."teamId"
            ${visibilitySql(ctx, "n")} ${sinceDate(Prisma.sql`n."occurredAt"`)}
          ORDER BY ts_rank(n."searchVector", q) DESC, n."occurredAt" DESC
          LIMIT ${limit}`
      : [],
    want("agreement")
      ? db.$queryRaw<Row[]>`
          SELECT a."id", a."memberId", m."preferredName", a."title",
                 concat_ws(' · ', a."title", a."description", a."outcome") AS "body",
                 a."dueDate" AS "date", NULL AS "visibility", count(*) OVER ()::int AS "total"
          FROM "Agreement" a JOIN "TeamMember" m ON m."id" = a."memberId",
               to_tsquery('portuguese', ${tsq}) q
          WHERE a."searchVector" @@ q AND a."deletedAt" IS NULL AND ${teamSql(ctx, "a")} AND m."teamId" = a."teamId"
            ${sinceDate(Prisma.sql`a."createdAt"`)}
          ORDER BY ts_rank(a."searchVector", q) DESC, a."createdAt" DESC
          LIMIT ${limit}`
      : [],
    want("other")
      ? db.$queryRaw<Row[]>`
          SELECT e."id", e."memberId", m."preferredName", e."title", concat_ws(' · ', e."title", e."summary") AS "body",
                 e."occurredAt" AS "date", e."visibility", e."type", e."dailyId", count(*) OVER ()::int AS "total"
          FROM "TimelineEvent" e JOIN "TeamMember" m ON m."id" = e."memberId",
               to_tsquery('portuguese', ${tsq}) q
          WHERE e."searchVector" @@ q AND e."type"::text = ANY(${OTHER_TYPES}) AND ${teamSql(ctx, "e")} AND m."teamId" = e."teamId"
            ${visibilitySql(ctx, "e")} ${sinceDate(Prisma.sql`e."occurredAt"`)}
          ORDER BY ts_rank(e."searchVector", q) DESC, e."occurredAt" DESC
          LIMIT ${limit}`
      : [],
  ])

  const hit = (kind: SearchKind, r: Row, href: string, businessDate: boolean, title?: string): SearchHit => ({
    kind,
    id: r.id,
    member: { id: r.memberId, preferredName: r.preferredName },
    title: title ?? firstLine(r.title),
    body: r.body ?? "",
    date: r.date,
    businessDate,
    href,
    visibility: r.visibility,
    ...(r.type ? { eventType: r.type } : {}),
  })
  const records = (kind: "oneOnOne" | "feedback", r: Row) =>
    `/team/${r.memberId}/records?period=all&open=${kind}:${r.id}`

  const group = (kind: SearchKind, rows: Row[], toHit: (r: Row) => SearchHit): SearchGroup => ({
    kind,
    hits: rows.map(toHit),
    total: rows[0]?.total ?? 0,
  })
  const groups = [
    group("person", people, (r) => hit("person", r, `/team/${r.id}`, true, r.title ?? r.preferredName)),
    group("oneOnOne", ones, (r) => hit("oneOnOne", r, records("oneOnOne", r), true)),
    group("feedback", feedbacks, (r) => hit("feedback", r, records("feedback", r), true)),
    group("note", notes, (r) =>
      hit("note", r, `/team/${r.memberId}/timeline?types=NOTE&q=${encodeURIComponent(firstLine(r.title).slice(0, 60))}`, false),
    ),
    group("agreement", agreements, (r) => hit("agreement", r, `/agreements/${r.id}`, true)),
    group("other", others, (r) =>
      hit(
        "other",
        r,
        r.type === "DAILY" && r.dailyId
          ? `/dailies/${r.dailyId}`
          : r.type === "DEVELOPMENT"
            ? `/team/${r.memberId}/development`
            : `/team/${r.memberId}/timeline`,
        false,
      ),
    ),
  ].filter((g) => g.hits.length > 0)

  return { query, groups, ms: Math.round(performance.now() - started) }
}

export interface RecentAgreement {
  id: string
  title: string
  dueDate: Date
  member: { id: string; preferredName: string }
}

/** Combinados recentes para a paleta (abertos, os criados por último). Combinado não tem visibilidade própria. */
export async function recentAgreements(ctx: TeamContext, take = 5): Promise<RecentAgreement[]> {
  const rows = await db.agreement.findMany({
    where: { ...teamScope(ctx), status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, title: true, dueDate: true, member: { select: { id: true, preferredName: true } } },
  })
  return rows
}
