"use client"

import * as React from "react"

import { deactivateMember } from "@/actions/members"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Textarea } from "@/components/ui/textarea"
import { fill, labels } from "@/lib/labels"

const L = labels.team.deactivateDialog

/**
 * Confirmação de desativação. Ação destrutiva: botão em cor de perigo, nunca o
 * padrão — o foco inicial vai para Cancelar. Motivo obrigatório (evento de
 * carreira). Nada é apagado: status INACTIVE + deletedAt (D10).
 */
export function DeactivateMemberDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: { id: string; preferredName: string }
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  const [reason, setReason] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (open) {
      setReason("")
      setError(null)
    }
  }, [open])

  function confirm() {
    if (reason.trim().length < 3) {
      setError(labels.validation.reasonRequired)
      return
    }
    startTransition(async () => {
      const result = await deactivateMember({ id: member.id, reason })
      if (result.ok) onOpenChange(false)
      else setError(result.fieldErrors?.reason ?? result.error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{fill(L.title, { name: member.preferredName })}</DialogTitle>
          <DialogDescription>{L.description}</DialogDescription>
        </DialogHeader>
        <FieldGroup label={L.reason} error={error ?? undefined} required>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FieldGroup>
        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {labels.common.cancel}
          </Button>
          <Button type="button" variant="destructive" onClick={confirm} loading={pending}>
            {L.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
