"use client"

import * as React from "react"

import { loginAction, type LoginState } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { labels } from "@/lib/labels"

const initialState: LoginState = { error: null }

export function LoginForm() {
  const [state, formAction, pending] = React.useActionState(loginAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FieldGroup label={labels.auth.email}>
        <Input name="email" type="email" autoComplete="username" required autoFocus />
      </FieldGroup>
      <FieldGroup label={labels.auth.password}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </FieldGroup>
      {state.error ? (
        <p role="alert" className="text-xs text-overdue">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="w-full">
        {labels.auth.submit}
      </Button>
    </form>
  )
}
