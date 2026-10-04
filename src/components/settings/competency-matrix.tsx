"use client"

import * as React from "react"

import { setExpectation } from "@/actions/development"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fill, labels } from "@/lib/labels"

const M = labels.development.matrix
const NONE = "none"
const LEVELS = [1, 2, 3, 4, 5] as const

interface Matrix {
  competencies: { id: string; name: string; category: string | null }[]
  seniorities: { id: string; label: string; expected: Record<string, number> }[]
}

/**
 * Matriz de níveis esperados: competências ativas × senioridades. Cada célula
 * grava ao escolher (auditada); "Não definido" limpa. Começa vazia — quem
 * define o esperado de cada nível é o gestor.
 */
export function CompetencyMatrix({ matrix, canWrite }: { matrix: Matrix; canWrite: boolean }) {
  const [cells, setCells] = React.useState(() =>
    Object.fromEntries(matrix.seniorities.flatMap((s) => Object.entries(s.expected).map(([c, level]) => [`${c}:${s.id}`, level]))),
  )
  const [error, setError] = React.useState<string | null>(null)
  const [, startTransition] = React.useTransition()

  function change(competencyId: string, seniorityId: string, value: string) {
    const key = `${competencyId}:${seniorityId}`
    const level = value === NONE ? null : Number(value)
    const previous = cells[key]
    setCells((c) => {
      const next = { ...c }
      if (level === null) delete next[key]
      else next[key] = level
      return next
    })
    setError(null)
    startTransition(async () => {
      const result = await setExpectation({ competencyId, seniorityId, expectedLevel: level })
      if (!result.ok) {
        setError(result.error)
        setCells((c) => ({ ...c, ...(previous === undefined ? {} : { [key]: previous }) }))
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-sm text-ink-secondary">{M.direction}</p>
      {canWrite ? null : <p className="text-xs text-ink-secondary">{labels.settings.readOnly}</p>}
      {error ? (
        <p role="alert" className="rounded-sm border border-overdue bg-overdue-wash px-3 py-2 text-sm text-overdue">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">{M.tab}</caption>
          <thead>
            <tr className="border-b border-line bg-surface-sunken">
              <th scope="col" className="px-3 py-2 text-left font-mono text-2xs font-medium tracking-wide text-ink-secondary uppercase">
                {M.competency}
              </th>
              {matrix.seniorities.map((s) => (
                <th key={s.id} scope="col" className="w-44 px-3 py-2 text-left font-mono text-2xs font-medium tracking-wide text-ink-secondary uppercase">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.competencies.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  <span className="text-ink">{c.name}</span>
                  {c.category ? <span className="text-xs text-ink-secondary"> · {c.category}</span> : null}
                </th>
                {matrix.seniorities.map((s) => {
                  const value = cells[`${c.id}:${s.id}`]
                  return (
                    <td key={s.id} className="px-3 py-1.5">
                      {canWrite ? (
                        <Select value={value ? String(value) : NONE} onValueChange={(v) => change(c.id, s.id, v)}>
                          <SelectTrigger
                            size="sm"
                            aria-label={fill(M.cellLabel, { competency: c.name, seniority: s.label })}
                            className="w-36 min-w-0"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>{M.none}</SelectItem>
                            {LEVELS.map((l) => (
                              <SelectItem key={l} value={String(l)}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={value ? "font-mono text-ink" : "text-ink-secondary"}>{value ?? M.empty}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
