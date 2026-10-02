"use client"

import * as React from "react"
import { LockIcon, UsersIcon } from "lucide-react"

import { DateStamp } from "@/components/ui/date-stamp"
import { MetaLabel } from "@/components/ui/meta-label"
import { StatusPill } from "@/components/ui/status-pill"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDateLong, formatDayMonth } from "@/lib/dates"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import type { LinkedAgreement, TimelineItem } from "@/server/queries/timeline"

import { TimelineEntry } from "./timeline-rail"

const T = labels.timeline

const NOTE_COLOR = {
  calm: "text-calm",
  attention: "text-attention",
  overdue: "text-overdue",
  neutral: "text-ink-secondary",
} as const

/** Resumo em até 3 linhas, com expansão inline só quando o texto passa disso. */
function Summary({ text }: { text: string }) {
  const ref = React.useRef<HTMLParagraphElement>(null)
  const [overflows, setOverflows] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (el && !expanded) setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [text, expanded])

  return (
    <div className="mt-0.5">
      <p ref={ref} className={cn("text-sm whitespace-pre-line text-ink-secondary", !expanded && "line-clamp-3")}>
        {text}
      </p>
      {overflows ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-accent hover:underline"
        >
          {expanded ? T.collapse : T.expand}
        </button>
      ) : null}
    </div>
  )
}

function AgreementLine({ agreement, withTitle }: { agreement: LinkedAgreement; withTitle: boolean }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {withTitle ? <span className="min-w-0 truncate text-ink">{agreement.title}</span> : null}
      <StatusPill severity={agreement.pill.severity} strong={agreement.pill.strong} label={agreement.pill.label} />
      <span className="text-ink-secondary">
        {T.due} <DateStamp date={agreement.dueDate} kind="business" />
      </span>
      {agreement.reschedules > 0 ? (
        <span className="text-ink-secondary">{plural(labels.profile.agreements.rescheduled, agreement.reschedules)}</span>
      ) : null}
    </span>
  )
}

function Agreements({ link }: { link: NonNullable<TimelineItem["agreements"]> }) {
  if (link.kind === "self") {
    const [agreement] = link.items
    return agreement ? (
      <div className="mt-1.5">
        <AgreementLine agreement={agreement} withTitle={false} />
      </div>
    ) : null
  }
  return (
    <div className="mt-1.5 flex flex-col gap-1 border-l border-line pl-2">
      <MetaLabel>{plural(T.linkedAgreements, link.items.length)}</MetaLabel>
      {link.items.map((agreement) => (
        <AgreementLine key={agreement.id} agreement={agreement} withTitle />
      ))}
    </div>
  )
}

/**
 * Indicador de visibilidade. Para quem escreve, em 1:1, feedback e anotação,
 * é também a ação de alternar; nos demais tipos, explica por que é sempre
 * compartilhado. Não aparece para o VIEWER (ele só recebe compartilhados).
 */
function Visibility({
  item,
  onToggle,
  pending,
}: {
  item: TimelineItem
  onToggle?: (item: TimelineItem) => void
  pending: boolean
}) {
  const isPrivate = item.visibility === "PRIVATE"
  const Icon = isPrivate ? LockIcon : UsersIcon
  const text = isPrivate ? T.private : T.shared
  const base = "inline-flex items-center gap-1 rounded-xs text-2xs font-medium"
  const colors = isPrivate ? "text-ink" : "text-ink-secondary"

  if (!item.toggleable || !onToggle) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn(base, colors, "cursor-default")}>
            <Icon className="size-3" aria-hidden />
            {text}
          </span>
        </TooltipTrigger>
        <TooltipContent>{T.sharedByModel}</TooltipContent>
      </Tooltip>
    )
  }

  const action = isPrivate ? T.makeShared : T.makePrivate
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`${text}. ${action}`}
      title={action}
      onClick={() => onToggle(item)}
      className={cn(base, colors, "px-1 -mx-1 hover:bg-surface-sunken disabled:opacity-50")}
    >
      <Icon className="size-3" aria-hidden />
      {text}
      <span className="font-normal text-accent">· {action}</span>
    </button>
  )
}

function tagLabel(tag: string): string {
  return T.tags[tag] ?? tag
}

export function TimelineEvent({
  item,
  showVisibility,
  onToggleVisibility,
  pending = false,
}: {
  item: TimelineItem
  /** Falso para o VIEWER. */
  showVisibility: boolean
  /** Presente só para quem escreve. */
  onToggleVisibility?: (item: TimelineItem) => void
  pending?: boolean
}) {
  const typeLabel = enumLabel("timelineEventType", item.type)
  // Tag que só repete o tipo (ex.: "reconhecimento" num reconhecimento) não acrescenta nada.
  const tags = item.tags.map(tagLabel).filter((t) => t.toLowerCase() !== typeLabel.toLowerCase())
  const markerText =
    item.marker.strong && item.marker.severity === "attention" ? "text-attention-strong" : NOTE_COLOR[item.marker.severity]

  return (
    <TimelineEntry
      date={formatDayMonth(item.occurredAt)}
      dateTime={item.occurredAt.toISOString()}
      dateTitle={formatDateLong(item.occurredAt)}
      severity={item.marker.severity}
      strong={item.marker.strong}
      pending={item.marker.bleed}
    >
      <article aria-label={`${typeLabel}: ${item.title}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 leading-4">
          <MetaLabel className="text-ink">{typeLabel}</MetaLabel>
          {showVisibility ? <Visibility item={item} onToggle={onToggleVisibility} pending={pending} /> : null}
          {item.marker.note ? <span className={cn("text-2xs font-medium", markerText)}>{item.marker.note}</span> : null}
        </div>
        <p className="mt-1 text-sm font-medium text-ink">{item.title}</p>
        {item.summary ? <Summary text={item.summary} /> : null}
        {item.agreements ? <Agreements link={item.agreements} /> : null}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-secondary">
          {tags.map((tag) => (
            <span key={tag} className="rounded-xs bg-surface-sunken px-1 py-px font-mono">
              {tag}
            </span>
          ))}
          <span>{fill(T.by, { name: item.author })}</span>
        </p>
      </article>
    </TimelineEntry>
  )
}
