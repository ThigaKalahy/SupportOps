import type { Metadata } from "next"
import Link from "next/link"

import { DailyForm } from "@/components/dailies/daily-form"
import { DailyDatePicker } from "@/components/dailies/daily-date-picker"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { formatDate, formatTime, parseDisplayDate, todayBusinessDate } from "@/lib/dates"
import { fill, labels, plural } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { getDailyForm } from "@/server/queries/dailies"

const L = labels.dailies

export const metadata: Metadata = {
  title: `${L.new} · ${labels.app.name}`,
}

/**
 * Data da daily pela URL (`?date=DD-MM-AAAA`), para registrar uma daily que
 * ficou para trás. Inválida ou no futuro → hoje.
 */
function dailyDate(raw: string | string[] | undefined): Date {
  const today = todayBusinessDate()
  if (typeof raw !== "string") return today
  const parsed = parseDisplayDate(raw.replaceAll("-", "/"))
  return parsed && parsed <= today ? parsed : today
}

/** Registro de daily (hoje, ou uma data passada). Só para quem escreve. */
export default async function NewDailyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  if (!canWrite(user)) {
    return (
      <div className="rounded-lg border border-line bg-surface">
        <EmptyState title={L.new} direction={L.forbidden} />
      </div>
    )
  }
  const date = dailyDate((await searchParams).date)
  const form = await getDailyForm(user, date)
  if (!form) {
    return (
      <div className="rounded-lg border border-line bg-surface">
        <EmptyState title={L.new} direction={labels.pages.team.emptyDirection} />
      </div>
    )
  }
  const dateText = formatDate(form.date, "business")
  const retroactive = form.date < todayBusinessDate()
  const first = form.sameDay[0]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={fill(L.newTitle, { date: dateText })}
        subtitle={L.newSubtitle}
        actions={<DailyDatePicker value={dateText} retroactive={retroactive} />}
      />
      {first || retroactive ? (
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink">
          {first ? (
            <p role="status">
              {plural(L.sameDay.notice, form.sameDay.length, { date: dateText, time: formatTime(first.createdAt) })}{" "}
              <Link href={`/dailies/${first.id}`} className="font-medium text-accent hover:underline">
                {L.sameDay.open}
              </Link>
              <span className="text-ink-secondary"> · {L.sameDay.hint}</span>
            </p>
          ) : null}
          {retroactive ? <p className="text-ink-secondary">{fill(L.otherDate.retroactive, { date: dateText })}</p> : null}
        </div>
      ) : null}
      {/* key: trocar a data recomeça o formulário (e o rascunho, que é guardado por data). */}
      <DailyForm key={dateText} form={form} />
    </div>
  )
}
