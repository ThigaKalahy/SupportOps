import * as React from "react"

import { controlClasses } from "@/components/ui/input"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClasses, "field-sizing-content min-h-16 px-2.5 py-2", className)}
      {...props}
    />
  )
}

export { Textarea }
