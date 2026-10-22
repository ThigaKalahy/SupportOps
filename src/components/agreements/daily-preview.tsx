"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RefreshCwIcon } from "lucide-react"

import { DueCell } from "@/components/agreements/agreements-table"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Section } from "@/components/ui/section"
import { StatStrip } from "@/components/ui/stat-strip"
import { StatusPill } from "@/components/ui/status-pill"
import { formatDate, formatDayMonth, formatTime, todayBusinessDate } from "@/lib/dates"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import type { Severity } from "@/lib/severity"
import type { DailyPreview } from "@/server/queries/dailies"

const L = labels.dailyPreview

const OUTCOME_SEVERITY: Record<DailyPreview["people"][number]["reports"][number]["outcome"], Severity> = {
  DONE: "calm",
  PARTIAL: "attention",
  NOT_DONE: "overdue",
}

const listClass = "flex flex-col divide-y divide-line rounded-lg border border-line bg-surface"
const itemClass = "flex min-h-11 flex-col justify-center gap-1 px-4 py-2.5"

/** Recarrega a prévia a cada minuto com a aba visível, e no botão. Nunca grava nada. */
export function PreviewRefresh({ at }: { at: string }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh())
    }, 60_000)
    return () => window.clearInterval(id)
  }, [router])
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-ink-secondary sm:inline">{fill(L.updatedAt, { time: at })}</span>
      <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => startTransition(() => router.refresh())}>
        <RefreshCwIcon />
        {L.refresh}
      </Button>
    </div>
  )
}

/** Uma seção por pessoa com movimento: relatos, combinados novos e o que ainda não tem relato. */
export function DailyPreviewView({ preview }: { preview: DailyPreview }) {
  const t = preview.totals
  const today = formatDate(todayBusinessDate(), "business")
  return (
    <div className="flex flex-col gap-6">
      <StatStrip
        items={[
          { id: "reported", label: L.stats.reported, value: t.reported, coverage: fill(L.stats.reportedOf, { count: t.people }) },
          { id: "done", label: L.stats.done, value: t.done },
          { id: "partial", label: L.stats.partial, value: t.partial, severity: t.partial > 0 ? "attention" : undefined },
          { id: "notDone", label: L.stats.notDone, value: t.notDone, severity: t.notDone > 0 ? "overdue" : undefined },
          { id: "created", label: L.stats.created, value: t.created },
          { id: "unreported", label: L.stats.unreported, value: t.unreported },
        ]}
      />
      {preview.people.length === 0 ? (
        <EmptyState title={L.empty} direction={L.emptyDirection} />
      ) : (
        <div className="grid gap-x-8 gap-y-6 xl:grid-cols-2">
          {preview.people.map((p) => (
            <Section
              key={p.id}
              title={p.name}
              action={
                <span className="text-xs text-ink-secondary">
                  {[
                    p.reports.length ? plural(L.reports, p.reports.length) : null,
                    p.created.length ? plural(L.createdCount, p.created.length) : null,
                    p.unreported.length ? plural(L.unreportedCount, p.unreported.length) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              }
            >
              <ul className={listClass}>
                {p.reports.map((r) => (
                  <li key={r.id} className={itemClass}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <StatusPill severity={OUTCOME_SEVERITY[r.outcome]} label={enumLabel("checkinOutcome", r.outcome)} />
                      <Link href={`/agreements/${r.agreement.id}`} className="min-w-0 truncate text-sm text-ink hover:underline">
                        {r.agreement.title}
                      </Link>
                    </div>
                    {r.blockerText ? <p className="text-sm text-ink-secondary">{r.blockerText}</p> : null}
                    <p className="flex flex-wrap gap-x-2 text-xs text-ink-secondary">
                      {r.agreement.central ? <span>{r.agreement.central}</span> : null}
                      {r.reason ? <span>{fill(L.reason, { reason: r.reason })}</span> : null}
                      {r.suggestedDueDate ? <span>{fill(L.suggested, { date: formatDayMonth(r.suggestedDueDate, "business") })}</span> : null}
                      <span>{fill(L.reportedAt, { time: formatTime(r.at) })}</span>
                    </p>
                  </li>
                ))}
                {p.created.map((a) => (
                  <li key={a.id} className={itemClass}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <StatusPill severity="neutral" label={L.createdTag} />
                      <Link href={`/agreements/${a.id}`} className="min-w-0 truncate text-sm text-ink hover:underline">
                        {a.title}
                      </Link>
                    </div>
                    <p className="flex flex-wrap gap-x-2 text-xs text-ink-secondary">
                      {a.central ? <span>{a.central}</span> : null}
                      <span>{fill(L.dueOn, { date: formatDayMonth(a.dueDate, "business") })}</span>
                      <span>{enumLabel("agreementOrigin", a.origin)}</span>
                      <span>
                        {formatDate(a.at) === today
                          ? fill(L.createdBy, { author: a.author, time: formatTime(a.at) })
                          : fill(L.createdOn, { author: a.author, date: formatDayMonth(a.at) })}
                      </span>
                      {a.status !== "OPEN" && a.status !== "IN_PROGRESS" ? <span>{enumLabel("agreementStatus", a.status)}</span> : null}
                    </p>
                  </li>
                ))}
                {p.unreported.map((a) => (
                  <li key={a.id} className={itemClass}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-secondary">{L.unreportedTag}</span>
                      <Link href={`/agreements/${a.id}`} className="min-w-0 truncate text-sm text-ink hover:underline">
                        {a.title}
                      </Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-secondary">
                      {a.central ? <span>{a.central}</span> : null}
                      <DueCell row={{ dueDate: a.dueDate, open: true, deadline: a.deadline }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
      {preview.quiet.length > 0 ? (
        <p className="border-t border-line pt-3 text-sm text-ink-secondary">{fill(L.quiet, { names: preview.quiet.join(", ") })}</p>
      ) : null}
    </div>
  )
}
