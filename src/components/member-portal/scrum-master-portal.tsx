"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { spinRoulette } from "@/actions/member-portal"
import { Button } from "@/components/ui/button"
import { Roulette } from "@/components/ui/roulette"
import { Section } from "@/components/ui/section"
import { labels } from "@/lib/labels"
import type { MyScrumMaster } from "@/server/queries/member-portal"

const S = labels.scrumMaster

/**
 * C19 — scrum master de hoje no portal (mobile-first, D45). Com a roleta do time, das 09h
 * às 10h, qualquer pessoa gira; o resultado vale para todos. Quem foi sorteado ganha
 * "Conduzir a daily". Sem sorteio e fora da janela, só o aviso — nunca botão desabilitado.
 */
export function ScrumMasterPortal({ data }: { data: MyScrumMaster }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [spin, setSpin] = React.useState<{ name: string; candidates: string[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [settled, setSettled] = React.useState(false)
  const name = spin?.name ?? data.name

  function go() {
    setError(null)
    startTransition(async () => {
      const result = await spinRoulette()
      if (!result.ok) return setError(result.error)
      setSpin({ name: result.name, candidates: result.candidates })
    })
  }

  // Sem roleta e sem escolha (fim de semana, feriado, time vazio): nada a mostrar.
  if (!name && !data.roulette) return null

  return (
    <Section title={S.title}>
      <Roulette
        names={spin?.candidates ?? []}
        result={name}
        animate={spin !== null}
        idle={data.canSpin ? S.rouletteLabel : S.none}
        onSettled={() => {
          setSettled(true)
          router.refresh()
        }}
      />
      {!name && !data.canSpin ? <p className="text-xs text-ink-secondary">{S.windowHint}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-overdue">
          {error}
        </p>
      ) : null}
      {data.canSpin && !spin ? (
        <Button type="button" className="min-h-11" loading={pending} onClick={go}>
          {pending ? S.spinning : S.spin}
        </Button>
      ) : null}
      {data.isMe && (!spin || settled) ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">{S.youConduct}</p>
          <Button asChild className="min-h-11">
            <Link href="/me/daily">{S.conduct}</Link>
          </Button>
        </div>
      ) : null}
    </Section>
  )
}
