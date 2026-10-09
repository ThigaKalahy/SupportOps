import Link from "next/link"

import { Section } from "@/components/ui/section"
import { SeverityDot } from "@/components/ui/severity-dot"
import { StatusPill } from "@/components/ui/status-pill"
import { fill, labels, plural } from "@/lib/labels"
import { HEAT_SEVERITY } from "@/lib/watch"
import type { WatchRow } from "@/server/queries/watch"

const W = labels.watch
const MAX = 4

/**
 * Coluna estreita do perfil, ACIMA dos blocos de validação e devolução (P21):
 * observação é mais urgente que métrica. As ativas da pessoa, com grau e dias
 * desde a última revisão; no máximo 4 linhas, com link para /watch filtrado
 * quando houver mais.
 */
export function ProfileWatchBlock({ items, member }: { items: WatchRow[]; member: { id: string; preferredName: string } }) {
  const href = `/watch?member=${member.id}`
  const rest = items.length - MAX
  return (
    <Section
      title={W.profile.title}
      count={items.length}
      action={
        items.length > 0 ? (
          <Link href={href} className="text-xs text-accent hover:underline">
            {W.profile.seeAll}
          </Link>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-ink-secondary">{fill(W.profile.empty, { name: member.preferredName })}</p>
      ) : (
        <ul className="flex flex-col">
          {items.slice(0, MAX).map((w) => (
            <li key={w.id} className="flex items-center gap-2 border-b border-line py-2 last:border-b-0">
              <SeverityDot severity={w.review.severity} label={w.review.status === "ok" ? W.review.ok : w.review.status === "due" ? W.review.due : W.review.late} />
              <Link href={`/watch?open=${w.id}`} className="min-w-0 flex-1 truncate text-sm text-ink hover:underline">
                {w.title}
              </Link>
              <StatusPill severity={HEAT_SEVERITY[w.heat]} label={W.heat[w.heat]} />
              <span className="shrink-0 font-mono text-xs text-ink-secondary">
                {w.review.daysSinceReview === 0 ? W.review.today : plural(W.review.daysSince, w.review.daysSinceReview)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {rest > 0 ? (
        <Link href={href} className="text-xs text-accent hover:underline">
          {plural(W.profile.more, rest)}
        </Link>
      ) : null}
    </Section>
  )
}
