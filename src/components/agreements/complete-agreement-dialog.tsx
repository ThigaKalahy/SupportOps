"use client"

import * as React from "react"

import { completeAgreement } from "@/actions/agreements"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { labels } from "@/lib/labels"

const L = labels.agreements.completeDialog

/**
 * Concluir combinado: o resultado em uma linha (opcional, mas incentivado).
 * Enter confirma. Grava completedAt, status DONE e a linha AGREEMENT_DONE.
 */
export function CompleteAgreementDialog({
  agreement,
  onOpenChange,
}: {
  /** Combinado a concluir; null fecha o dialog. */
  agreement: { id: string; title: string } | null
  onOpenChange: (open: boolean) => void
}) {
  const [outcome, setOutcome] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (agreement) {
      setOutcome("")
      setError(null)
    }
  }, [agreement])

  function confirm(event: React.FormEvent) {
    event.preventDefault()
    if (!agreement) return
    setError(null)
    startTransition(async () => {
      const result = await completeAgreement({ id: agreement.id, outcome })
      if (result.ok) onOpenChange(false)
      else setError(result.error)
    })
  }

  return (
    <Dialog open={agreement !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{L.title}</DialogTitle>
          <DialogDescription>{L.description}</DialogDescription>
        </DialogHeader>
        {agreement ? <p className="text-sm font-medium text-ink">{agreement.title}</p> : null}
        <form onSubmit={confirm} className="flex flex-col gap-4" noValidate>
          <FieldGroup label={L.outcome} optional>
            <Input
              ref={inputRef}
              value={outcome}
              maxLength={300}
              autoComplete="off"
              placeholder={L.outcomePlaceholder}
              onChange={(e) => setOutcome(e.target.value)}
            />
          </FieldGroup>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {L.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
