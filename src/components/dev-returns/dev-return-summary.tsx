import { StatusPill } from "@/components/ui/status-pill"
import { StatStrip } from "@/components/ui/stat-strip"
import { DEV_RETURN_MIN_SAMPLE, devReturnRate, formatDevReturnRate, type DevReturnStats } from "@/lib/dev-returns"
import { fill, labels, plural } from "@/lib/labels"

const S = labels.devReturns.summary
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })

/**
 * Resumo do período em uma faixa (não cards): devoluções, atribuíveis ao
 * analista, de processo, reenviadas e em aberto. Toda taxa sai com o
 * denominador — os chamados validados no período (D19) — e a atribuível
 * nunca aparece sem a total ao lado. Abaixo de 20 chamados, "amostra pequena".
 */
export function DevReturnSummary({ stats }: { stats: DevReturnStats }) {
  const texts = { withTotal: S.rate, countOnly: S.countOnly }
  const rate = (count: number) => formatDevReturnRate(devReturnRate(count, stats.ticketsValidated), texts)
  return (
    <div className="flex flex-col gap-2">
      <StatStrip
        aria-label={S.label}
        items={[
          { id: "total", label: S.total, value: stats.total, coverage: rate(stats.total) },
          { id: "attributable", label: S.attributable, value: stats.attributable, coverage: rate(stats.attributable) },
          { id: "process", label: S.process, value: stats.process, coverage: rate(stats.process) },
          { id: "resolved", label: S.resolved, value: stats.resolved },
          { id: "open", label: S.open, value: stats.stillOpen },
        ]}
      />
      {stats.lowConfidence || stats.avgDaysToResolve !== null ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary">
          {stats.lowConfidence ? (
            <span className="flex items-center gap-1.5">
              <StatusPill severity="neutral" label={S.lowConfidence} />
              <span>{fill(labels.devReturns.summary.lowConfidenceHelp, { min: DEV_RETURN_MIN_SAMPLE })}</span>
            </span>
          ) : null}
          {stats.avgDaysToResolve !== null ? <span>{plural(S.avgDays, stats.avgDaysToResolve, { count: decimal.format(stats.avgDaysToResolve) })}</span> : null}
        </p>
      ) : null}
    </div>
  )
}
