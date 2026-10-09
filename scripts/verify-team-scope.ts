/**
 * pnpm db:verify-teams — verificação do P22 depois das migrations A, B e C.
 * SOMENTE LEITURA. Imprime:
 * - linhas com teamId nulo em cada tabela de dado de time (tem que ser 0 em todas);
 * - os times, com slug, ativo e módulos ligados;
 * - quantos TeamAccess ativos (e revogados) cada usuário tem, com o nível;
 * - linhas por time em cada tabela (P24: comparar antes e depois de abrir um time).
 * Sai com código 1 se alguma tabela tiver teamId nulo.
 */
import { Prisma } from "@prisma/client"

import { db } from "../src/server/db.ts"

const TABLES = [
  "TeamMember", "Daily", "Seniority", "Competency", "CompetencyExpectation", "Responsibility", "BlockerReason", "Central",
  "TicketUrlPattern", "PriorityLevel", "ReclassificationReason", "DevReturnReason", "MetricDefinition", "ScoreDefinition",
  "WatchItem", "AlertThreshold", "Agreement", "OneOnOne", "Feedback", "Note", "TimelineEvent", "DevelopmentPlan",
  "MemberChange", "MentorshipLink", "MemberCompetency", "AgreementCheckin", "PriorityValidation", "DevReturn",
  "MemberTrait", "MemberResponsibility", "DailyParticipant", "AgreementParticipant", "WatchReview", "DevelopmentAction",
  "ScoreComponent", "MetricResult", "ScoreResult", "ScoreResultComponent",
]

async function main() {
  console.log("\nLinhas com teamId nulo, por tabela:")
  let nulls = 0
  for (const table of TABLES) {
    const [row] = await db.$queryRaw<{ total: number; empty: number }[]>(
      Prisma.sql`SELECT count(*)::int AS "total", count(*) FILTER (WHERE "teamId" IS NULL)::int AS "empty" FROM ${Prisma.raw(`"${table}"`)}`,
    )
    nulls += row?.empty ?? 0
    console.log(`  ${table.padEnd(24)} ${String(row?.empty ?? 0).padStart(5)} nulas de ${row?.total ?? 0}`)
  }

  console.log("\nTimes:")
  const teams = await db.team.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, isActive: true, modules: { where: { isEnabled: true }, select: { moduleKey: true } } },
  })
  for (const t of teams) {
    console.log(`  ${t.name} (${t.slug}) ${t.isActive ? "ativo" : "DESATIVADO"} — módulos: ${t.modules.map((m) => m.moduleKey).join(", ") || "nenhum"}`)
  }

  console.log("\nTeamAccess por usuário:")
  const users = await db.user.findMany({
    orderBy: { email: "asc" },
    select: { email: true, isPlatformAdmin: true, teamAccesses: { select: { level: true, revokedAt: true, team: { select: { slug: true } } } } },
  })
  for (const u of users) {
    const active = u.teamAccesses.filter((a) => !a.revokedAt)
    const revoked = u.teamAccesses.length - active.length
    const list = active.map((a) => `${a.team.slug}:${a.level}`).join(", ") || "nenhum"
    console.log(`  ${u.email}${u.isPlatformAdmin ? " [admin]" : ""} — ${active.length} ativo(s): ${list}${revoked ? ` · ${revoked} revogado(s)` : ""}`)
  }

  console.log("\nLinhas por time (tabelas com dado):")
  const slugs = new Map(teams.map((t) => [t.id, t.slug]))
  const totals = new Map<string, number>()
  for (const table of TABLES) {
    const rows = await db.$queryRaw<{ teamId: string | null; n: number }[]>(
      Prisma.sql`SELECT "teamId", count(*)::int AS "n" FROM ${Prisma.raw(`"${table}"`)} GROUP BY "teamId" ORDER BY "teamId"`,
    )
    if (rows.length === 0) continue
    console.log(`  ${table.padEnd(24)} ${rows.map((r) => `${slugs.get(r.teamId ?? "") ?? r.teamId}=${r.n}`).join("  ")}`)
    for (const r of rows) totals.set(r.teamId ?? "", (totals.get(r.teamId ?? "") ?? 0) + r.n)
  }
  console.log(`  ${"TOTAL".padEnd(24)} ${[...totals].map(([id, n]) => `${slugs.get(id) ?? id}=${n}`).join("  ")}`)

  console.log(nulls === 0 ? "\nOK: nenhuma linha sem time." : `\nFALHA: ${nulls} linha(s) sem time.`)
  if (nulls > 0) process.exitCode = 1
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
