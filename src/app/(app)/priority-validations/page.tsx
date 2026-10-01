import type { Metadata } from "next"

import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { labels } from "@/lib/labels"

const page = labels.pages.priorityValidations

export const metadata: Metadata = {
  title: `${labels.nav.priorityValidations} · ${labels.app.name}`,
}

export default function PriorityValidationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={labels.nav.priorityValidations} subtitle={page.subtitle} />
      <div className="rounded-lg border border-line bg-surface">
        <EmptyState title={page.emptyTitle} direction={page.emptyDirection} />
      </div>
    </div>
  )
}
