import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"

import { DragIndicator, AgreementStatusCell } from "@/components/agreements/agreements-table"
import { CrumbLabel } from "@/components/shell/crumb-label"
import { ContextActions } from "@/components/shell/context-actions"
import { WatchButton } from "@/components/watch/watch-button"
import { DateStamp } from "@/components/ui/date-stamp"
import { EmptyState } from "@/components/ui/empty-state"
import { MetaLabel } from "@/components/ui/meta-label"
import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { StatusPill } from "@/components/ui/status-pill"
import { formatDate } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import type { Severity } from "@/lib/severity"
import { canWrite, requireTeamContext } from "@/server/scope"
import { getAgreementDetail, type AgreementCheckinRow } from "@/server/queries/agreements"
import { activeWatchByLink } from "@/server/queries/watch"

import { AgreementActions } from "./_components/agreement-actions"

const D = labels.agreements.detail

const load = cache(async (id: string) => {
  const ctx = await requireTeamContext()
  return { ctx, agreement: await getAgreementDetail(ctx, id) }
})

export async function generateMetadata({ params }: { params: Promise<{ agreementId: string }> }): Promise<Metadata> {
  const { agreement } = await load((await params).agreementId)
  return { title: `${agreement?.title ?? labels.nav.agreements} · ${labels.app.name}` }
}

const OUTCOME_SEVERITY: Record<AgreementCheckinRow["outcome"], Severity> = {
  DONE: "calm",
  PARTIAL: "attention",
  NOT_DONE: "overdue",
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <MetaLabel asChild>
        <dt>{label}</dt>
      </MetaLabel>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  )
}

/**
 * Detalhe do combinado. O centro é o histórico de revisões nas dailies, em
 * ordem cronológica — é aqui que o arrasto fica legível: prazo original,
 * cada desfecho, cada impeditivo, cada novo prazo.
 */
export default async function AgreementDetailPage({ params }: { params: Promise<{ agreementId: string }> }) {
  const { ctx, agreement } = await load((await params).agreementId)
  if (!agreement) notFound()

  const moved = agreement.dueDate.getTime() !== agreement.originalDueDate.getTime()
  const watching = canWrite(ctx) ? ((await activeWatchByLink(ctx, "agreementId", [agreement.id]))[agreement.id] ?? null) : null

  return (
    <div className="flex flex-col gap-8">
      <CrumbLabel segment={agreement.id} label={agreement.title} />
      {canWrite(ctx) ? (
        <ContextActions>
          {/* P21: observar este combinado (abre a observação existente, se houver). */}
          <WatchButton
            origin="AGREEMENT"
            defaults={{ title: agreement.title, heat: "MEDIUM" }}
            link={{ agreementId: agreement.id }}
            existing={watching}
          />
          <AgreementActions
            open={agreement.open}
            agreement={{
              id: agreement.id,
              title: agreement.title,
              description: agreement.description ?? "",
              priority: agreement.priority,
            }}
          />
        </ContextActions>
      ) : null}

      <PageHeader
        title={agreement.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/team/${agreement.member.id}`} className="font-medium text-ink hover:underline">
              {agreement.member.preferredName}
            </Link>
            <span aria-hidden>·</span>
            <AgreementStatusCell status={agreement.status} />
            {agreement.open && agreement.deadline.stage !== "on-track" ? (
              <StatusPill severity={agreement.deadline.severity} strong={agreement.deadline.strong} label={agreement.deadline.label} />
            ) : null}
            <DragIndicator reschedules={agreement.reschedules} />
          </span>
        }
      />

      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        <Fact label={D.originalDueDate}>
          <DateStamp date={agreement.originalDueDate} kind="business" className="text-sm" />
        </Fact>
        <Fact label={D.dueDate}>
          <DateStamp date={agreement.dueDate} kind="business" className="text-sm" />
          {moved ? <span className="text-ink-secondary"> · +{agreement.slipDays}d</span> : null}
        </Fact>
        <Fact label={D.createdAt}>
          <DateStamp date={agreement.createdAt} className="text-sm" />
        </Fact>
        <Fact label={D.origin}>
          {agreement.sourceDaily
            ? fill(D.sourceDaily, { date: formatDate(agreement.sourceDaily.date, "business") })
            : enumLabel("agreementOrigin", agreement.origin)}
        </Fact>
        <Fact label={D.priority}>{enumLabel("agreementPriority", agreement.priority)}</Fact>
        <Fact label={D.author}>{agreement.author}</Fact>
        {agreement.completedAt ? (
          <Fact label={D.completedAt}>
            <DateStamp date={agreement.completedAt} kind="business" className="text-sm" />
          </Fact>
        ) : null}
        {agreement.replaces ? (
          <Fact label={D.replaces}>
            <Link href={`/agreements/${agreement.replaces.id}`} className="text-accent hover:underline">
              {agreement.replaces.title}
            </Link>
          </Fact>
        ) : null}
        {agreement.replacedBy ? (
          <Fact label={D.replacedBy}>
            <Link href={`/agreements/${agreement.replacedBy.id}`} className="text-accent hover:underline">
              {agreement.replacedBy.title}
            </Link>
          </Fact>
        ) : null}
      </dl>

      {agreement.description || agreement.outcome ? (
        <div className="grid gap-6 md:grid-cols-2">
          {agreement.description ? (
            <Section title={D.description}>
              <p className="text-sm whitespace-pre-line text-ink">{agreement.description}</p>
            </Section>
          ) : null}
          {agreement.outcome ? (
            <Section title={agreement.status === "CANCELLED" ? D.cancelReason : D.outcome}>
              <p className="text-sm whitespace-pre-line text-ink">{agreement.outcome}</p>
            </Section>
          ) : null}
        </div>
      ) : null}

      <Section
        title={D.checkins}
        count={agreement.checkins.length}
        action={
          moved ? (
            <span className="text-xs text-ink-secondary">
              {fill(D.dragSummary, {
                count: agreement.reschedules,
                date: formatDate(agreement.originalDueDate, "business"),
              })}
            </span>
          ) : null
        }
      >
        {agreement.checkins.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line">
            <EmptyState size="compact" title={D.checkinsEmpty} direction={D.checkinsEmptyDirection} />
          </div>
        ) : (
          <ol className="flex flex-col rounded-lg border border-line bg-surface">
            <li className="hidden grid-cols-[112px_112px_minmax(0,1fr)_120px] gap-x-4 border-b border-line bg-surface-sunken px-3 py-1.5 md:grid">
              <MetaLabel>{D.checkinColumns.date}</MetaLabel>
              <MetaLabel>{D.checkinColumns.outcome}</MetaLabel>
              <MetaLabel>{D.checkinColumns.blocker}</MetaLabel>
              <MetaLabel>{D.checkinColumns.newDueDate}</MetaLabel>
            </li>
            {agreement.checkins.map((c) => (
              <li
                key={c.id}
                className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-line px-3 py-2.5 last:border-b-0 md:grid-cols-[112px_112px_minmax(0,1fr)_120px]"
              >
                <DateStamp date={c.dailyDate} kind="business" className="text-ink" />
                <span>
                  <StatusPill severity={OUTCOME_SEVERITY[c.outcome]} label={enumLabel("checkinOutcome", c.outcome)} />
                </span>
                <span className="col-span-2 flex min-w-0 flex-col gap-0.5 md:col-span-1">
                  {c.blockerText ? <span className="text-sm text-ink">{c.blockerText}</span> : <span className="text-ink-secondary">{D.noBlocker}</span>}
                  {c.blockerReason ? (
                    <span className="text-xs text-ink-secondary">
                      {c.blockerReason.label} · {enumLabel("blockerCategory", c.blockerReason.category)}
                    </span>
                  ) : null}
                </span>
                <span className="col-span-2 md:col-span-1">
                  {c.newDueDate ? (
                    <DateStamp date={c.newDueDate} kind="business" className="text-ink" />
                  ) : (
                    <span className="text-ink-secondary">{D.noBlocker}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}
