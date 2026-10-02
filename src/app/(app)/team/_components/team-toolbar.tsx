"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { PlusIcon, SlidersHorizontalIcon } from "lucide-react"

import { MemberDialog } from "@/components/member/member-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { labels } from "@/lib/labels"
import type { MemberFormCatalogs } from "@/server/queries/members"

import { TEAM_PARAMS, type TeamView } from "../params"

const F = labels.team.filters
const ALL = "all"

/**
 * Filtros e ação primária de /team, na barra de contexto. O estado vive na URL
 * (searchParams): linkável e resistente a refresh — nunca em estado local.
 * Os filtros ficam num popover: inline, não cabem na faixa direita da barra.
 */
export function TeamToolbar({
  view,
  seniorities,
  catalogs,
}: {
  view: TeamView
  seniorities: { key: string; label: string }[]
  /** Presente só para quem escreve: habilita "Adicionar pessoa". */
  catalogs: MemberFormCatalogs | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [adding, setAdding] = React.useState(false)

  function update(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null) params.delete(key)
    else params.set(key, value)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const activeFilters = [view.seniority, view.status === "inactive", view.needsAttention].filter(Boolean).length

  const controls = (
    <div className="flex flex-col gap-3">
      <Select value={view.seniority ?? ALL} onValueChange={(v) => update(TEAM_PARAMS.seniority, v === ALL ? null : v)}>
        <SelectTrigger size="sm" aria-label={F.seniority} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>
            {F.seniority}: {F.allSeniorities}
          </SelectItem>
          {seniorities.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={view.status} onValueChange={(v) => update(TEAM_PARAMS.status, v === "current" ? null : v)}>
        <SelectTrigger size="sm" aria-label={F.status} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="current">{F.current}</SelectItem>
          <SelectItem value="inactive">{F.inactive}</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2 whitespace-nowrap">
        <Checkbox
          id="team-attention"
          checked={view.needsAttention}
          onCheckedChange={(c) => update(TEAM_PARAMS.attention, c === true ? "1" : null)}
        />
        <Label htmlFor="team-attention" className="font-normal">
          {F.needsAttention}
        </Label>
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap">
        <Checkbox
          id="team-group"
          checked={view.grouped}
          onCheckedChange={(c) => update(TEAM_PARAMS.group, c === true ? null : "off")}
        />
        <Label htmlFor="team-group" className="font-normal">
          {F.groupBySeniority}
        </Label>
      </div>
      {activeFilters > 0 ? (
        <Button variant="link" size="sm" className="self-start" onClick={() => router.replace(pathname, { scroll: false })}>
          {F.clear}
        </Button>
      ) : null}
    </div>
  )

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm">
            <SlidersHorizontalIcon />
            {F.button}
            {activeFilters > 0 ? <span className="font-mono text-2xs text-accent">{activeFilters}</span> : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          {controls}
        </PopoverContent>
      </Popover>
      {catalogs ? (
        <>
          <Button size="sm" onClick={() => setAdding(true)}>
            <PlusIcon />
            <span className="max-sm:sr-only">{labels.team.add}</span>
          </Button>
          <MemberDialog open={adding} onOpenChange={setAdding} catalogs={catalogs} />
        </>
      ) : null}
    </>
  )
}
