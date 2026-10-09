"use client"

import { WatchButton } from "@/components/watch/watch-button"
import { WatchList } from "@/components/watch/watch-list"
import { ProfileWatchBlock } from "@/components/watch/profile-watch-block"
import { StatusPill } from "@/components/ui/status-pill"
import { DEFAULT_THRESHOLDS } from "@/lib/alert-thresholds"
import { labels } from "@/lib/labels"
import { coldHighDays, HEAT_SEVERITY, reviewState, WATCH_HEATS, type WatchHeat } from "@/lib/watch"
import type { WatchRow } from "@/server/queries/watch"

import { Specimen } from "./specimen"

const W = labels.watch

/** Criação simulada: sem tocar no banco. */
async function fakeCreate() {
  return { ok: true as const, id: `lab-${Date.now()}`, existed: false }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

function row(id: string, title: string, heat: WatchHeat, reviewedDaysAgo: number, heatDaysAgo: number, patch: Partial<WatchRow> = {}): WatchRow {
  const base = {
    id,
    title,
    context: null,
    heat,
    status: "ACTIVE" as const,
    origin: "DAILY" as const,
    visibility: "PRIVATE" as const,
    member: { id: "m2", preferredName: "Diego" },
    central: null,
    link: null,
    createdAt: daysAgo(40),
    lastReviewedAt: daysAgo(reviewedDaysAgo),
    heatChangedAt: daysAgo(heatDaysAgo),
    reviewCount: 3,
    resolvedAt: null,
    resolutionNote: null,
    updatedAt: daysAgo(reviewedDaysAgo),
    ...patch,
  }
  const now = new Date()
  return { ...base, review: reviewState(base, now, DEFAULT_THRESHOLDS), coldHighDays: coldHighDays(base, now, DEFAULT_THRESHOLDS) }
}

const ROWS: WatchRow[] = [
  row("w1", "Diego travado na integração fiscal do cliente Nbusiness", "HIGH", 6, 35, {
    link: { kind: "agreement", label: "Validar retorno da API do ERP", href: "/agreements" },
    origin: "AGREEMENT",
  }),
  row("w2", "Escalonamentos da Central Alfa voltando sem diagnóstico", "HIGH", 1, 3, { member: null, central: { id: "c1", name: "Central Alfa" }, origin: "MANUAL" }),
  row("w3", "Larissa insegura com chamados de hardware", "MEDIUM", 9, 9, { member: { id: "m1", preferredName: "Larissa" }, reviewCount: 0 }),
  row("w4", "Ritmo da fila N2 depois das férias", "LOW", 10, 40, { member: null, origin: "MANUAL", reviewCount: 1 }),
]

/** Em observação (P21): WatchButton nos estados, graus, a lista e o bloco do perfil. */
export function LabWatch() {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap gap-6">
        <Specimen state="WatchButton · novo (abre o popover inline)">
          <WatchButton origin="DAILY" defaults={{ title: "Disse que está sobrecarregado com a fila N2", heat: "HIGH" }} createAction={fakeCreate} />
        </Specimen>
        {WATCH_HEATS.map((heat) => (
          <Specimen key={heat} state={`WatchButton · já em observação · ${W.heat[heat].toLowerCase()}`}>
            <WatchButton origin="DAILY" defaults={{ title: "Observação existente" }} existing={{ id: `lab-${heat}`, heat }} createAction={fakeCreate} />
          </Specimen>
        ))}
        <Specimen state="WatchButton · rótulo (perfil, Nova observação)">
          <WatchButton variant="label" origin="MANUAL" defaults={{ title: "" }} labelText={W.actions.new} repeatable createAction={fakeCreate} />
        </Specimen>
      </div>
      <Specimen state="Graus">
        {WATCH_HEATS.map((h) => (
          <StatusPill key={h} severity={HEAT_SEVERITY[h]} label={W.heat[h]} />
        ))}
      </Specimen>
      <Specimen state="Lista · por grau, o mais esquecido no topo · fogo alto frio · sem revisão · nunca revisada" className="w-full">
        <div className="w-full">
          <WatchList rows={ROWS} canWrite grouped empty={{ title: "", direction: "" }} openId={null} />
        </div>
      </Specimen>
      <div className="grid w-full gap-8 md:grid-cols-2">
        <Specimen state="Bloco do perfil · com observações" className="max-w-sm">
          <div className="w-full">
            <ProfileWatchBlock items={ROWS.slice(0, 3)} member={{ id: "m2", preferredName: "Diego" }} />
          </div>
        </Specimen>
        <Specimen state="Bloco do perfil · vazio" className="max-w-sm">
          <div className="w-full">
            <ProfileWatchBlock items={[]} member={{ id: "m1", preferredName: "Camila" }} />
          </div>
        </Specimen>
      </div>
    </div>
  )
}
