import type { Metadata } from "next"
import Link from "next/link"
import { PlusIcon } from "lucide-react"

import { ContextActions } from "@/components/shell/context-actions"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { labels, plural } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { listDailies } from "@/server/queries/dailies"

import { DailyHistory } from "./_components/daily-history"

const page = labels.pages.dailies

export const metadata: Metadata = {
  title: `${labels.nav.dailies} · ${labels.app.name}`,
}

/** Histórico de dailies, da mais recente para a mais antiga. */
export default async function DailiesPage() {
  const user = await requireUser()
  const dailies = await listDailies(user)

  return (
    <div className="flex flex-col gap-6">
      {canWrite(user) ? (
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
          <EmptyState title={page.emptyTitle} direction={page.emptyDirection} />
        </div>
      ) : (
        <DailyHistory dailies={dailies} />
      )}
    </div>
  )
}
