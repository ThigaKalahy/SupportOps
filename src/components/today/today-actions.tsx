"use client"

import * as React from "react"
import Link from "next/link"

import { FeedbackDialog } from "@/components/forms/feedback-dialog"
import { useQuickAgreement } from "@/components/forms/quick-agreement"
import { OneOnOneDialog } from "@/components/forms/one-on-one-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { labels } from "@/lib/labels"

const A = labels.today.actions
const P = labels.today.pickMember

type Person = { id: string; preferredName: string }
type Form = "oneOnOne" | "feedback"

/**
 * Barra de ações da home: registrar daily, novo combinado, validar
 * prioridade (só com o módulo ligado — D32), registrar 1:1 e dar feedback. Texto curto, sem ícone. 1:1 e
 * feedback perguntam primeiro "com quem?" e abrem o mesmo formulário do perfil.
 */
export function TodayActions({ members, validation }: { members: Person[]; /** Módulo de validação ligado no time (D32). */ validation: boolean }) {
  const quick = useQuickAgreement()
  const [picking, setPicking] = React.useState<Form | null>(null)
  const [open, setOpen] = React.useState<{ form: Form; member: Person } | null>(null)

  return (
    <nav aria-label={labels.today.actionsLabel} className="flex flex-wrap items-center gap-x-1 gap-y-1">
      <Button asChild variant="secondary" size="sm">
        <Link href="/dailies/new">{A.daily}</Link>
      </Button>
      {quick ? (
        <Button variant="ghost" size="sm" onClick={() => quick.open({})}>
          {A.agreement}
        </Button>
      ) : null}
      {validation ? (
        <Button asChild variant="ghost" size="sm">
          <Link href="/priority-validations">{A.validation}</Link>
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" onClick={() => setPicking("oneOnOne")}>
        {A.oneOnOne}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setPicking("feedback")}>
        {A.feedback}
      </Button>

      <PickMemberDialog
        form={picking}
        members={members}
        onOpenChange={(next) => !next && setPicking(null)}
        onPick={(member) => {
          if (picking) setOpen({ form: picking, member })
          setPicking(null)
        }}
      />
      {open?.form === "oneOnOne" ? <OneOnOneDialog open onOpenChange={(next) => !next && setOpen(null)} member={open.member} /> : null}
      {open?.form === "feedback" ? <FeedbackDialog open onOpenChange={(next) => !next && setOpen(null)} member={open.member} /> : null}
    </nav>
  )
}

function PickMemberDialog({
  form,
  members,
  onOpenChange,
  onPick,
}: {
  form: Form | null
  members: Person[]
  onOpenChange: (open: boolean) => void
  onPick: (member: Person) => void
}) {
  const [memberId, setMemberId] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (form) {
      setMemberId("")
      setError(null)
    }
  }, [form])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const member = members.find((m) => m.id === memberId)
    if (!member) return setError(labels.validation.required)
    onPick(member)
  }

  return (
    <Dialog open={form !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form === "feedback" ? A.feedback : A.oneOnOne}</DialogTitle>
          <DialogDescription>{P.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FieldGroup label={P.label} required error={error ?? undefined}>
            {(control) => (
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger {...control} className="w-full">
                  <SelectValue placeholder={P.placeholder} />
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
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {labels.common.cancel}
            </Button>
            <Button type="submit">{P.next}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
