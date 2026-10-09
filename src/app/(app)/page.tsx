import type { Metadata } from "next"
import Link from "next/link"

import { AlertList } from "@/components/today/alert-list"
import { TodayActions } from "@/components/today/today-actions"
import { DateStamp } from "@/components/ui/date-stamp"
import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { SegmentedBar } from "@/components/ui/segmented-bar"
import { StatStrip } from "@/components/ui/stat-strip"
import { percent } from "@/lib/adherence"
import { businessDaysBetween, formatDate, formatWeekday, todayBusinessDate } from "@/lib/dates"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { MODULES } from "@/lib/modules"
import { canWrite, hasModule, requireTeamContext } from "@/server/scope"
import { listAgreementMembers } from "@/server/queries/agreements"
import { getTodayPanel } from "@/server/queries/today"

import { loadAlerts } from "./alerts-data"

const T = labels.today
/** Próximos acompanhamentos visíveis; o resto vira uma linha de contagem (a coluna lateral não pode empurrar o resto). */
const UPCOMING_SHOWN = 8

export const metadata: Metadata = {
  title: `${labels.nav.today} · ${labels.app.name}`,
}

/**
 * Hoje: responde UMA pergunta — "quem precisa da minha atenção hoje?".
 * Composição editorial em duas colunas assimétricas: a lista única "Precisa de
 * você" (a única superfície delimitada) e, ao lado, composição do time, ritmo
 * de gestão, próximos acompanhamentos e últimas movimentações, sem card.
 */
export default async function TodayPage() {
  const ctx = await requireTeamContext()
  const today = todayBusinessDate()
  const writer = canWrite(ctx)
  const [{ alerts, watch }, panel, members] = await Promise.all([
    loadAlerts(),
    getTodayPanel(ctx, today),
    writer ? listAgreementMembers(ctx) : Promise.resolve([]),
  ])
  const rate = panel.rhythm.adherence
  const sinceDaily = panel.rhythm.lastDaily ? businessDaysBetween(panel.rhythm.lastDaily, today) : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageHeader title={T.title} subtitle={fill(T.date, { weekday: formatWeekday(today, "business"), date: formatDate(today, "business") })} />
        {writer ? <TodayActions
            members={members.map((m) => ({ id: m.id, preferredName: m.preferredName }))}
            validation={hasModule(ctx, MODULES.PRIORITY_VALIDATION)}
          /> : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:grid-cols-[minmax(0,1fr)_400px]">
        <Section title={T.needsYou} count={alerts.filter((a) => !a.informative).length}>
          <p className="-mt-2 text-xs text-ink-secondary">{T.needsYouDirection}</p>
          <AlertList alerts={alerts} canWrite={writer} hasTeam={panel.total > 0} />
        </Section>

        <div className="flex min-w-0 flex-col gap-8">
          <Section title={T.composition} count={panel.total}>
            <SegmentedBar
              label={fill(T.compositionLabel, {
                count: panel.total,
                parts: panel.composition.map((c) => fill(T.compositionPart, { count: c.count, label: c.label })).join(", "),
              })}
              segments={panel.composition.map((c) => ({ id: c.seniorityKey, label: c.label, value: c.count }))}
            />
            {panel.onLeave > 0 ? <p className="text-xs text-ink-secondary">{plural(T.onLeave, panel.onLeave)}</p> : null}
          </Section>

          <Section title={T.rhythm}>
            <StatStrip
              aria-label={T.rhythm}
              className="grid grid-cols-2 gap-x-0 [&>div:nth-child(3)]:border-l-0 [&>div:nth-child(3)]:pl-0 [&>div:nth-child(5)]:border-l-0 [&>div:nth-child(5)]:pl-0"
              items={[
                {
                  id: "daily",
                  label: T.rhythmItems.lastDaily,
                  value: sinceDaily === null ? T.rhythmNoDaily : sinceDaily === 0 ? T.rhythmDailyToday : plural(T.rhythmDays, sinceDaily),
                },
                { id: "oneOnOnes", label: T.rhythmItems.oneOnOnes, value: panel.rhythm.oneOnOnes },
                { id: "feedbacks", label: T.rhythmItems.feedbacks, value: panel.rhythm.feedbacks },
                {
                  id: "adherence",
                  label: T.rhythmItems.adherence,
                  value: rate.denominator === 0 ? null : `${percent(rate)}%`,
                  coverage:
                    rate.denominator === 0
                      ? T.rhythmAdherenceNone
                      : fill(T.rhythmAdherenceDetail, { onTime: rate.numerator, total: rate.denominator }) +
                        (rate.lowConfidence ? ` · ${T.rhythmAdherenceSmall}` : ""),
                },
                // P21: observações ativas, com o fogo alto ao lado.
                {
                  id: "watch",
                  label: T.rhythmItems.watch,
                  value: watch?.active ?? 0,
                  coverage: plural(T.rhythmWatchDetail, watch?.high ?? 0),
                },
              ]}
            />
          </Section>

          <Section title={T.upcoming} count={panel.upcoming.length}>
            {panel.upcoming.length === 0 ? (
              <p className="text-sm text-ink-secondary">{T.upcomingEmpty}</p>
            ) : (
              <ul className="flex flex-col">
                {panel.upcoming.slice(0, UPCOMING_SHOWN).map((u) => (
                  <li key={u.id} className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 border-b border-line py-1.5 last:border-b-0">
                    <DateStamp date={u.date} kind="business" display="short" className="text-ink-secondary" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xs text-ink-secondary">
                        {T.upcomingKinds[u.kind]} · {u.member.preferredName}
                      </span>
                      <Link href={u.href} className="truncate text-sm text-ink hover:underline" title={u.title}>
                        {u.title}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {panel.upcoming.length > UPCOMING_SHOWN ? (
              <p className="text-xs text-ink-secondary">{plural(T.upcomingMore, panel.upcoming.length - UPCOMING_SHOWN)}</p>
            ) : null}
          </Section>

          <Section title={T.recent}>
            {panel.recent.length === 0 ? (
              <p className="text-sm text-ink-secondary">{T.recentEmpty}</p>
            ) : (
              <ul className="flex flex-col">
                {panel.recent.map((e) => (
                  <li key={e.id} className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 border-b border-line py-1.5 last:border-b-0">
                    <DateStamp date={e.occurredAt} display="short" className="text-ink-secondary" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xs text-ink-secondary">
                        {enumLabel("timelineEventType", e.type)} · {e.member.preferredName}
                      </span>
                      <Link href={`/team/${e.member.id}/timeline`} className="truncate text-sm text-ink hover:underline" title={e.title}>
                        {e.title}
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
