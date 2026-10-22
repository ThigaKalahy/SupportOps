import type { Metadata } from "next"
import Link from "next/link"

import { DailyForm } from "@/components/dailies/daily-form"
import { DailyDatePicker } from "@/components/dailies/daily-date-picker"
import { OpenDailyButton, TakeOverDailyButton } from "@/components/dailies/daily-opening"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { formatDate, formatTime, parseDisplayDate, todayBusinessDate } from "@/lib/dates"
import { fill, labels, plural } from "@/lib/labels"
import { canWrite, requireTeamContext } from "@/server/scope"
import { getDailyForm, getDailyOpening, getScrumMasterToday } from "@/server/queries/dailies"

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
  const ctx = await requireTeamContext()
  if (!canWrite(ctx)) {
    return (
      <div className="rounded-lg border border-line bg-surface">
        <EmptyState title={L.new} direction={L.forbidden} />
      </div>
    )
  }
  const requested = dailyDate((await searchParams).date)
  const opening = await getDailyOpening(ctx, requested)

  // P26: há daily ABERTA no time — de outra pessoa: avisa e deixa assumir; minha: o formulário.
  if (opening.draft && !opening.draft.mine) {
    const date = formatDate(opening.draft.date, "business")
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={fill(L.newTitle, { date })} subtitle={L.newSubtitle} />
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-4">
          <p role="status" className="text-sm text-ink">
            {fill(L.opening.byOther, { date, name: opening.draft.openedBy ?? "", time: formatTime(opening.draft.openedAt!) })}
          </p>
          {opening.draft.locking ? null : <p className="text-sm text-attention">{L.opening.expired}</p>}
          <TakeOverDailyButton id={opening.draft.id} />
        </div>
      </div>
    )
  }

  const form = opening.draft ? await getDailyForm(ctx, undefined, undefined, opening.draft.id) : null
  if (opening.draft && !form) {
    return (
      <div className="rounded-lg border border-line bg-surface">
        <EmptyState title={L.new} direction={labels.pages.team.emptyDirection} />
      </div>
    )
  }

  if (form) {
    const dateText = formatDate(form.date, "business")
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={fill(L.newTitle, { date: dateText })} subtitle={L.newSubtitle} />
        {form.date < todayBusinessDate() ? (
          <div className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-secondary">
            {fill(L.otherDate.retroactive, { date: dateText })}
          </div>
        ) : null}
        {/* key: outra daily recomeça o formulário (e o rascunho, que é guardado por data). */}
        <DailyForm key={form.draft?.id ?? dateText} form={form} />
      </div>
    )
  }

  // Passo zero: nenhuma daily aberta. A data (editável), quem já relatou e as propostas.
  const dateText = formatDate(requested, "business")
  const retroactive = requested < todayBusinessDate()
  // C19: quem conduz hoje (o scrum master registra pelo portal; o gestor pode registrar a qualquer hora).
  const scrumMaster = retroactive ? null : (await getScrumMasterToday(ctx)).current
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={fill(L.newTitle, { date: dateText })}
        subtitle={L.newSubtitle}
        actions={<DailyDatePicker value={dateText} retroactive={retroactive} />}
      />
      {opening.closedOnDate ? (
        // C10: uma daily por data — a registrada se edita; não há segunda.
        <div className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink">
          <p role="status">
            {fill(L.sameDay.blocked, { date: dateText })}{" "}
            <Link href={`/dailies/${opening.closedOnDate}`} className="font-medium text-accent hover:underline">
              {L.sameDay.open}
            </Link>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface px-4 py-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-ink">{L.opening.title}</h2>
            <p className="text-sm text-ink-secondary">{L.opening.direction}</p>
          </div>
          <p className="font-mono text-xs text-ink-secondary">
            {fill(L.opening.reported, { reported: opening.reported, people: opening.people })} ·{" "}
            {opening.proposals ? plural(L.opening.proposals, opening.proposals) : L.opening.noProposals}
          </p>
          {scrumMaster ? <p className="text-sm text-ink">{fill(labels.scrumMaster.result, { name: scrumMaster.name })}</p> : null}
          {retroactive ? <p className="text-sm text-ink-secondary">{fill(L.otherDate.retroactive, { date: dateText })}</p> : null}
          <OpenDailyButton date={dateText} />
        </div>
      )}
    </div>
  )
}
