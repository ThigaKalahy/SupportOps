import type { Metadata } from "next"
import Link from "next/link"
import { PlusIcon } from "lucide-react"

import { ContextActions } from "@/components/shell/context-actions"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { labels, plural } from "@/lib/labels"
import { canWrite, requireTeamContext } from "@/server/scope"
import { listDailies } from "@/server/queries/dailies"

import { DailyHistory } from "./_components/daily-history"

const page = labels.pages.dailies

export const metadata: Metadata = {
  title: `${labels.nav.dailies} · ${labels.app.name}`,
}

/** Histórico de dailies, da mais recente para a mais antiga. */
export default async function DailiesPage() {
  const ctx = await requireTeamContext()
  const dailies = await listDailies(ctx)
  const writer = canWrite(ctx)

  return (
    <div className="flex flex-col gap-6">
      {writer ? (
        <ContextActions>
          <Button asChild size="sm">
            <Link href="/dailies/new">
              <PlusIcon />
              {labels.dailies.new}
            </Link>
          </Button>
        </ContextActions>
      ) : null}
      <PageHeader title={labels.nav.dailies} subtitle={plural(labels.dailies.history.count, dailies.length)} />
      {dailies.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState
            title={page.emptyTitle}
            direction={writer ? page.emptyDirection : page.emptyDirectionReadOnly}
            action={
              writer ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/dailies/new">{labels.dailies.new}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <DailyHistory dailies={dailies} />
      )}
    </div>
  )
}
