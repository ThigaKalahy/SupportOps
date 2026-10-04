"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn("flex size-full flex-col overflow-hidden bg-surface text-ink", className)}
      {...props}
    />
  )
}

function CommandDialog({
  title = labels.command.title,
  description = labels.command.description,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
  className?: string
}) {
  return (
    <Dialog {...props}>
      <DialogContent className={cn("top-1/4 translate-y-0 gap-0 overflow-hidden p-0", className)} showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="flex h-10 items-center gap-2 border-b border-line px-3">
      <SearchIcon className="size-4 shrink-0 text-ink-tertiary" aria-hidden />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          // Único campo da paleta, sempre focado enquanto ela está aberta: o cursor e o item
          // selecionado sinalizam o foco. Um outline aqui cobria a primeira letra digitada.
          "h-full w-full bg-transparent text-sm text-ink placeholder:text-ink-tertiary focus-visible:outline-none disabled:cursor-not-allowed disabled:text-ink-tertiary",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn("max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto p-1", className)}
      {...props}
    />
  )
}

function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("px-2 py-6 text-center text-sm text-ink-secondary", className)}
      {...props}
    />
  )
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden text-ink",
        // cabeçalho de grupo no estilo MetaLabel (mesmo visual de menuLabelClasses)
        "**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:font-mono **:[[cmdk-group-heading]]:text-2xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:tracking-label **:[[cmdk-group-heading]]:text-ink-secondary **:[[cmdk-group-heading]]:uppercase",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator data-slot="command-separator" className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-sm text-ink select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:text-ink-tertiary data-[selected=true]:bg-surface-sunken [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-ink-secondary [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span data-slot="command-shortcut" className={cn("ml-auto font-mono text-2xs text-ink-secondary", className)} {...props} />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
