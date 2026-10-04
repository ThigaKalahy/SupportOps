import * as React from "react"
import { MonitorIcon } from "lucide-react"

import { labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

/**
 * Aviso discreto, só abaixo de 768px, em formulário longo (daily, 1:1): a
 * experiência é melhor no computador, mas o formulário continua funcionando.
 * Não bloqueia nada e não some sozinho — é estado, não notificação.
 */
function DesktopHint({ className }: { className?: string }) {
  return (
    <p
      data-slot="desktop-hint"
      className={cn(
        "flex items-start gap-2 rounded-sm border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-secondary md:hidden",
        className,
      )}
    >
      <MonitorIcon className="mt-px size-4 shrink-0" strokeWidth={1.5} aria-hidden />
      {labels.common.desktopHint}
    </p>
  )
}

export { DesktopHint }
