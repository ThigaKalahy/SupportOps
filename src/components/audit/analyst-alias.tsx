"use client"

import * as React from "react"

import { linkAnalystAlias } from "@/actions/audit"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { fill, labels } from "@/lib/labels"

const B = labels.audit.batch

/**
 * C23 Fase C — liga o nome do analista como aparece nos TXT ("Pablo Arregue") a uma pessoa do
 * time. É a única forma de reconhecer: o sistema nunca casa nomes por aproximação.
 */
export function AnalystAliasRow({ name, count, members }: { name: string; count: number; members: { id: string; name: string; fullName: string }[] }) {
  const toast = useToast()
  const [memberId, setMemberId] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function link() {
    setError(null)
    startTransition(async () => {
      const result = await linkAnalystAlias({ alias: name, memberId })
      if (!result.ok) return setError(result.error)
      toast.show(fill(B.linked, { name, count: "linked" in result ? result.linked : 0 }), { tone: "calm" })
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <span className="min-w-40 flex-1 text-sm text-ink">
        {name} <span className="font-mono text-xs text-ink-secondary">({count})</span>
      </span>
      <Select value={memberId} onValueChange={setMemberId}>
        <SelectTrigger className="w-56" aria-label={`${B.linkPlaceholder}: ${name}`}>
          <SelectValue placeholder={B.linkPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name} <span className="text-ink-secondary">· {m.fullName}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="secondary" onClick={link} loading={pending} disabled={!memberId}>
        {B.link}
      </Button>
      {error ? <span className="basis-full text-xs text-overdue">{error}</span> : null}
    </li>
  )
}
