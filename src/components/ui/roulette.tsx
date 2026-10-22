"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Roleta (C19): os nomes passam numa janela única e desaceleram até parar no sorteado.
 * O resultado vem pronto do servidor — a animação só mostra, nunca decide. Sem cor nem
 * decoração além dos tokens; com `prefers-reduced-motion`, para direto no resultado.
 * Só o resultado final é anunciado (aria-live); a passagem dos nomes é decorativa.
 */
export function Roulette({
  names,
  result,
  idle,
  animate = false,
  onSettled,
  className,
}: {
  /** Quem concorre (a passagem embaralha estes nomes). */
  names: string[]
  /** O sorteado. Ao mudar de null para um nome, a roleta gira e para nele. */
  result: string | null
  /** Texto parado, antes de girar. */
  idle: string
  /** Gira até o resultado (depois de um sorteio agora). Falso: mostra o resultado parado (página aberta depois). */
  animate?: boolean
  onSettled?: () => void
  className?: string
}) {
  const [shown, setShown] = React.useState<string | null>(result)
  const [spinning, setSpinning] = React.useState(false)
  const settled = React.useRef(onSettled)
  React.useEffect(() => {
    settled.current = onSettled
  }, [onSettled])

  React.useEffect(() => {
    if (!result) return setShown(null)
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const pool = names.length > 1 ? names : [result]
    if (!animate || reduce || pool.length < 2) {
      setShown(result)
      if (animate) settled.current?.()
      return
    }
    setSpinning(true)
    const steps = 24
    const timers: number[] = []
    let elapsed = 0
    let last = ""
    for (let i = 0; i < steps; i++) {
      // Desacelera: de 45ms a ~320ms entre um nome e outro.
      elapsed += 45 + Math.round(275 * (i / steps) ** 2)
      const final = i === steps - 1
      let name = result
      if (!final) {
        do name = pool[Math.floor(Math.random() * pool.length)]!
        while (name === last && pool.length > 1)
      }
      last = name
      timers.push(
        window.setTimeout(() => {
          setShown(name)
          if (final) {
            setSpinning(false)
            settled.current?.()
          }
        }, elapsed),
      )
    }
    return () => timers.forEach((t) => window.clearTimeout(t))
    // Gira de novo só quando muda o resultado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  return (
    <div
      data-slot="roulette"
      className={cn(
        "flex min-h-14 items-center justify-center rounded-lg border border-line bg-surface px-4 py-3 text-center",
        spinning ? "border-accent" : null,
        className,
      )}
    >
      <span aria-hidden={spinning || undefined} className={cn("truncate text-lg font-semibold", shown ? "text-ink" : "text-sm font-normal text-ink-secondary")}>
        {shown ?? idle}
      </span>
      <span className="sr-only" aria-live="polite">
        {animate && !spinning && shown ? shown : ""}
      </span>
    </div>
  )
}
