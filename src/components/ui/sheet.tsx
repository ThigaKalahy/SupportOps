"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-ink/20 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/** Painel lateral (drawer). Sem sombra: separado do conteúdo por borda e overlay. */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 border-line bg-surface text-sm text-ink duration-150 data-open:animate-in data-closed:animate-out",
          "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:max-w-drawer data-[side=left]:border-r data-[side=left]:data-open:slide-in-from-left-4 data-[side=left]:data-closed:slide-out-to-left-4",
          "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:max-w-drawer data-[side=right]:border-l data-[side=right]:data-open:slide-in-from-right-4 data-[side=right]:data-closed:slide-out-to-right-4",
          "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:border-b data-[side=top]:data-open:slide-in-from-top-4 data-[side=top]:data-closed:slide-out-to-top-4",
          "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:border-t data-[side=bottom]:data-open:slide-in-from-bottom-4 data-[side=bottom]:data-closed:slide-out-to-bottom-4",
          "data-open:fade-in-0 data-closed:fade-out-0",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3">
              <XIcon />
              <span className="sr-only">{labels.common.close}</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1 border-b border-line p-4 pr-12", className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("text-base font-semibold text-ink", className)} {...props} />
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-ink-secondary", className)}
      {...props}
    />
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
