"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { openDaily, takeOverDaily } from "@/actions/dailies"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { labels } from "@/lib/labels"

const L = labels.dailies.opening

/**
 * P26 — passo zero de /dailies/new: "Registrar nova daily" abre a daily (DRAFT), captura
 * o que o time relatou e propôs e trava o portal. Também o "Assumir" de uma daily aberta
 * por outra pessoa. Depois de cada um, a página recarrega no servidor e mostra o formulário.
 */
export function OpenDailyButton({ date }: { date: string }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await openDaily({ date })
            if (!result.ok) return setError(result.error)
            router.refresh()
          })
        }
      >
        {L.open}
      </Button>
      <FormError message={error} />
    </div>
  )
}

export function TakeOverDailyButton({ id }: { id: string }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await takeOverDaily({ id })
            if (!result.ok) return setError(result.error)
            router.refresh()
          })
        }
      >
        {L.takeOver}
      </Button>
      <FormError message={error} />
    </div>
  )
}
