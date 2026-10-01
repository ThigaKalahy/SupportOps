"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { CheckIcon, MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface text-surface transition-colors after:absolute after:-inset-2 hover:border-ink-tertiary disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken aria-invalid:border-overdue data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent disabled:data-[state=checked]:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center text-current">
        {props.checked === "indeterminate" ? <MinusIcon className="size-3" /> : <CheckIcon className="size-3" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
