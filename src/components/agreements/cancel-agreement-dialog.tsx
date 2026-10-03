"use client"

import * as React from "react"

import { cancelAgreement } from "@/actions/agreements"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { labels } from "@/lib/labels"
import { cancelAgreementSchema } from "@/lib/validators/agreement"

const L = labels.agreements.cancelDialog

/**
 * Cancelar combinado fora da daily, com motivo obrigatório. Ação destrutiva:
 * botão em cor de perigo, que nunca é o padrão — Enter no campo não cancela.
 */
export function CancelAgreementDialog({
  agreement,
  onOpenChange,
}: {
  /** Combinado a cancelar; null fecha o dialog. */
  agreement: { id: string; title: string } | null
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const toast = useToast()
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (agreement) {
      setReason("")
      setError(null)
    }
  }, [agreement])

  function confirm() {
    if (!agreement) return
    const parsed = cancelAgreementSchema.safeParse({ id: agreement.id, reason })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? labels.validation.generic)
      return inputRef.current?.focus()
    }
    setError(null)
    startTransition(async () => {
      const result = await cancelAgreement(parsed.data)
      if (result.ok) {
        toast.show(labels.toast.agreementCancelled)
        onOpenChange(false)
      }
      else setError(result.fieldErrors?.reason ?? result.error)
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
        <div className="flex flex-col gap-4">
          <FieldGroup label={L.reason} required error={error ?? undefined}>
            <Input
              ref={inputRef}
              value={reason}
              maxLength={300}
              autoComplete="off"
              placeholder={L.reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault()
              }}
            />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {L.keep}
            </Button>
            <Button type="button" variant="destructive" loading={pending} onClick={confirm}>
              {L.confirm}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
