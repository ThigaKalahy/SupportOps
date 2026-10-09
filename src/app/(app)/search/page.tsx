import type { Metadata } from "next"
import Link from "next/link"
import { LockIcon } from "lucide-react"

import { SearchForm } from "@/components/search/search-form"
import { DateStamp } from "@/components/ui/date-stamp"
import { EmptyState } from "@/components/ui/empty-state"
import { HighlightedText } from "@/components/ui/highlighted-text"
import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { highlight, parseSearchFilters, SEARCH_PARAMS, toTsQuery, type SearchKind } from "@/lib/search"
import { requireTeamContext } from "@/server/scope"
import { searchAll } from "@/server/queries/search"

const S = labels.search

export const metadata: Metadata = {
  title: `${S.title} · ${labels.app.name}`,
}

/**
 * /search: o fallback da paleta para resultados extensos. Mesmos grupos e
 * mesma busca (full-text em português, visibilidade aplicada), com tipo e
 * período na URL. Sem tipo escolhido, até 10 por grupo e o link "ver só";
 * com tipo, até 50.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireTeamContext()
  const filters = parseSearchFilters(await searchParams)
  const searchable = toTsQuery(filters.q) !== null
  const results = searchable
    ? await searchAll(ctx, filters.q, { kinds: filters.type ? [filters.type] : null, limit: filters.type ? 50 : 10, period: filters.period })
    : null
  const total = results?.groups.reduce((sum, g) => sum + g.total, 0) ?? 0

  const onlyHref = (kind: SearchKind) =>
    `/search?${new URLSearchParams({
      [SEARCH_PARAMS.q]: filters.q,
      [SEARCH_PARAMS.type]: kind,
      ...(filters.period !== "all" ? { [SEARCH_PARAMS.period]: filters.period } : {}),
    })}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={S.title}
        subtitle={results ? `${plural(S.count, total)} · ${fill(S.elapsed, { ms: results.ms })}` : S.subtitle}
      />
      <SearchForm filters={filters} />

      {!searchable ? (
        <div className="rounded-lg border border-dashed border-line">
          <EmptyState size="compact" title={S.emptyQuery} direction={S.emptyQueryDirection} />
        </div>
      ) : results && results.groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line">
          <EmptyState size="compact" title={S.emptyTitle} direction={S.emptyDirection} />
        </div>
      ) : (
        <div className="flex max-w-4xl flex-col gap-8">
          {results?.groups.map((g) => (
            <Section
              key={g.kind}
              title={S.kinds[g.kind]}
              count={g.total}
              action={
                !filters.type && g.total > g.hits.length ? (
                  <Link href={onlyHref(g.kind)} className="text-xs font-medium text-accent hover:underline">
                    {fill(S.seeType, { kind: S.kinds[g.kind].toLowerCase() })}
                  </Link>
                ) : undefined
              }
            >
              {g.total > g.hits.length ? (
                <p className="-mt-2 text-xs text-ink-secondary">{fill(S.showing, { shown: g.hits.length, total: g.total })}</p>
              ) : null}
              <ul className="flex flex-col">
                {g.hits.map((h) => (
                  <li key={h.id} className="border-b border-line py-2.5 last:border-b-0">
                    <Link href={h.href} className="group flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-secondary">
                        <span className="font-medium text-ink">{g.kind === "person" ? h.title : h.member.preferredName}</span>
                        {h.eventType ? <span className="font-mono text-2xs uppercase">{enumLabel("timelineEventType", h.eventType)}</span> : null}
                        {g.kind === "person" ? null : <DateStamp date={h.date} kind={h.businessDate ? "business" : "timestamp"} />}
                        {h.visibility === "PRIVATE" ? (
                          <span className="inline-flex items-center gap-1">
                            <LockIcon className="size-3" aria-hidden />
                            {S.private}
                          </span>
                        ) : null}
                      </span>
                      {g.kind === "person" ? (
                        <span className="text-sm text-ink-secondary">{h.body}</span>
                      ) : (
                        <HighlightedText parts={highlight(h.body || h.title, filters.q)} className="text-sm group-hover:text-ink" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </div>
  )
}
