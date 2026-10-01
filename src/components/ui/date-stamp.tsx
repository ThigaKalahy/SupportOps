import * as React from "react"

import {
  formatDate,
  formatDateLong,
  formatDateTime,
  formatDayMonth,
  toBusinessDateKey,
  type DateKind,
} from "@/lib/dates"
import { cn } from "@/lib/utils"

/**
 * Data em IBM Plex Mono, formato pt-BR, com a data completa no title.
 *
 * kind="timestamp" (padrão): instante, exibido no horário de São Paulo.
 * kind="business": data de negócio (`@db.Date`), sem conversão de fuso.
 *
 * display: "date" 01/10/2026 · "datetime" 01/10/2026 14:05 · "short" 01/10
 */
function DateStamp({
  date,
  kind = "timestamp",
  display = "date",
  className,
  ...props
}: Omit<React.ComponentProps<"time">, "children" | "dateTime"> & {
  date: Date
  kind?: DateKind
  display?: "date" | "datetime" | "short"
}) {
  const text =
    display === "datetime" && kind === "timestamp"
      ? formatDateTime(date)
      : display === "short"
        ? formatDayMonth(date, kind)
        : formatDate(date, kind)

  return (
    <time
      data-slot="date-stamp"
      dateTime={kind === "business" ? toBusinessDateKey(date) : date.toISOString()}
      title={formatDateLong(date, kind)}
      className={cn("font-mono text-xs whitespace-nowrap", className)}
      {...props}
    >
      {text}
    </time>
  )
}

export { DateStamp }
