import * as React from "react"

import type { Highlighted } from "@/lib/search"
import { cn } from "@/lib/utils"

/**
 * Trecho de resultado de busca com o termo destacado: fundo --accent-wash,
 * texto --ink, sem negrito pesado. O texto vem como partes já separadas
 * (src/lib/search.ts → highlight), nunca como HTML.
 */
function HighlightedText({ parts, className }: { parts: Highlighted; className?: string }) {
  return (
    <span data-slot="highlighted-text" className={cn("text-ink-secondary", className)}>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-xs bg-accent-wash px-0.5 text-ink">
            {p.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </span>
  )
}

export { HighlightedText }
