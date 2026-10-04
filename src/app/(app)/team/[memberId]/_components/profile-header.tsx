import * as React from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { DateStamp } from "@/components/ui/date-stamp"
import { MetaLabel } from "@/components/ui/meta-label"
import { SeverityDot } from "@/components/ui/severity-dot"
import { StatusPill } from "@/components/ui/status-pill"
import { formatDate, formatTenure, todayBusinessDate } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import { avatarColors, initials } from "@/lib/people"
import { deadlineSeverity } from "@/lib/severity"
import type { MemberProfile } from "@/server/queries/profile"

const P = labels.profile

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <MetaLabel asChild>
        <dt>{label}</dt>
      </MetaLabel>
      <dd className="min-w-0 text-sm text-ink">{children}</dd>
    </div>
  )
}

/**
 * Rótulo do prazo do acompanhamento. "Provavelmente esquecido" é vocabulário
 * de combinado; aqui o atraso é dito em dias.
 */
function followUpLabel(deadline: ReturnType<typeof deadlineSeverity>): string {
  const days = deadline.daysUntilDue ?? 0
  if (days >= 0) return deadline.label
  return days === -1 ? labels.deadline.overdueOneDay : fill(labels.deadline.overdueDays, { days: -days })
}

function Absent({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-secondary">{children}</span>
}

/**
 * Cabeçalho do perfil, presente em todas as abas. Altura contida: identidade,
 * fatos de cadastro em uma faixa, responsabilidades e — só quando existe — a
 * linha de atenção com cada motivo em frase. Ações à direita.
 */
export function ProfileHeader({ profile, actions }: { profile: MemberProfile; actions?: React.ReactNode }) {
  const today = todayBusinessDate()
  const next = profile.nextFollowUp
  const nextSeverity = next ? deadlineSeverity(next.date, { today }) : null
  const inactive = profile.status === "INACTIVE"

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="lg">
            <AvatarFallback style={avatarColors(profile.id)}>{initials(profile.fullName)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <h1 className="truncate text-xl font-semibold text-ink">{profile.preferredName}</h1>
              {profile.fullName !== profile.preferredName ? (
                <span className="truncate text-sm text-ink-secondary">{profile.fullName}</span>
              ) : null}
            </div>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-secondary">
              <span>{profile.position}</span>
              <span aria-hidden>·</span>
              <span>{profile.seniorityLabel}</span>
              {profile.status !== "ACTIVE" ? <Badge>{enumLabel("memberStatus", profile.status)}</Badge> : null}
            </p>
          </div>
        </div>
        {actions}
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-1.5">
        <Fact label={P.fields.joinedAt}>
          <DateStamp date={profile.joinedAt} kind="business" className="text-sm" />
          <span className="text-ink-secondary"> · {formatTenure(profile.joinedAt, today)}</span>
        </Fact>
        <Fact label={P.fields.manager}>{profile.managerName}</Fact>
        <Fact label={P.fields.lastOneOnOne}>
          {profile.lastOneOnOne ? (
            <DateStamp date={profile.lastOneOnOne} kind="business" className="text-sm" />
          ) : (
            <Absent>{P.none}</Absent>
          )}
        </Fact>
        <Fact label={P.fields.nextFollowUp}>
          {next && nextSeverity ? (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <DateStamp date={next.date} kind="business" className="text-sm" />
              <span className="text-ink-secondary">{P.followUpKind[next.kind]}</span>
              {nextSeverity.stage !== "on-track" ? (
                <StatusPill severity={nextSeverity.severity} strong={nextSeverity.strong} label={followUpLabel(nextSeverity)} />
              ) : null}
            </span>
          ) : (
            <Absent>{P.noneScheduled}</Absent>
          )}
        </Fact>
      </dl>

      {profile.responsibilities.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="sr-only">{P.fields.responsibilities}</span>
          {profile.responsibilities.map((r) => (
            <MetaLabel key={r.id} className="rounded-sm border border-line px-1.5 py-0.5">
              {r.name}
            </MetaLabel>
          ))}
        </div>
      ) : null}

      {inactive && profile.deletedAt ? (
        <p className="text-sm text-ink-secondary">{fill(P.inactive, { date: formatDate(profile.deletedAt) })}</p>
      ) : null}

      {profile.attention ? (
        <p className="flex items-start gap-2 text-sm text-ink">
          <SeverityDot
            severity={profile.attention.severity}
            strong={profile.attention.strong}
            label={P.attention}
            className="mt-1.5"
          />
          <span>
            <span className="font-medium">{P.attention}: </span>
            {profile.attention.reasons.map((r) => r.text).join(" · ")}
          </span>
        </p>
      ) : null}
    </header>
  )
}
