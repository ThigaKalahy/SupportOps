"use client"

import Link from "next/link"
import * as React from "react"

import { CompleteAgreementDialog } from "@/components/agreements/complete-agreement-dialog"
import { DueCell } from "@/components/agreements/agreements-table"
import { Button } from "@/components/ui/button"
import { Section } from "@/components/ui/section"
import { labels } from "@/lib/labels"
import type { MyAgreements as Data } from "@/server/queries/agreements"

const L = labels.managerSeats

/**
 * C25 — "Seus combinados" na home: os combinados em aberto do gestor logado (lugar de gestor
 * ou, se ele também é pessoa do time, os dele como pessoa), prazo mais próximo primeiro, com
 * "Concluir" no próprio bloco. Fora da lista de alertas: o combinado do gestor não é
 * "quem precisa da sua atenção".
 */
export function MyAgreements({ data, canWrite }: { data: Data; canWrite: boolean }) {
  const [completing, setCompleting] = React.useState<{ id: string; title: string } | null>(null)
  return (
    <Section title={L.homeTitle} count={data.total}>
      {data.rows.length === 0 ? (
        <p className="text-sm text-ink-secondary">{L.homeEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {data.rows.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-2">
              <div className="flex min-w-0 flex-col gap-1">
                <Link href={`/agreements/${a.id}`} className="truncate text-sm text-ink hover:underline" title={a.title}>
                  {a.title}
                </Link>
                <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-ink-secondary">
                  <DueCell row={a} />
                  {a.central ? <span className="truncate">{a.central}</span> : null}
                </span>
              </div>
              {canWrite ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setCompleting({ id: a.id, title: a.title })}>
                  {L.complete}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {data.total > data.rows.length ? (
        <Link href={`/agreements?member=${data.memberId}&view=open`} className="text-xs text-ink-secondary hover:text-ink hover:underline">
          {L.homeMore}
        </Link>
      ) : null}
      <CompleteAgreementDialog agreement={completing} onOpenChange={(open) => !open && setCompleting(null)} />
    </Section>
  )
}
