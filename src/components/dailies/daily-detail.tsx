import * as React from "react"
import Link from "next/link"

import { DateStamp } from "@/components/ui/date-stamp"
import { Section } from "@/components/ui/section"
import { StatusPill } from "@/components/ui/status-pill"
import { enumLabel, fill, labels } from "@/lib/labels"
import type { Severity } from "@/lib/severity"
import type { DailyDetail as Detail } from "@/server/queries/dailies"

const D = labels.dailies.detail

const OUTCOME_SEVERITY: Record<Detail["reviewed"][number]["outcome"], Severity> = {
  DONE: "calm",
  PARTIAL: "attention",
  NOT_DONE: "overdue",
}

/** Conteúdo de uma daily registrada: revisões, combinados criados, notas e ausências. */
export function DailyDetail({ daily }: { daily: Detail }) {
  const notes = daily.present.filter((p) => p.note || p.blocker)
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={D.reviewed} count={daily.reviewed.length} headingLevel={3}>
        {daily.reviewed.length === 0 ? (
          <p className="text-sm text-ink-secondary">{D.none}</p>
        ) : (
          <ul className="flex flex-col">
            {daily.reviewed.map((r) => (
              <li key={r.id} className="flex flex-col gap-0.5 border-b border-line py-2 last:border-b-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <StatusPill severity={OUTCOME_SEVERITY[r.outcome]} label={enumLabel("checkinOutcome", r.outcome)} />
                  <span className="font-medium text-ink">{r.name}</span>
                  <Link href={`/agreements/${r.agreementId}`} className="min-w-0 text-ink hover:underline">
                    {r.title}
                  </Link>
                </span>
                {r.blockerText ? (
                  <span className="text-xs text-ink-secondary">
                    {r.blockerText}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </span>
                ) : null}
                {r.newDueDate ? (
                  <span className="text-xs text-ink-secondary">
                    {D.newDue} <DateStamp date={r.newDueDate} kind="business" />
                  </span>
                ) : null}
                {r.replacement ? (
                  <span className="text-xs text-ink-secondary">
                    {D.replacedBy} <Link href={`/agreements/${r.replacement.id}`} className="text-accent hover:underline">
                      {r.replacement.title}
                    </Link>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={D.created} count={daily.created.length} headingLevel={3}>
        {daily.created.length === 0 ? (
          <p className="text-sm text-ink-secondary">{D.none}</p>
        ) : (
          <ul className="flex flex-col">
            {daily.created.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 border-b border-line py-2 text-sm last:border-b-0">
                <span className="font-medium text-ink">{c.name}</span>
                <Link href={`/agreements/${c.id}`} className="min-w-0 text-ink hover:underline">
                  {c.title}
                </Link>
                <DateStamp date={c.dueDate} kind="business" className="text-ink-secondary" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={D.notes} count={notes.length} headingLevel={3}>
        {notes.length === 0 ? (
          <p className="text-sm text-ink-secondary">{D.none}</p>
        ) : (
          <ul className="flex flex-col">
            {notes.map((p) => (
              <li key={p.memberId} className="flex flex-col gap-0.5 border-b border-line py-2 last:border-b-0">
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  {p.name}
                  {p.blocker ? <StatusPill severity="overdue" label={labels.dailies.participants.blocker} /> : null}
                </span>
                <span className="text-sm whitespace-pre-line text-ink-secondary">{p.blocker ?? p.note}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="flex flex-col gap-6">
        {daily.absent.length ? (
          <Section title={D.absent} count={daily.absent.length} headingLevel={3}>
            <p className="text-sm text-ink-secondary">{daily.absent.map((a) => a.name).join(", ")}</p>
          </Section>
        ) : null}
        {daily.summary ? (
          <Section title={D.summary} headingLevel={3}>
            <p className="text-sm whitespace-pre-line text-ink">{daily.summary}</p>
          </Section>
        ) : null}
        {daily.decisions ? (
          <Section title={D.decisions} headingLevel={3}>
            <p className="text-sm whitespace-pre-line text-ink">{daily.decisions}</p>
          </Section>
        ) : null}
        <p className="text-xs text-ink-secondary">{fill(D.author, { name: daily.author })}</p>
      </div>
    </div>
  )
}
