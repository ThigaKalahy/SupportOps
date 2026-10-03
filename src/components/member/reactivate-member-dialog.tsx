"use client"

import * as React from "react"

import { reactivateMember } from "@/actions/members"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { fill, labels } from "@/lib/labels"

const L = labels.team.reactivateDialog

/**
 * Ação do cabeçalho de uma pessoa desativada (só para quem escreve): reativar,
 * com motivo — é evento de carreira e entra na timeline.
 */
export function ReactivateMemberButton({ member }: { member: { id: string; preferredName: string } }) {
  const toast = useToast()
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (open) {
      setReason("")
      setError(null)
    }
  }, [open])

  function confirm(event: React.FormEvent) {
    event.preventDefault()
    if (reason.trim().length < 3) return setError(labels.validation.reasonRequired)
    startTransition(async () => {
      const result = await reactivateMember({ id: member.id, reason })
      if (!result.ok) return setError(result.fieldErrors?.reason ?? result.error)
      toast.show(labels.toast.memberReactivated)
      setOpen(false)
    })
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {labels.team.reactivate}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            ref.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{fill(L.title, { name: member.preferredName })}</DialogTitle>
            <DialogDescription>{L.description}</DialogDescription>
          </DialogHeader>
          <form onSubmit={confirm} className="flex flex-col gap-4" noValidate>
            <FieldGroup label={L.reason} error={error ?? undefined} required>
              <Textarea ref={ref} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                {labels.common.cancel}
              </Button>
              <Button type="submit" loading={pending}>
                {L.confirm}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
