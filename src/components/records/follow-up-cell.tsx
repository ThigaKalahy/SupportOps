import { DateStamp } from "@/components/ui/date-stamp"
import { StatusPill } from "@/components/ui/status-pill"
import { formatDate } from "@/lib/dates"
import type { FollowUpState } from "@/lib/follow-up"
import { fill, labels } from "@/lib/labels"

/** Data de follow-up com a severidade quando pendente (vencida em vermelho/laranja). */
export function FollowUpCell({ state }: { state: FollowUpState }) {
  if (state.status === "none") return <span className="text-ink-tertiary">{labels.records.followUp.none}</span>
  if (state.status === "done") {
    return (
      <span className="text-xs text-ink-secondary" title={fill(labels.records.followUp.doneTitle, { date: formatDate(state.resolvedAt, "business") })}>
        {fill(labels.records.followUp.done, { date: formatDate(state.resolvedAt, "business") })}
      </span>
    )
  }
  const show = state.deadline.stage !== "on-track"
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <DateStamp date={state.date} kind="business" className="text-ink" />
      {show ? <StatusPill severity={state.deadline.severity} strong={state.deadline.strong} label={state.deadline.label} /> : null}
    </span>
  )
}
