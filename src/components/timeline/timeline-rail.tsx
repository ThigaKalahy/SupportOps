import * as React from "react"

import type { Severity } from "@/lib/severity"
import { cn } from "@/lib/utils"

/**
 * A calha temporal — elemento assinatura do produto (DESIGN.md). Medidas:
 *
 * - Calha de 96px (24px abaixo de 768px, com a data no topo da entrada): data em mono na margem esquerda, régua de 1px em --line
 *   centralizada (x = 48px), marcador de 7px sobre a régua.
 * - A régua é desenhada em cada linha (mês e evento), de cima a baixo: as
 *   linhas são contíguas, então ela corre contínua por toda a coluna, inclusive
 *   sob o cabeçalho de mês que gruda no topo.
 * - Pendência (vencido ou exige ação): um traço de 4px na cor do degrau sangra
 *   da régua para dentro da calha em todo o trecho do evento. É o único lugar do
 *   produto que quebra a grade, de propósito.
 * - Evento sem pendência não perturba a calha: marcador em --line-strong.
 *
 * Sem animação de entrada, sem stagger, sem fade.
 */

/** Calha de 96px; abaixo de 768px, só a régua (24px) — a data sobe para o topo da entrada. */
export const GUTTER = "grid-cols-[24px_minmax(0,1fr)] md:grid-cols-[96px_minmax(0,1fr)]"

const tones: Record<Severity, { text: string; bg: string }> = {
  calm: { text: "text-calm", bg: "bg-calm" },
  attention: { text: "text-attention", bg: "bg-attention" },
  overdue: { text: "text-overdue", bg: "bg-overdue" },
  neutral: { text: "text-line-strong", bg: "bg-line-strong" },
}

function tone(severity: Severity, strong: boolean, pending: boolean) {
  if (!pending) return tones.neutral
  if (severity === "attention" && strong) return { text: "text-attention-strong", bg: "bg-attention-strong" }
  return tones[severity]
}

/** Régua de 1px, centralizada na calha. */
function Rule() {
  return <span aria-hidden className="absolute inset-y-0 left-3 w-px bg-line md:left-12" />
}

/** Cabeçalho de mês: discreto e grudado no topo (abaixo da barra de contexto de 48px). */
export function TimelineMonth({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label}>
      <h2 className={cn("sticky top-12 z-10 grid bg-canvas", GUTTER)}>
        <span className="relative h-8">
          <Rule />
        </span>
        <span className="flex h-8 items-center font-mono text-2xs font-medium tracking-label text-ink-secondary uppercase">
          {label}
        </span>
      </h2>
      <ol>{children}</ol>
    </section>
  )
}

/**
 * Um evento na calha. `date` é o texto curto já formatado (DD/MM) e
 * `dateTitle` a data completa. `pending` liga a cor do marcador e o traço que
 * sangra; sem ele o marcador fica em --line-strong.
 */
export function TimelineEntry({
  date,
  dateTime,
  dateTitle,
  severity = "neutral",
  strong = false,
  pending = false,
  children,
  className,
}: {
  date: string
  dateTime: string
  dateTitle: string
  severity?: Severity
  strong?: boolean
  pending?: boolean
  children: React.ReactNode
  className?: string
}) {
  const color = tone(severity, strong, pending)
  return (
    <li data-slot="timeline-entry" data-pending={pending || undefined} className={cn("grid", GUTTER, className)}>
      <div className="relative">
        <Rule />
        {pending ? <span aria-hidden className={cn("absolute inset-y-0 left-2.5 w-[5px] md:left-11", color.bg)} /> : null}
        <svg
          aria-hidden
          viewBox="0 0 7 7"
          width={7}
          height={7}
          className={cn("absolute top-[5px] left-[9px] md:left-[45px]", color.text)}
        >
          <circle cx={3.5} cy={3.5} r={3.5} fill="currentColor" />
        </svg>
        <time dateTime={dateTime} title={dateTitle} className="hidden font-mono text-xs leading-4 text-ink-secondary md:block">
          {date}
        </time>
      </div>
      <div className="min-w-0 pb-6">
        {/* < 768px: a data sai da calha e abre a entrada. */}
        <time dateTime={dateTime} title={dateTitle} className="mb-1 block font-mono text-xs leading-4 text-ink-secondary md:hidden">
          {date}
        </time>
        {children}
      </div>
    </li>
  )
}
