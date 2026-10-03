"use client"

import * as React from "react"
import Link from "next/link"

import { FeedbackDialog } from "@/components/forms/feedback-dialog"
import { OneOnOneDialog } from "@/components/forms/one-on-one-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { MetaLabel } from "@/components/ui/meta-label"
import { SeverityDot } from "@/components/ui/severity-dot"
import { enumLabel, labels } from "@/lib/labels"
import { avatarColors, initials } from "@/lib/people"
import { cn } from "@/lib/utils"
import type { Alert } from "@/server/alerts"

const T = labels.today

type Dialog = { kind: "oneOnOne" | "feedback"; member: { id: string; preferredName: string } } | null

/**
 * "Precisa de você": UMA lista, todos os tipos misturados, na ordem de
 * urgência que o motor devolve. Cada linha: severidade, pessoa, o que
 * aconteceu numa frase, há quanto tempo e a ação direta. Informativos
 * (prontidão) vêm por último, separados.
 */
export function AlertList({ alerts, canWrite, hasTeam }: { alerts: Alert[]; canWrite: boolean; hasTeam: boolean }) {
  const [dialog, setDialog] = React.useState<Dialog>(null)
  const actionable = alerts.filter((a) => !a.informative)
  const informative = alerts.filter((a) => a.informative)

  return (
    <>
      {actionable.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState size="compact" title={T.emptyTitle} direction={hasTeam ? T.emptyDirection : T.noTeam} />
        </div>
      ) : (
        <ol aria-label={T.listLabel} className="flex flex-col rounded-lg border border-line bg-surface">
          {actionable.map((a) => (
            <AlertRow key={a.id} alert={a} canWrite={canWrite} onOpen={setDialog} />
          ))}
        </ol>
      )}
      {informative.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <MetaLabel>{T.informativeHeading}</MetaLabel>
          <ul className="flex flex-col">
            {informative.map((a) => (
              <AlertRow key={a.id} alert={a} canWrite={canWrite} onOpen={setDialog} plain />
            ))}
          </ul>
        </div>
      ) : null}
      {dialog?.kind === "oneOnOne" ? (
        <OneOnOneDialog open onOpenChange={(open) => !open && setDialog(null)} member={dialog.member} />
      ) : null}
      {dialog?.kind === "feedback" ? (
        <FeedbackDialog open onOpenChange={(open) => !open && setDialog(null)} member={dialog.member} />
      ) : null}
    </>
  )
}

function AlertRow({
  alert,
  canWrite,
  onOpen,
  plain = false,
}: {
  alert: Alert
  canWrite: boolean
  onOpen: (dialog: Dialog) => void
  /** Sem divisor de lista (informativos). */
  plain?: boolean
}) {
  const action = alert.action
  const member = alert.member
  const severityText = alert.informative
    ? T.alerts.informative
    : alert.severity === "attention" && alert.strong
      ? labels.severity.attentionStrong
      : enumLabel("severity", alert.severity)

  let button: React.ReactNode = null
  if (action.kind === "link") {
    button = (
      <Button asChild variant="ghost" size="sm">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    )
  } else if (canWrite && member) {
    button = (
      <Button variant="ghost" size="sm" onClick={() => onOpen({ kind: action.kind, member })}>
        {action.label}
      </Button>
    )
  }

  return (
    <li
      className={cn(
        "grid grid-cols-[6px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 md:grid-cols-[6px_144px_minmax(0,1fr)_128px_auto]",
        plain ? "px-0 py-1.5" : "border-b border-line last:border-b-0",
      )}
    >
      <SeverityDot severity={alert.severity} strong={alert.strong} label={severityText} className="self-center" />
      {member ? (
        <Link href={`/team/${member.id}`} className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink hover:underline">
          <Avatar size="sm">
            <AvatarFallback style={avatarColors(member.id)}>{initials(member.fullName)}</AvatarFallback>
          </Avatar>
          <span className="truncate">{member.preferredName}</span>
        </Link>
      ) : (
        <span className="text-sm font-medium text-ink">{T.team}</span>
      )}
      <span className="col-start-3 row-start-1 justify-self-end text-xs whitespace-nowrap text-ink-secondary tabular-nums md:col-start-4">{alert.age}</span>
      <p className="col-span-2 col-start-2 min-w-0 text-sm text-ink md:col-span-1 md:col-start-3 md:row-start-1">{alert.text}</p>
      {button ? (
        <span className="col-span-2 col-start-2 -ml-2 justify-self-start md:col-span-1 md:col-start-5 md:row-start-1 md:ml-0 md:justify-self-end">
          {button}
        </span>
      ) : null}
    </li>
  )
}
