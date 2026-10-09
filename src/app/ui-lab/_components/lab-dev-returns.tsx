"use client"

import { DevReturnForm } from "@/components/dev-returns/dev-return-form"
import { DevReturnSummary } from "@/components/dev-returns/dev-return-summary"
import { DevReturnsTable } from "@/components/dev-returns/dev-returns-table"
import { ProfileDevReturnBlock } from "@/components/dev-returns/profile-dev-return-block"
import { StatusPill } from "@/components/ui/status-pill"
import { todayBusinessDate } from "@/lib/dates"
import { DEFAULT_DEV_RETURN_REASONS, DEV_RETURN_CATEGORIES, devReturnStats } from "@/lib/dev-returns"
import { enumLabel } from "@/lib/labels"
import type { DevReturnFormData, DevReturnRow } from "@/server/queries/dev-returns"

import { Specimen } from "./specimen"

const DATA: DevReturnFormData = {
  centralsEnabled: true,
  members: [
    { id: "m1", preferredName: "Camila" },
    { id: "m2", preferredName: "Diego" },
    { id: "m3", preferredName: "Otávio" },
  ],
  reasons: DEFAULT_DEV_RETURN_REASONS.map((r, i) => ({ id: `r${i + 1}`, ...r })),
  patterns: [{ id: "p1", label: "Helpdesk — tickets", regex: "/tickets/(\d+)", captureGroup: 1 }],
  centrals: [
    { id: "c1", name: "Central Alfa" },
    { id: "c2", name: "Central Beta" },
  ],
}

function day(offset: number): Date {
  const d = todayBusinessDate()
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}

const ROWS: DevReturnRow[] = [
  {
    id: "d1",
    ticketUrl: "https://helpdesk.exemplo.com.br/a/tickets/48213",
    ticketRef: "48213",
    returnedAt: day(-1),
    member: { id: "m2", preferredName: "Diego" },
    central: { id: "c1", name: "Central Alfa" },
    reason: { id: "r2", label: "Evidência insuficiente (sem log, print ou passo a passo)", category: "ANALYST" },
    reasonOther: null,
    devContact: "Time Fiscal",
    note: null,
    resolvedAt: null,
    resolutionNote: null,
    validation: { outcome: "RAISED" },
  },
  {
    id: "d2",
    ticketUrl: "https://helpdesk.exemplo.com.br/a/tickets/48190",
    ticketRef: "48190",
    returnedAt: day(-9),
    member: { id: "m1", preferredName: "Camila" },
    central: null,
    reason: { id: "r10", label: "Critério de triagem divergente entre as áreas", category: "PROCESS" },
    reasonOther: null,
    devContact: null,
    note: null,
    resolvedAt: day(-7),
    resolutionNote: "Reclassificado com o time de produto",
    validation: null,
  },
]

/** Devolução do desenvolvimento (P20): formulário, resumo, tabela, categoria e bloco do perfil. */
export function LabDevReturns() {
  const stats = devReturnStats(
    [
      { category: "ANALYST", returnedAt: day(-10), resolvedAt: day(-8) },
      { category: "ANALYST", returnedAt: day(-3), resolvedAt: null },
      { category: "PROCESS", returnedAt: day(-2), resolvedAt: null },
    ],
    42,
  )
  const small = devReturnStats([{ category: "ANALYST", returnedAt: day(-3), resolvedAt: null }], 0)
  return (
    <div className="flex w-full flex-col gap-6">
      <Specimen state="DevReturnForm · vazio (cole https://helpdesk.exemplo.com.br/a/tickets/48213)" className="w-full">
        <div className="w-full rounded-lg border border-line bg-canvas p-4">
          <DevReturnForm data={DATA} editing={null} onDoneEditing={() => undefined} />
        </div>
      </Specimen>
      <Specimen state="Categoria do motivo · analista · processo">
        {DEV_RETURN_CATEGORIES.map((c) => (
          <StatusPill key={c} severity={c === "ANALYST" ? "attention" : "neutral"} label={enumLabel("devReturnCategory", c)} />
        ))}
      </Specimen>
      <Specimen state="Resumo · com chamados validados" className="w-full">
        <div className="w-full">
          <DevReturnSummary stats={stats} />
        </div>
      </Specimen>
      <Specimen state="Resumo · sem chamado validado (só a contagem, amostra pequena)" className="w-full">
        <div className="w-full">
          <DevReturnSummary stats={small} />
        </div>
      </Specimen>
      <Specimen state="Tabela · em aberto e reenviada" className="w-full">
        <div className="w-full">
          <DevReturnsTable rows={ROWS} canWrite empty={{ title: "", direction: "" }} onEdit={() => undefined} />
        </div>
      </Specimen>
      <div className="grid w-full gap-8 md:grid-cols-2">
        <Specimen state="Bloco do perfil · com devoluções" className="max-w-sm">
          <div className="w-full">
            <ProfileDevReturnBlock
              data={{ days: 90, total: 4, attributable: 3, ticketsValidated: 61, lowConfidence: false, topReason: { label: "Falta de informação no chamado", count: 2 }, series: [0, 1, 0, 2, 1, 2] }}
              member={{ id: "m2", preferredName: "Diego" }}
              canWrite
              href="/dev-returns"
            />
          </div>
        </Specimen>
        <Specimen state="Bloco do perfil · sem devoluções · leitura" className="max-w-sm">
          <div className="w-full">
            <ProfileDevReturnBlock
              data={{ days: 90, total: 0, attributable: 0, ticketsValidated: 12, lowConfidence: true, topReason: null, series: [0, 0, 0, 0, 0, 0] }}
              member={{ id: "m1", preferredName: "Camila" }}
              canWrite={false}
              href="/dev-returns"
            />
          </div>
        </Specimen>
      </div>
    </div>
  )
}
