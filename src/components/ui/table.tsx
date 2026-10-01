import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Peças de tabela cruas. Para listagens do produto use DataTable, que já traz
 * cabeçalho sticky, seleção, estados e a versão empilhada para telas estreitas.
 */

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <table data-slot="table" className={cn("w-full border-collapse text-sm", className)} {...props} />
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-b-0", className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot data-slot="table-footer" className={cn("border-t border-line bg-surface-sunken font-medium", className)} {...props} />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "h-10 border-b border-line transition-colors hover:bg-surface-sunken data-[state=selected]:bg-accent-wash",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-8 border-b border-line bg-surface-sunken px-3 text-left align-middle font-mono text-2xs font-medium tracking-label whitespace-nowrap text-ink-secondary uppercase",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("px-3 align-middle", className)} {...props} />
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("mt-3 text-xs text-ink-secondary", className)} {...props} />
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
