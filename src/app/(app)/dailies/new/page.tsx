import type { Metadata } from "next"

import { DailyForm } from "@/components/dailies/daily-form"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { formatDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { getDailyForm } from "@/server/queries/dailies"

const L = labels.dailies

export const metadata: Metadata = {
  title: `${L.new} · ${labels.app.name}`,
}

/** Registro da daily de hoje. Só para quem escreve. */
export default async function NewDailyPage() {
  const user = await requireUser()
  if (!canWrite(user)) {
    return (
      <div className="rounded-lg border border-line bg-surface">
        <EmptyState title={L.new} direction={L.forbidden} />
      </div>
    )
  }
  const form = await getDailyForm(user)
  if (!form) {
    return (
      <div className="rounded-lg border border-line bg-surface">
        <EmptyState title={L.new} direction={labels.pages.team.emptyDirection} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={fill(L.newTitle, { date: formatDate(form.date, "business") })} subtitle={L.newSubtitle} />
      <DailyForm form={form} />
    </div>
  )
}
