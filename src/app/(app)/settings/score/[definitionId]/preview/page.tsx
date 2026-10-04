import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { CrumbLabel } from "@/components/shell/crumb-label"
import { Section } from "@/components/ui/section"
import { SegmentedBar } from "@/components/ui/segmented-bar"
import { enumLabel, fill, labels } from "@/lib/labels"
import { WEIGHT_TOTAL, weightSum } from "@/lib/score-composition"
import { requireUser } from "@/server/access"
import { getScoreDefinition } from "@/server/queries/score"

const P = labels.settings.score.preview
const D = labels.settings.score.detail

export const metadata: Metadata = {
  title: `${P.title} · ${labels.app.name}`,
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })

/**
 * Pré-visualização de uma definição de score: a COMPOSIÇÃO — quais métricas
 * entram, com que peso, em que direção e em que faixa. Documentação viva da
 * fórmula, não execução dela: esta página não lê MetricResult nem ScoreResult
 * de ninguém e não produz número de desempenho.
 */
export default async function ScorePreviewPage({ params }: { params: Promise<{ definitionId: string }> }) {
  const { definitionId } = await params
  const user = await requireUser()
  const data = await getScoreDefinition(user, definitionId)
  if (!data) notFound()
  const d = data.definition
  const sum = weightSum(d.components)

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <CrumbLabel segment={d.id} label={fill(labels.settings.score.versionLabel, { version: d.version })} />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-ink">{P.title}</h2>
        <p className="text-sm text-ink-secondary">{fill(P.subtitle, { name: d.name, version: d.version })}</p>
        <p className="mt-2 max-w-3xl text-sm text-ink-secondary">{P.direction}</p>
        <p className="mt-1 text-xs font-medium text-ink">{P.notCalculated}</p>
      </div>

      {d.components.length === 0 ? (
        <p className="text-sm text-ink-secondary">{P.empty}</p>
      ) : (
        <>
          <Section title={P.composition}>
            <SegmentedBar
              label={fill(P.compositionLabel, { parts: d.components.map((c) => `${c.label} ${fmt(c.weight)}%`).join(", ") })}
              segments={d.components.map((c) => ({ id: c.metricDefinitionId, label: c.label, value: c.weight }))}
            />
            {sum !== WEIGHT_TOTAL ? <p className="text-xs text-attention">{fill(P.incomplete, { sum: fmt(sum) })}</p> : null}
          </Section>

          <Section title={D.components} count={d.components.length}>
            <dl className="flex flex-col">
              {d.components.map((c) => (
                <div
                  key={c.metricDefinitionId}
                  className="grid gap-x-6 gap-y-0.5 border-b border-line py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_140px_80px_200px]"
                >
                  <dt className="text-sm text-ink">
                    {c.label} <span className="font-mono text-2xs text-ink-secondary">{c.key}</span>
                  </dt>
                  <dd className="text-sm text-ink-secondary">{enumLabel("metricDirection", c.direction)}</dd>
                  <dd className="font-mono text-sm text-ink sm:text-right">{fmt(c.weight)}%</dd>
                  <dd className="text-sm text-ink-secondary">
                    {fill(D.rangeText, { min: fmt(c.normalizationMin), max: fmt(c.normalizationMax) })} {c.unit ?? ""}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        </>
      )}

      <Section title={P.how}>
        <ol className="flex max-w-3xl list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-secondary">
          {P.howLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </Section>

      <Link href={`/settings/score/${d.id}`} className="text-sm text-accent hover:underline">
        ← {P.edit}
      </Link>
    </div>
  )
}
