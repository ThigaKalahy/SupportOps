"use client"

import * as React from "react"
import { EllipsisIcon, PlusIcon } from "lucide-react"
import type { TeamAccessLevel } from "@prisma/client"

import { grantTeamAccess, revokeTeamAccess, setTeamModule } from "@/actions/teams"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FieldGroup } from "@/components/ui/field-group"
import { MetaLabel } from "@/components/ui/meta-label"
import { Section } from "@/components/ui/section"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusPill } from "@/components/ui/status-pill"
import { useToast } from "@/components/ui/toast"
import { formatDate } from "@/lib/dates"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import type { ModuleKey } from "@/lib/modules"

const A = labels.settings.teamAdmin
const LEVELS: TeamAccessLevel[] = ["MANAGER", "VIEWER"]

export interface TeamAdminTeam {
  id: string
  name: string
  slug: string
  isActive: boolean
  members: number
  modules: { key: ModuleKey; enabled: boolean }[]
  access: { userId: string; name: string; email: string; level: TeamAccessLevel; grantedAt: Date }[]
}

export interface TeamAdminUser {
  id: string
  name: string
  email: string
}

/**
 * /settings/team (P23): times da organização, módulos de cada um e quem tem
 * acesso. Só para `isPlatformAdmin` (a página nem existe para os outros).
 * Tudo grava AuditLog no servidor; desligar módulo não apaga dado — a tela diz isso.
 */
export function TeamAdmin({ teams, users, currentUserId }: { teams: TeamAdminTeam[]; users: TeamAdminUser[]; currentUserId: string }) {
  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-3xl text-sm text-ink-secondary">{A.direction}</p>
      {teams.map((team) => (
        <TeamBlock key={team.id} team={team} users={users} currentUserId={currentUserId} />
      ))}
    </div>
  )
}

function TeamBlock({ team, users, currentUserId }: { team: TeamAdminTeam; users: TeamAdminUser[]; currentUserId: string }) {
  const toast = useToast()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [granting, setGranting] = React.useState(false)
  const [revoking, setRevoking] = React.useState<TeamAdminTeam["access"][number] | null>(null)
  const candidates = users.filter((u) => !team.access.some((a) => a.userId === u.id))

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) toast.show(success, { tone: "calm" })
      else setError(result.error ?? labels.validation.generic)
    })
  }

  return (
    <Section
      title={team.name}
      action={
        <Button size="sm" variant="secondary" onClick={() => setGranting(true)} disabled={candidates.length === 0}>
          <PlusIcon />
          {A.grant}
        </Button>
      }
    >
      <p className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary">
        <span>
          {A.slug} <span className="font-mono text-ink">{team.slug}</span>
        </span>
        <span className="font-mono">{plural(A.members, team.members)}</span>
        {team.isActive ? null : <StatusPill severity="neutral" label={A.inactive} />}
      </p>
      {error ? (
        <p role="alert" className="rounded-sm border border-overdue bg-overdue-wash px-3 py-2 text-sm text-overdue">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <fieldset className="flex flex-col gap-3" disabled={pending}>
          <legend className="mb-2">
            <MetaLabel>{A.modulesTitle}</MetaLabel>
          </legend>
          <ul className="flex flex-col gap-3">
            {team.modules.map((m) => {
              const id = `${team.id}-${m.key}`
              return (
                <li key={m.key} className="flex items-start gap-2.5">
                  <Checkbox
                    id={id}
                    checked={m.enabled}
                    onCheckedChange={(checked) =>
                      run(() => setTeamModule({ teamId: team.id, moduleKey: m.key, enabled: checked === true }), A.moduleSaved)
                    }
                    className="mt-0.5"
                  />
                  <label htmlFor={id} className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm text-ink">
                      {A.moduleNames[m.key]}
                      <span className="text-ink-secondary"> · {m.enabled ? A.on : A.off}</span>
                    </span>
                    <span className="text-xs text-ink-secondary">{A.moduleHelp[m.key]}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-ink-secondary">{A.moduleNote}</p>
        </fieldset>

        <div className="flex flex-col gap-2">
          <MetaLabel>{A.accessTitle}</MetaLabel>
          {team.access.length === 0 ? (
            <p className="text-sm text-ink-secondary">{A.noAccess}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
              {team.access.map((a) => {
                const self = a.userId === currentUserId
                const other = a.level === "MANAGER" ? "VIEWER" : "MANAGER"
                return (
                  <li key={a.userId} className="flex min-h-10 items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">
                        {a.name}
                        {self ? <span className="text-ink-secondary"> ({A.you})</span> : null}
                      </p>
                      <p className="truncate text-xs text-ink-secondary">{a.email}</p>
                    </div>
                    <span className="shrink-0 text-xs text-ink">{enumLabel("teamAccessLevel", a.level)}</span>
                    <span className="hidden shrink-0 font-mono text-2xs text-ink-secondary sm:inline">
                      {fill(A.grantedAt, { date: formatDate(a.grantedAt) })}
                    </span>
                    {self ? (
                      <span className="size-8 shrink-0" aria-hidden />
                    ) : (
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`${A.accessTitle}: ${a.name}`} disabled={pending}>
                            <EllipsisIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() =>
                              run(() => grantTeamAccess({ teamId: team.id, userId: a.userId, level: other }), A.saved)
                            }
                          >
                            {fill(A.changeLevel, { level: enumLabel("teamAccessLevel", other) })}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setRevoking(a)} className="text-overdue focus:text-overdue">
                            {A.revoke}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <GrantDialog team={team} users={candidates} open={granting} onOpenChange={setGranting} />
      <RevokeDialog team={team} access={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </Section>
  )
}

function GrantDialog({
  team,
  users,
  open,
  onOpenChange,
}: {
  team: TeamAdminTeam
  users: TeamAdminUser[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const [userId, setUserId] = React.useState("")
  const [level, setLevel] = React.useState<TeamAccessLevel>("VIEWER")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (open) {
      setUserId("")
      setLevel("VIEWER")
      setError(null)
    }
  }, [open])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!userId) return setError(labels.validation.required)
    startTransition(async () => {
      const result = await grantTeamAccess({ teamId: team.id, userId, level })
      if (!result.ok) return setError(result.error)
      toast.show(A.saved, { tone: "calm" })
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fill(A.grantTitle, { team: team.name })}</DialogTitle>
          <DialogDescription>{A.grantDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {users.length === 0 ? (
            <p className="text-sm text-ink-secondary">{A.noUsers}</p>
          ) : (
            <FieldGroup label={A.user} required>
              {(control) => (
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue placeholder={A.userPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} · {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
          )}
          <FieldGroup label={A.levelField} required help={A.levelHelp[level]}>
            {(control) => (
              <Select value={level} onValueChange={(v) => setLevel(v as TeamAccessLevel)}>
                <SelectTrigger {...control} className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {enumLabel("teamAccessLevel", l)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldGroup>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending} disabled={users.length === 0}>
              {A.grant}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Revogar acesso: confirmação no próprio app, botão de perigo que nunca é o padrão. */
function RevokeDialog({
  team,
  access,
  onOpenChange,
}: {
  team: TeamAdminTeam
  access: TeamAdminTeam["access"][number] | null
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const keepRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (access) setError(null)
  }, [access])

  return (
    <Dialog open={access !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          keepRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{access ? fill(A.revokeTitle, { name: access.name }) : null}</DialogTitle>
          <DialogDescription>{access ? fill(A.revokeDescription, { name: access.name, team: team.name }) : null}</DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        <DialogFooter>
          <Button ref={keepRef} type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {labels.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={pending}
            onClick={() =>
              access &&
              startTransition(async () => {
                const result = await revokeTeamAccess({ teamId: team.id, userId: access.userId })
                if (!result.ok) return setError(result.error)
                toast.show(A.saved)
                onOpenChange(false)
              })
            }
          >
            {A.revokeConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
