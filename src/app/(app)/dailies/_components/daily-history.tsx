"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"

import { CopyWhatsAppButton } from "@/components/dailies/copy-whatsapp-button"
import { DailyDetail } from "@/components/dailies/daily-detail"
import { DateStamp } from "@/components/ui/date-stamp"
import { StatusPill } from "@/components/ui/status-pill"
import { formatDate } from "@/lib/dates"
import { labels, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"
import type { DailyDetail as Detail } from "@/server/queries/dailies"

const H = labels.dailies.history

/**
 * Histórico compacto: uma linha por daily (data, presentes, bloqueios,
 * revisados, criados, primeira linha do resumo). Expandir mostra o detalhe na
 * própria página; cada daily tem o seu "Copiar para WhatsApp".
 */
export function DailyHistory({ dailies }: { dailies: Detail[] }) {
  const [open, setOpen] = React.useState<Set<string>>(new Set())

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <ol aria-label={H.tableLabel} className="rounded-lg border border-line bg-surface">
      {dailies.map((daily) => {
        const expanded = open.has(daily.id)
        const blockers = daily.present.filter((p) => p.blocker).length
        const summary = daily.summary?.split("\n")[0]
        const panelId = `daily-${daily.id}`
        return (
          <li key={daily.id} className="border-b border-line last:border-b-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-label={`${expanded ? H.collapse : H.expand}: ${formatDate(daily.date, "business")}`}
                onClick={() => toggle(daily.id)}
                className="-ml-1 inline-flex size-6 items-center justify-center rounded-sm text-ink-secondary hover:bg-surface-sunken"
              >
                <ChevronRightIcon className={cn("size-4 transition-transform", expanded && "rotate-90")} />
              </button>
              <Link href={`/dailies/${daily.id}`} className="text-ink hover:underline">
                <DateStamp date={daily.date} kind="business" className="text-sm" />
              </Link>
              <span className="font-mono text-xs text-ink-secondary">
                {daily.present.length} {H.present}
              </span>
              {blockers ? <StatusPill severity="overdue" label={plural(H.blockers, blockers)} /> : null}
              <span className="text-xs text-ink-secondary">{plural(H.reviewed, daily.reviewed.length)}</span>
              <span className="text-xs text-ink-secondary">{plural(H.created, daily.created.length)}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary max-md:basis-full" title={summary}>
                {summary}
              </span>
              <CopyWhatsAppButton daily={daily.whatsapp} variant="ghost" />
            </div>
            {expanded ? (
              <div id={panelId} className="border-t border-line bg-canvas px-4 py-4 md:pl-10">
                <DailyDetail daily={daily} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
