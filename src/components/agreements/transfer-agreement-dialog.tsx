"use client"

import * as React from "react"

import { transferAgreement } from "@/actions/agreements"
import { useQuickAgreement } from "@/components/forms/quick-agreement"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { formatDate, todayBusinessDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { transferAgreementSchema } from "@/lib/validators/agreement"

const L = labels.agreements.transferDialog

export interface TransferTarget {
  id: string
  title: string
  member: { id: string; preferredName: string }
  dueDate: Date
}

/**
 * Transferir combinado para outra pessoa (C4) — o caso das férias. O mesmo
 * combinado muda de dono com motivo obrigatório; o prazo não muda (D17) e, se já
 * venceu, a tela avisa que chega vencido. As pessoas vêm do shell (só quem escreve).
 */
export function TransferAgreementDialog({
  agreement,
  onOpenChange,
}: {
  agreement: TransferTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const members = (useQuickAgreement()?.members ?? []).filter((m) => m.id !== agreement?.member.id)
  const [memberId, setMemberId] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const toast = useToast()

  React.useEffect(() => {
    if (agreement) {
      setMemberId("")
      setReason("")
      setErrors({})
      setError(null)
    }
  }, [agreement])

  const overdue = agreement ? agreement.dueDate.getTime() < todayBusinessDate().getTime() : false

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!agreement) return
    const parsed = transferAgreementSchema.safeParse({ id: agreement.id, memberId, reason })
    if (!parsed.success) {
      return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
    }
    setErrors({})
    setError(null)
    startTransition(async () => {
      const result = await transferAgreement(parsed.data)
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        return setError(result.error)
      }
      const to = members.find((m) => m.id === memberId)
      toast.show(fill(L.done, { name: to?.preferredName ?? "" }), { tone: "calm" })
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={agreement !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{L.title}</DialogTitle>
          <DialogDescription>{agreement ? fill(L.description, { name: agreement.member.preferredName }) : null}</DialogDescription>
        </DialogHeader>
        {agreement ? <p className="text-sm font-medium text-ink">{agreement.title}</p> : null}
        {members.length === 0 ? (
          <p className="text-sm text-ink-secondary">{L.noOne}</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <FieldGroup label={L.to} required error={errors.memberId}>
              {(control) => (
                <Select value={memberId} onValueChange={setMemberId}>
                  <SelectTrigger {...control} className="w-full sm:w-64">
                    <SelectValue placeholder={L.toPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.preferredName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            <FieldGroup label={L.reason} required error={errors.reason}>
              <Input
                value={reason}
                maxLength={300}
                autoComplete="off"
                placeholder={L.reasonPlaceholder}
                onChange={(e) => setReason(e.target.value)}
              />
            </FieldGroup>
            {agreement && overdue ? (
              <p className="rounded-sm border border-line bg-attention-wash px-3 py-2 text-xs text-attention">
                {fill(L.overdueHint, { date: formatDate(agreement.dueDate, "business") })}
              </p>
            ) : null}
            {error && !errors.memberId && !errors.reason ? (
              <p role="alert" className="text-sm text-overdue">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
                {labels.common.cancel}
              </Button>
              <Button type="submit" loading={pending}>
                {L.confirm}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
