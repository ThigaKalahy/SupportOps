import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Estado vazio: um título, uma linha de direção (o que fazer ou por que está
 * vazio) e no máximo uma ação. Nunca ilustração, nunca ícone decorativo, nunca emoji.
 */
function EmptyState({
  title,
  direction,
  action,
  size = "default",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title" | "children"> & {
  title: string
  direction: string
  action?: React.ReactNode
  size?: "default" | "compact"
}) {
  return (
    <div
      data-slot="empty-state"
      data-size={size}
      className={cn(
        "flex flex-col items-center justify-center gap-1 text-center",
        size === "default" ? "px-4 py-12" : "px-4 py-6",
        className
      )}
      {...props}
    >
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-[48ch] text-sm text-ink-secondary">{direction}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
