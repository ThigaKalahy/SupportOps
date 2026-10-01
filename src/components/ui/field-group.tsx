"use client"

import * as React from "react"

import { Label } from "@/components/ui/label"
import { labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

type ControlProps = {
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean | "true" | "false"
  "aria-required"?: boolean | "true" | "false"
}

/**
 * Rótulo + campo + ajuda, com espaçamento fixo. Liga o rótulo ao campo e
 * injeta id, aria-describedby e aria-invalid no controle filho.
 * Quando há erro, a mensagem de erro substitui a ajuda.
 */
function FieldGroup({
  label,
  help,
  error,
  required = false,
  optional = false,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: string
  help?: string
  error?: string
  required?: boolean
  optional?: boolean
  children: React.ReactElement<ControlProps>
}) {
  const generatedId = React.useId()
  const controlId = children.props.id ?? `${generatedId}-control`
  const messageId = `${generatedId}-message`
  const message = error ?? help

  const control = React.cloneElement(children, {
    id: controlId,
    "aria-describedby": message ? messageId : undefined,
    "aria-invalid": error ? true : children.props["aria-invalid"],
    "aria-required": required || undefined,
  })

  return (
    <div data-slot="field-group" className={cn("flex flex-col gap-1.5", className)} {...props}>
      <Label htmlFor={controlId} className="gap-1">
        {label}
        {optional ? <span className="font-normal text-ink-tertiary">({labels.common.optional})</span> : null}
      </Label>
      {control}
      {message ? (
        <p id={messageId} className={cn("text-xs", error ? "text-overdue" : "text-ink-secondary")}>
          {message}
        </p>
      ) : null}
    </div>
  )
}

export { FieldGroup }
