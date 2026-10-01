"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { floatingClasses, floatingMotionClasses } from "@/components/ui/styles"
import { cn } from "@/lib/utils"

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          floatingClasses,
          floatingMotionClasses,
          "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-3 p-3 text-sm",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="popover-header" className={cn("flex flex-col gap-0.5", className)} {...props} />
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="popover-title" className={cn("font-medium text-ink", className)} {...props} />
}

function PopoverDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="popover-description" className={cn("text-ink-secondary", className)} {...props} />
}

export { Popover, PopoverAnchor, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger }
