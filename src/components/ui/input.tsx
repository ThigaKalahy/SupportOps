import * as React from "react"

import { cn } from "@/lib/utils"

/** Base compartilhada pelos controles de texto (input, textarea, select). */
const controlClasses =
  "w-full min-w-0 rounded-sm border border-line bg-surface text-sm text-ink transition-colors placeholder:text-ink-tertiary hover:border-line-strong disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken disabled:text-ink-tertiary aria-invalid:border-overdue"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlClasses,
        "h-9 px-2.5 file:mr-2 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink",
        className
      )}
      {...props}
    />
  )
}

export { Input, controlClasses }
