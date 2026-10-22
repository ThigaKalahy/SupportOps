"use client"

import * as React from "react"

import { changePasswordAction } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { labels } from "@/lib/labels"
import { changePasswordSchema } from "@/lib/validators/auth"

const A = labels.account

type Fields = "current" | "next" | "confirm"
const EMPTY: Record<Fields, string> = { current: "", next: "", confirm: "" }

/**
 * C18: "Alterar senha" no portal — a pessoa troca a senha aleatória do convite por uma
 * dela. Modal do app (Esc fecha, foco preso e devolvido). Sucesso vira uma linha de
 * status abaixo do cabeçalho; a sessão aberta continua.
 */
export function ChangePasswordButton() {
  const [open, setOpen] = React.useState(false)
  const [values, setValues] = React.useState(EMPTY)
  const [errors, setErrors] = React.useState<Partial<Record<Fields, string>>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  function openDialog() {
    setValues(EMPTY)
    setErrors({})
    setError(null)
    setDone(false)
    setOpen(true)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = changePasswordSchema.safeParse(values)
    if (!parsed.success) {
      const next: Partial<Record<Fields, string>> = {}
      for (const issue of parsed.error.issues) next[issue.path[0] as Fields] ??= issue.message
      setErrors(next)
      return
    }
    setErrors({})
    setError(null)
    startTransition(async () => {
      const result = await changePasswordAction(parsed.data)
      if (result.ok) {
        setOpen(false)
        setDone(true)
        return
      }
      if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) setErrors(result.fieldErrors)
      else setError(result.error)
    })
  }

  const field = (key: Fields, label: string, autoComplete: string, help?: string) => (
    <FieldGroup label={label} help={help} error={errors[key]}>
      <Input
        type="password"
        value={values[key]}
        maxLength={200}
        autoComplete={autoComplete}
        className="min-h-11"
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
    </FieldGroup>
  )

  return (
    <>
      <Button type="button" variant="secondary" className="min-h-11" onClick={openDialog}>
        {A.changePassword}
      </Button>
      {done ? (
        <p role="status" className="order-last basis-full text-right text-xs text-calm">
          {A.done}
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{A.title}</DialogTitle>
            <DialogDescription>{A.description}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            {field("current", A.current, "current-password")}
            {field("next", A.next, "new-password", A.nextHelp)}
            {field("confirm", A.confirm, "new-password")}
            {error ? (
              <p role="alert" className="text-sm text-overdue">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="secondary" className="min-h-11" disabled={pending} onClick={() => setOpen(false)}>
                {A.cancel}
              </Button>
              <Button type="submit" className="min-h-11" loading={pending}>
                {A.submit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
