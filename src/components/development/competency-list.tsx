import * as React from "react"
import Link from "next/link"

import { LevelBar } from "@/components/ui/level-bar"
import { MetaLabel } from "@/components/ui/meta-label"
import { Section } from "@/components/ui/section"
import { formatDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import type { CompetencyView } from "@/server/queries/development"

const C = labels.development.competencies

/**
 * Competências avaliadas da pessoa: nível atual contra o esperado da
 * senioridade atual e da próxima, em barras de 4px. Agrupadas por categoria,
 * em ordem alfabética — nunca da "melhor" para a "pior".
 */
export function CompetencyList({
  competencies,
  seniority,
  matrixEmpty,
  canWrite,
}: {
  competencies: CompetencyView[]
  seniority: { current: string | null; next: string | null }
  matrixEmpty: boolean
  canWrite: boolean
}) {
  const assessed = competencies.filter((c) => c.level !== null).length
  const categories = [...new Set(competencies.map((c) => c.category ?? ""))]

  return (
    <Section title={C.title} count={assessed}>
      <p className="-mt-2 text-xs text-ink-secondary">{C.direction}</p>
      {matrixEmpty ? (
        <p className="text-xs text-ink-secondary">
          {C.matrixEmpty}{" "}
          {canWrite ? (
            <Link href="/settings/competency-matrix" className="text-accent hover:underline">
              {C.matrixLink}
            </Link>
          ) : null}
        </p>
      ) : null}
      {assessed === 0 ? <p className="text-sm text-ink-tertiary">{C.empty}. {C.emptyDirection}</p> : null}
      <div className="flex flex-col gap-4">
        {categories.map((category) => (
          <div key={category} className="flex flex-col gap-1">
            {category ? <MetaLabel>{category}</MetaLabel> : null}
            <ul className="flex flex-col">
              {competencies
                .filter((c) => (c.category ?? "") === category)
                .map((c) => {
                  const expectations = [
                    seniority.current && c.expectedCurrent ? fill(C.expected, { seniority: seniority.current, level: c.expectedCurrent }) : null,
                    seniority.next && c.expectedNext ? fill(C.expected, { seniority: seniority.next, level: c.expectedNext }) : null,
                  ].filter(Boolean)
                  const levelText = c.level === null ? C.notAssessed : fill(C.level, { level: c.level })
                  return (
                    <li
                      key={c.id}
                      className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-line py-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_128px_minmax(0,1.6fr)] md:items-center"
                    >
                      <span className="min-w-0 text-sm text-ink">{c.name}</span>
                      <LevelBar
                        level={c.level}
                        expected={c.expectedCurrent}
                        next={c.expectedNext}
                        label={[levelText, ...expectations].join(" · ")}
                      />
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-secondary">
                        <span className={c.level === null ? "text-ink-tertiary" : "font-mono text-ink"}>
                          {c.level === null ? C.notAssessed : c.level}
                        </span>
                        {expectations.length ? <span>· {expectations.join(" · ")}</span> : <span className="text-ink-tertiary">· {C.noExpectation}</span>}
                        {c.assessedAt ? (
                          <span className="basis-full text-ink-tertiary">{fill(C.assessedAt, { date: formatDate(c.assessedAt, "business") })}</span>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  )
}
