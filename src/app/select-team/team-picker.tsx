"use client"

import { TeamList, type TeamOption } from "@/components/teams/team-list"
import { useSelectTeam } from "@/components/teams/team-switcher"
import { labels } from "@/lib/labels"

/** A lista de /select-team: foco já na lista, setas percorrem, Enter abre. */
export function TeamPicker({ teams, activeId }: { teams: TeamOption[]; activeId: string | null }) {
  const { select, pendingId, error } = useSelectTeam()
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <TeamList teams={teams} activeId={activeId} pendingId={pendingId} onSelect={select} autoFocus />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-overdue">
          {error}
        </p>
      ) : (
        <p className="text-xs text-ink-secondary">{labels.teams.keyboardHint}</p>
      )}
    </div>
  )
}
