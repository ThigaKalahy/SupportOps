"use client"

import * as React from "react"
import { KeyRoundIcon } from "lucide-react"

import { createApiKey, revokeApiKey } from "@/actions/teams"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { MetaLabel } from "@/components/ui/meta-label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusPill } from "@/components/ui/status-pill"
import { useToast } from "@/components/ui/toast"
import { formatDate, formatDateTime } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"

const K = labels.settings.teamAdmin.apiKeys

export interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  owner: string
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

/**
 * C22 — chaves da API de combinados de um time (Configurações › Times e acessos, só
 * administração). Gerar mostra a chave UMA vez, com "Copiar"; a lista mostra só o início.
 * Revogar pede confirmação no app, com botão de perigo.
 */
export function ApiKeysBlock({
  teamId,
  keys,
  owners,
}: {
  teamId: string
  keys: ApiKeyRow[]
  /** Quem pode ser dono: os gestores (MANAGER) do time. */
  owners: { userId: string; name: string }[]
}) {
  const [creating, setCreating] = React.useState(false)
  const [revoking, setRevoking] = React.useState<ApiKeyRow | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <MetaLabel>{K.title}</MetaLabel>
        {owners.length ? (
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            <KeyRoundIcon />
            {K.create}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-ink-secondary">{K.direction}</p>
      {keys.length === 0 ? (
        <p className="text-sm text-ink-secondary">{K.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {keys.map((k) => (
            <li key={k.id} className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{k.name}</p>
                <p className="truncate text-xs text-ink-secondary">
                  {K.columns.owner}: {k.owner} · <span className="font-mono">mo_{k.prefix}_…</span>
                </p>
              </div>
              <span className="font-mono text-2xs text-ink-secondary">
                {K.columns.created} {formatDate(k.createdAt)} · {k.lastUsedAt ? `${K.columns.lastUsed} ${formatDateTime(k.lastUsedAt)}` : K.never}
              </span>
              {k.revokedAt ? (
                <StatusPill severity="neutral" label={fill(K.revoked, { date: formatDate(k.revokedAt) })} />
              ) : (
                <>
                  <StatusPill severity="calm" label={K.active} />
                  <Button size="sm" variant="ghost" onClick={() => setRevoking(k)}>
                    {K.revoke}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <CreateKeyDialog teamId={teamId} owners={owners} open={creating} onOpenChange={setCreating} />
      <RevokeKeyDialog teamId={teamId} apiKey={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </div>
  )
}

function CreateKeyDialog({
  teamId,
  owners,
  open,
  onOpenChange,
}: {
  teamId: string
  owners: { userId: string; name: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = React.useState("")
  const [userId, setUserId] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [created, setCreated] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!open) return
    setName("")
    setUserId(owners.length === 1 ? owners[0]!.userId : "")
    setErrors({})
    setError(null)
    setCreated(null)
    setCopied(false)
  }, [open, owners])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createApiKey({ teamId, userId, name })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        return setError(result.error)
      }
      if ("key" in result) setCreated(result.key)
    })
  }

  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{K.createTitle}</DialogTitle>
          <DialogDescription>{created ? K.created : K.createDescription}</DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="flex flex-col gap-3">
            <Input readOnly value={created} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label={K.title} />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={copy}>
                {copied ? K.copied : K.copy}
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {K.done}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <FieldGroup label={K.name} required error={errors.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={K.namePlaceholder} autoFocus />
            </FieldGroup>
            <FieldGroup label={K.owner} required help={K.ownerHint} error={errors.userId}>
              {(control) => (
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((o) => (
                      <SelectItem key={o.userId} value={o.userId}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            {error ? (
              <p role="alert" className="text-sm text-overdue">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
                {K.cancel}
              </Button>
              <Button type="submit" loading={pending}>
                {K.generate}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RevokeKeyDialog({ teamId, apiKey, onOpenChange }: { teamId: string; apiKey: ApiKeyRow | null; onOpenChange: (open: boolean) => void }) {
  const toast = useToast()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function confirm() {
    if (!apiKey) return
    setError(null)
    startTransition(async () => {
      const result = await revokeApiKey({ teamId, id: apiKey.id })
      if (!result.ok) return setError(result.error)
      toast.show(fill(K.revoked, { date: formatDate(new Date()) }), { tone: "calm" })
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={apiKey !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{K.revokeTitle}</DialogTitle>
          <DialogDescription>{fill(K.revokeDescription, { name: apiKey?.name ?? "" })}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-overdue">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {K.cancel}
          </Button>
          <Button type="button" variant="destructive" loading={pending} onClick={confirm}>
            {K.revokeConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
