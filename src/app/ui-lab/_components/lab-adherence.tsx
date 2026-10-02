"use client"

import { AdherencePanel } from "@/components/adherence/adherence-panel"
import { LowConfidenceMark, RateWithTotal, TrendIndicator } from "@/components/adherence/adherence-parts"
import { FilterSelect } from "@/components/ui/filter-select"
import { PeriodPicker } from "@/components/ui/period-picker"
import { Sparkline } from "@/components/ui/sparkline"
import { computeAdherence, lastMonths, makeRate, makeTrend, type AdherenceAgreement } from "@/lib/adherence"
import { todayBusinessDate } from "@/lib/dates"

import { Specimen } from "./specimen"

/** Cumprimento: taxa com total, amostra pequena, tendência, painel do perfil e os primitivos novos. */

const today = todayBusinessDate()
const day = (offset: number) => {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() - offset)
  return d
}
const base = (i: number, patch: Partial<AdherenceAgreement> = {}): AdherenceAgreement => ({
  id: `lab${i}`,
  status: "DONE",
  originalDueDate: day(10 + i),
  completedAt: day(10 + i),
  reschedules: 0,
  lastBlockerCategory: null,
  ...patch,
})
const agreements = [
  ...Array.from({ length: 9 }, (_, i) => base(i)),
  base(9, { completedAt: day(2) }),
  base(10, { status: "OPEN", completedAt: null, reschedules: 4, lastBlockerCategory: "EXTERNAL" }),
  base(11, { status: "OPEN", completedAt: null, reschedules: 1, lastBlockerCategory: "INTERNAL" }),
  base(12, { status: "CANCELLED", completedAt: null }),
  base(13, { completedAt: day(1), lastBlockerCategory: "EXTERNAL" }),
]
const adherence = computeAdherence(agreements, { from: day(89), to: today }, today)
const series = lastMonths(today, 6).map((m, i) => ({
  month: m.from,
  ...computeAdherence(i === 2 ? [] : agreements.slice(0, 6 + i), m, today),
}))

export function LabAdherence() {
  return (
    <div className="flex w-full flex-col gap-6">
      <Specimen state="RateWithTotal · suficiente · amostra pequena · sem combinado">
        <RateWithTotal rate={makeRate(11, 14)} />
        <RateWithTotal rate={makeRate(3, 4)} />
        <RateWithTotal rate={makeRate(0, 0)} />
        <LowConfidenceMark />
      </Specimen>
      <Specimen state="TrendIndicator · subiu · caiu · estável · amostra pequena · compacto">
        <TrendIndicator trend={makeTrend(makeRate(9, 10), makeRate(6, 10))} />
        <TrendIndicator trend={makeTrend(makeRate(3, 6), makeRate(5, 6))} />
        <TrendIndicator trend={makeTrend(makeRate(5, 6), makeRate(5, 6))} />
        <TrendIndicator trend={makeTrend(makeRate(1, 2), makeRate(2, 2))} />
        <TrendIndicator trend={makeTrend(makeRate(3, 6), makeRate(5, 6))} compact />
      </Specimen>
      <Specimen state="Sparkline · escala 0–100 · mês sem dado vira lacuna">
        <Sparkline label="Taxa mensal" values={[100, 100, null, 83, 50, null]} domain={[0, 100]} width={144} />
        <Sparkline label="Taxa mensal" values={[60, 70, 65, 72, 70, 75]} domain={[0, 100]} width={144} />
      </Specimen>
      <Specimen state="PeriodPicker · FilterSelect">
        <PeriodPicker
          label="Período"
          options={[
            { value: "30d", label: "30 dias" },
            { value: "90d", label: "90 dias" },
            { value: "custom", label: "Personalizado" },
          ]}
          value="90d"
          defaultValue="90d"
          from={null}
          to={null}
        />
        <div className="w-56">
          <FilterSelect label="Responsável" value={null} allLabel="Todos" options={[{ value: "a", label: "Camila" }]} onChange={() => undefined} />
        </div>
      </Specimen>
      <Specimen state="AdherencePanel · aba Combinados do perfil" className="w-full">
        <div className="w-full">
          <AdherencePanel
            days={90}
            adherence={adherence}
            series={series}
            trend={makeTrend(makeRate(3, 6), makeRate(5, 6))}
            breakdown={{
              total: 7,
              byReason: [
                { reasonId: "r1", label: "Dependência de terceiro", category: "EXTERNAL", count: 4 },
                { reasonId: "r2", label: "Volume operacional", category: "CAPACITY", count: 2 },
                { reasonId: null, label: null, category: null, count: 1 },
              ],
              byCategory: [],
            }}
            chronic={[{ id: "lab10", title: "Validar com o fornecedor do ERP o retorno da API" }]}
          />
        </div>
      </Specimen>
    </div>
  )
}
