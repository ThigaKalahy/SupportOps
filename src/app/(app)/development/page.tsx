import type { Metadata } from "next"
import Link from "next/link"

import { PlanReviewAge } from "@/components/development/plan-block"
import { PlansTable } from "@/components/development/plans-table"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { StatStrip } from "@/components/ui/stat-strip"
import { formatDate } from "@/lib/dates"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { canWrite, requireTeamContext } from "@/server/scope"
import { getDevelopmentOverview } from "@/server/queries/development"
import { listCompetencies } from "@/server/queries/settings"

const D = labels.development
const O = D.overview
const STATUSES = ["ACTIVE", "PAUSED", "DRAFT", "DONE", "CANCELLED"] as const

export const metadata: Metadata = {
  title: `${labels.nav.development} · ${labels.app.name}`,
}

/**
 * Desenvolvimento do time: PDIs por status, os parados em destaque, todos os
 * PDIs, o mapa de mentorias (agrupado por mentor) e a prontidão para a
 * próxima senioridade — rótulo neutro, sem nota, sem porcentagem, sem ordem
 * entre pessoas.
 */
export default async function DevelopmentPage() {
  const ctx = await requireTeamContext()
  const [overview, competencies] = await Promise.all([getDevelopmentOverview(ctx), listCompetencies(ctx)])

  // Time recém-criado (P24): sem competência não há PDI possível — diga o que fazer.
  if (competencies.length === 0 && overview.plans.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={D.title} subtitle={D.subtitle} />
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState
            title={O.noCompetenciesTitle}
            direction={canWrite(ctx) ? O.noCompetenciesDirection : O.noCompetenciesReadOnly}
            action={
              canWrite(ctx) ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/settings/competencies">{O.noCompetenciesAction}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      </div>
    )
  }
  // Ordem da tabela: status (ativos primeiro) e nome — nunca desempenho.
  const plans = [...overview.plans].sort(
    (a, b) =>
      STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) ||
      a.member.preferredName.localeCompare(b.member.preferredName) ||
      a.objective.localeCompare(b.objective),
  )

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={D.title} subtitle={D.subtitle} />

      <Section title={O.byStatus}>
        <StatStrip
          aria-label={O.byStatus}
          items={STATUSES.map((s) => ({ id: s, label: enumLabel("planStatus", s), value: overview.counts[s] }))}
        />
      </Section>

      <Section title={O.stale} count={overview.stale.length}>
        <p className="-mt-2 text-xs text-ink-secondary">{fill(O.staleDirection, { days: overview.staleDays })}</p>
        {overview.stale.length === 0 ? (
          <p className="text-sm text-ink-secondary">{O.staleNone}</p>
        ) : (
          <ul className="flex flex-col rounded-lg border border-line bg-surface">
            {overview.stale.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-3 py-2 last:border-b-0">
                <Link href={`/team/${p.member.id}/development`} className="w-32 shrink-0 font-medium text-ink hover:underline">
                  {p.member.preferredName}
                </Link>
                <span className="min-w-0 flex-1 text-sm text-ink">{p.objective}</span>
                <PlanReviewAge plan={p} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={O.allPlans} count={plans.length}>
        <PlansTable plans={plans} />
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title={D.mentorships.title} count={overview.mentorGroups.length}>
          <p className="-mt-2 text-xs text-ink-secondary">{D.mentorships.direction}</p>
          {overview.mentorGroups.length === 0 ? (
            <p className="text-sm text-ink-secondary">{D.mentorships.empty}</p>
          ) : (
            <ul className="flex flex-col">
              {overview.mentorGroups.map((g) => (
                <li key={g.mentor.id} className="flex flex-col gap-1 border-b border-line py-2 last:border-b-0">
                  <span className="flex items-baseline justify-between gap-3">
                    <Link href={`/team/${g.mentor.id}/development`} className="text-sm font-medium text-ink hover:underline">
                      {g.mentor.preferredName}
                    </Link>
                    <span className="font-mono text-2xs text-ink-secondary">{plural(D.mentorships.mentees, g.mentees.length)}</span>
                  </span>
                  <ul className="flex flex-col gap-0.5 pl-4">
                    {g.mentees.map((m) => (
                      <li key={m.linkId} className="text-sm text-ink">
                        {m.preferredName}
                        <span className="text-xs text-ink-secondary">
                          {" · "}
                          {m.competency ?? D.mentorships.noCompetency} ·{" "}
                          {fill(D.mentorships.since, { date: formatDate(m.startedAt, "business") })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={D.readiness.title} count={overview.readiness.length}>
          <p className="-mt-2 text-xs text-ink-secondary">{D.readiness.direction}</p>
          {overview.matrixEmpty ? (
            <p className="text-sm text-ink-secondary">
              {D.readiness.matrixEmpty}{" "}
              {canWrite(ctx) ? (
                <Link href="/settings/competency-matrix" className="text-accent underline underline-offset-2">
                  {D.competencies.matrixLink}
                </Link>
              ) : null}
            </p>
          ) : overview.readiness.length === 0 ? (
            <p className="text-sm text-ink-secondary">{D.readiness.empty}</p>
          ) : (
            <ul className="flex flex-col">
              {overview.readiness.map((r) => (
                <li key={r.member.id} className="flex flex-col gap-0.5 border-b border-line py-2 last:border-b-0">
                  <Link href={`/team/${r.member.id}/development`} className="text-sm font-medium text-ink hover:underline">
                    {r.member.preferredName}
                  </Link>
                  <span className="text-sm text-ink-secondary">
                    {fill(D.readiness.line, { seniority: r.readiness.next.label, met: r.readiness.met, total: r.readiness.total })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}
