import { EmptyState } from "@/components/ui/empty-state"
import { labels } from "@/lib/labels"

/**
 * Aba do perfil cuja tela completa ainda não existe (combinados P9, 1:1 e
 * feedbacks P13, desenvolvimento P14). Diz onde a informação está
 * hoje, em vez de fingir que não há registros.
 */
export function PendingTab({ tab }: { tab: keyof typeof labels.profile.pendingTab }) {
  const copy = labels.profile.pendingTab[tab]
  return (
    <div className="rounded-lg border border-dashed border-line">
      <EmptyState title={copy.title} direction={copy.direction} />
    </div>
  )
}
