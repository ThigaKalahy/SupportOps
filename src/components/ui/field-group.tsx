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
 *
 * O filho pode ser um elemento (recebe as props por clone) ou uma função que
 * recebe as props — necessário quando o controle não é um elemento do DOM,
 * como o Select do Radix (as props vão para o SelectTrigger).
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
  children: React.ReactElement<ControlProps> | ((control: Required<Pick<ControlProps, "id">> & ControlProps) => React.ReactNode)
}) {
  const generatedId = React.useId()
  const isRender = typeof children === "function"
  const controlId = (!isRender && children.props.id) || `${generatedId}-control`
  const messageId = `${generatedId}-message`
  // Erro vazio ("") conta como sem erro: a ajuda continua visível.
  const message = error || help
  const controlProps = {
    id: controlId,
    "aria-describedby": message ? messageId : undefined,
    "aria-invalid": error ? true : !isRender ? children.props["aria-invalid"] : undefined,
    "aria-required": required || undefined,
  }

  const control = isRender ? children(controlProps) : React.cloneElement(children, controlProps)

  return (
    <div data-slot="field-group" className={cn("flex flex-col gap-1.5", className)} {...props}>
      <Label htmlFor={controlId} className="gap-1">
        {label}
        {optional ? <span className="font-normal text-ink-secondary">({labels.common.optional})</span> : null}
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
