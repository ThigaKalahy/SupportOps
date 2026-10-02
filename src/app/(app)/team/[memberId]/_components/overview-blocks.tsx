import * as React from "react"
import Link from "next/link"
import { LockIcon } from "lucide-react"

import { DateStamp } from "@/components/ui/date-stamp"
import { EmptyState } from "@/components/ui/empty-state"
import { MetaLabel } from "@/components/ui/meta-label"
import { Section } from "@/components/ui/section"
import { SeverityDot } from "@/components/ui/severity-dot"
import { StatusPill } from "@/components/ui/status-pill"
import { businessDaysBetween, daysSince, todayBusinessDate } from "@/lib/dates"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { deadlineSeverity } from "@/lib/severity"
import { ATTENTION_THRESHOLDS, oneOnOneCadence } from "@/server/alerts"
import type { MemberOverview } from "@/server/queries/profile"

const P = labels.profile

/** Link discreto de ação de bloco ("ver todos"). */
function BlockLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-xs font-medium text-accent hover:underline">
      {children}
    </Link>
  )
}

function Empty({ title, direction }: { title: string; direction: string }) {
  return <EmptyState size="compact" className="items-start px-0 py-2 text-left" title={title} direction={direction} />
}

/* ───────────────────────────── Coluna larga ───────────────────────────── */

export function RecentEvents({
  events,
  timelineHref,
}: {
  events: MemberOverview["recentEvents"]
  timelineHref: string
}) {
  return (
    <Section title={P.recent.title} action={events.length ? <BlockLink href={timelineHref}>{P.recent.all}</BlockLink> : null}>
      {events.length === 0 ? (
        <Empty title={P.recent.emptyTitle} direction={P.recent.emptyDirection} />
      ) : (
        <ol className="flex flex-col">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line py-2 last:border-b-0 xl:flex-nowrap"
            >
              <DateStamp date={event.occurredAt} className="w-[88px] shrink-0 text-ink-secondary" />
              <MetaLabel className="shrink-0 truncate xl:w-[104px]">{enumLabel("timelineEventType", event.type)}</MetaLabel>
              <span
                className="order-last line-clamp-2 min-w-0 basis-full text-sm text-ink xl:order-none xl:line-clamp-1 xl:flex-1 xl:basis-auto"
                title={event.title}
              >
                {event.title}
              </span>
              {event.visibility === "PRIVATE" ? (
                <LockIcon
                  className="ml-auto size-3.5 shrink-0 self-center text-ink-secondary"
                  aria-label={P.recent.private}
                  role="img"
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}

function TraitList({
  title,
  traits,
  emptyTitle,
}: {
  title: string
  traits: MemberOverview["strengths"]
  emptyTitle: string
}) {
  return (
    <Section title={title} count={traits.length || undefined} headingLevel={3}>
      {traits.length === 0 ? (
        <Empty title={emptyTitle} direction={P.traits.emptyDirection} />
      ) : (
        <ul className="flex flex-col">
          {traits.map((trait) => (
            <li key={trait.id} className="flex flex-col gap-0.5 border-b border-line py-2 last:border-b-0">
              <span className="text-sm text-ink">{trait.text}</span>
              <DateStamp date={trait.observedAt} kind="business" className="text-2xs text-ink-secondary" />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function Traits({ overview }: { overview: MemberOverview }) {
  return (
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      <TraitList title={P.traits.strengths} traits={overview.strengths} emptyTitle={P.traits.emptyStrengths} />
      <TraitList title={P.traits.development} traits={overview.developmentPoints} emptyTitle={P.traits.emptyDevelopment} />
    </div>
  )
}

/* ──────────────────────────── Coluna estreita ─────────────────────────── */

export function OpenAgreements({ agreements, href }: { agreements: MemberOverview["agreements"]; href: string }) {
  const today = todayBusinessDate()
  return (
    <Section
      title={P.agreements.title}
      count={agreements.length}
      action={agreements.length ? <BlockLink href={href}>{P.agreements.all}</BlockLink> : null}
    >
      {agreements.length === 0 ? (
        <Empty title={P.agreements.emptyTitle} direction={P.agreements.emptyDirection} />
      ) : (
        <ul className="flex flex-col">
          {agreements.map((a) => {
            const deadline = deadlineSeverity(a.dueDate, { today })
            const chronic = a.reschedules >= ATTENTION_THRESHOLDS.chronicReschedules
            return (
              <li key={a.id} className="flex flex-col gap-1 border-b border-line py-2 last:border-b-0">
                <Link href={`/agreements/${a.id}`} className="line-clamp-2 text-sm text-ink hover:underline">
                  {a.title}
                </Link>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <DateStamp date={a.dueDate} kind="business" className="text-ink-secondary" />
                  <StatusPill severity={deadline.severity} strong={deadline.strong} label={deadline.label} />
                  {a.reschedules > 0 ? (
                    <span className={chronic ? "text-xs text-attention-strong" : "text-xs text-ink-secondary"}>
                      {plural(P.agreements.rescheduled, a.reschedules)}
                    </span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

export function ActivePlans({ plans, href }: { plans: MemberOverview["plans"]; href: string }) {
  const today = todayBusinessDate()
  return (
    <Section
      title={P.plans.title}
      count={plans.length}
      action={plans.length ? <BlockLink href={href}>{P.agreements.all}</BlockLink> : null}
    >
      {plans.length === 0 ? (
        <Empty title={P.plans.emptyTitle} direction={P.plans.emptyDirection} />
      ) : (
        <ul className="flex flex-col">
          {plans.map((plan) => {
            const reviewDays = plan.lastReviewedAt
              ? daysSince(plan.lastReviewedAt)
              : businessDaysBetween(plan.startedAt, today)
            const stale = reviewDays > ATTENTION_THRESHOLDS.stalePlanDays
            const reviewText = plan.lastReviewedAt
              ? reviewDays === 0
                ? P.plans.reviewedToday
                : plural(P.plans.lastReview, reviewDays)
              : fill(P.plans.neverReviewed, { days: reviewDays })
            return (
              <li key={plan.id} className="flex flex-col gap-1 border-b border-line py-2 last:border-b-0">
                {plan.competency ? <MetaLabel>{plan.competency}</MetaLabel> : null}
                <span className="line-clamp-2 text-sm text-ink">{plan.objective}</span>
                <span className="font-mono text-xs text-ink-secondary">
                  {plan.actionsTotal
                    ? fill(P.plans.progress, { done: plan.actionsDone, total: plan.actionsTotal })
                    : P.plans.noActions}
                </span>
                {stale ? (
                  <StatusPill severity="attention" strong label={reviewText} />
                ) : (
                  <span className="text-xs text-ink-secondary">{reviewText}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

function MentorshipGroup({
  title,
  links,
}: {
  title: string
  links: MemberOverview["mentors"]
}) {
  if (links.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <MetaLabel>{title}</MetaLabel>
      <ul className="flex flex-col">
        {links.map((link) => (
          <li key={link.id} className="flex flex-wrap items-baseline gap-x-2 py-1 text-sm">
            <Link href={`/team/${link.person.id}`} className="font-medium text-ink hover:underline">
              {link.person.preferredName}
            </Link>
            <span className="text-ink-secondary">{link.competency ?? P.mentorship.general}</span>
            <span className="text-xs text-ink-secondary">
              {P.mentorship.since} <DateStamp date={link.startedAt} kind="business" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Mentorships({ overview }: { overview: MemberOverview }) {
  const total = overview.mentors.length + overview.mentees.length
  return (
    <Section title={P.mentorship.title} count={total || undefined}>
      {total === 0 ? (
        <Empty title={P.mentorship.emptyTitle} direction={P.mentorship.emptyDirection} />
      ) : (
        <div className="flex flex-col gap-3">
          <MentorshipGroup title={P.mentorship.mentors} links={overview.mentees} />
          <MentorshipGroup title={P.mentorship.mentoredBy} links={overview.mentors} />
        </div>
      )}
    </Section>
  )
}

function RhythmRow({
  label,
  days,
  reference,
}: {
  label: string
  days: number | null
  /** Referência de cadência com severidade (só 1:1). */
  reference?: { limit: number; severity: "neutral" | "attention" | "overdue" | "calm"; strong: boolean }
}) {
  const late = reference && reference.severity !== "neutral"
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <dt className="text-sm text-ink-secondary">{label}</dt>
      <dd className="flex items-center gap-2 text-right">
        {late ? (
          <SeverityDot severity={reference.severity} strong={reference.strong} label={enumLabel("severity", reference.severity)} />
        ) : null}
        <span className={days === null ? "text-sm text-ink-tertiary" : "font-mono text-sm text-ink"}>
          {days === null ? P.rhythm.never : days === 0 ? P.rhythm.today : plural(P.rhythm.daysAgo, days)}
        </span>
        {reference ? (
          <span className="text-xs text-ink-secondary">{fill(P.rhythm.reference, { limit: reference.limit })}</span>
        ) : null}
      </dd>
    </div>
  )
}

export function Rhythm({
  overview,
  lastOneOnOne,
  seniorityKey,
}: {
  overview: MemberOverview
  lastOneOnOne: Date | null
  seniorityKey: string
}) {
  const today = todayBusinessDate()
  const oneOnOneDays = lastOneOnOne ? businessDaysBetween(lastOneOnOne, today) : null
  const cadence = oneOnOneCadence(seniorityKey, oneOnOneDays ?? 0)
  return (
    <Section title={P.rhythm.title}>
      <dl className="flex flex-col">
        <RhythmRow label={P.rhythm.oneOnOne} days={oneOnOneDays} reference={cadence} />
        <RhythmRow
          label={P.rhythm.feedback}
          days={overview.lastFeedback ? businessDaysBetween(overview.lastFeedback, today) : null}
        />
        <RhythmRow label={P.rhythm.anyRecord} days={overview.lastRecord ? daysSince(overview.lastRecord) : null} />
      </dl>
    </Section>
  )
}
