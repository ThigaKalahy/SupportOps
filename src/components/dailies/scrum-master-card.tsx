"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { drawScrumMaster, skipScrumMaster } from "@/actions/dailies"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Roulette } from "@/components/ui/roulette"
import { Section } from "@/components/ui/section"
import { fill, labels } from "@/lib/labels"
import type { ScrumMasterToday } from "@/server/queries/dailies"

const S = labels.scrumMaster

/**
 * C19 — scrum master de hoje, do lado do gestor (home e /dailies/new). O gestor gira a
 * roleta (ou sorteia, sem o módulo) a qualquer hora e, se o sorteado não puder, sorteia de
 * novo — com confirmação no app. O VIEWER só vê o nome.
 */
export function ScrumMasterCard({ data, canWrite }: { data: ScrumMasterToday; canWrite: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [spin, setSpin] = React.useState<{ name: string; candidates: string[]; n: number } | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const current = spin?.name ?? data.current?.name ?? null

  function run(action: typeof drawScrumMaster) {
    setError(null)
    setConfirming(false)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) return setError(result.error)
      // `n` remonta a roleta: girar de novo e cair no mesmo nome também anima.
      setSpin((last) => ({ name: result.name, candidates: result.candidates, n: (last?.n ?? 0) + 1 }))
    })
  }

  return (
    <Section title={S.title}>
      <Roulette
        key={spin?.n ?? 0}
        names={spin?.candidates ?? []}
        result={current}
        animate={spin !== null}
        idle={data.roulette ? S.rouletteLabel : S.none}
        onSettled={() => router.refresh()}
      />
      {data.current?.isMe && (!spin || spin.name === data.current.name) ? <p className="text-sm font-semibold text-ink">{S.youConduct}</p> : null}
      <div className="flex flex-col gap-1 text-xs text-ink-secondary">
        {data.current && data.round ? (
          <p>{fill(S.round, { round: data.current.round, done: data.round.done, total: data.round.total })}</p>
        ) : null}
        {data.current && !data.current.hasPortal ? <p>{fill(S.noPortal, { name: data.current.name })}</p> : null}
        {data.skipped.length ? <p>{fill(S.skipped, { names: data.skipped.join(", ") })}</p> : null}
        {!data.roulette ? <p>{S.auto}</p> : !current ? <p>{S.windowHint}</p> : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-overdue">
          {error}
        </p>
      ) : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          {current ? (
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
              {S.redraw}
            </Button>
          ) : (
            <Button type="button" size="sm" loading={pending} onClick={() => run(drawScrumMaster)}>
              {pending ? S.spinning : data.roulette ? S.spin : S.draw}
            </Button>
          )}
        </div>
      ) : null}

      <Dialog open={confirming} onOpenChange={(open) => !pending && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{S.redrawTitle}</DialogTitle>
            <DialogDescription>{fill(S.redrawDescription, { name: current ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              {fill(S.keep, { name: current ?? "" })}
            </Button>
            <Button type="button" loading={pending} onClick={() => run(skipScrumMaster)}>
              {S.redrawConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  )
}
