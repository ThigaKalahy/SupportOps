"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({ className, orientation = "horizontal", ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn("flex gap-3 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

/**
 * line      — abas de página: sublinhado de 2px em --accent na aba ativa.
 * segmented — alternância compacta dentro de um bloco (ex.: período).
 */
const tabsListVariants = cva("inline-flex w-fit items-center text-ink-secondary", {
  variants: {
    variant: {
      line: "h-9 gap-4 border-b border-line",
      segmented: "h-8 gap-0.5 rounded-sm bg-surface-sunken p-0.5",
    },
  },
  defaultVariants: {
    variant: "line",
  },
})

function TabsList({
  className,
  variant = "line",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-full items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors hover:text-ink disabled:pointer-events-none disabled:text-ink-tertiary data-active:text-ink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // line: barra de 2px sobre a borda inferior da lista
        "in-data-[variant=line]:after:absolute in-data-[variant=line]:after:inset-x-0 in-data-[variant=line]:after:-bottom-px in-data-[variant=line]:after:h-0.5 in-data-[variant=line]:data-active:after:bg-accent",
        // segmented
        "in-data-[variant=segmented]:rounded-xs in-data-[variant=segmented]:px-2.5 in-data-[variant=segmented]:data-active:bg-surface",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 text-sm", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
