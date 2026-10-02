import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { CopyWhatsAppButton } from "@/components/dailies/copy-whatsapp-button"
import { DailyDetail } from "@/components/dailies/daily-detail"
import { EditDailyButton } from "@/components/dailies/edit-daily-dialog"
import { ContextActions } from "@/components/shell/context-actions"
import { CrumbLabel } from "@/components/shell/crumb-label"
import { PageHeader } from "@/components/ui/page-header"
import { formatDate } from "@/lib/dates"
import { fill, labels, plural } from "@/lib/labels"
import { canWrite, requireUser } from "@/server/access"
import { getDailyDetail } from "@/server/queries/dailies"

const H = labels.dailies.history

const load = cache(async (id: string) => {
  const user = await requireUser()
  return { user, daily: await getDailyDetail(user, id) }
})

export async function generateMetadata({ params }: { params: Promise<{ dailyId: string }> }): Promise<Metadata> {
  const { daily } = await load((await params).dailyId)
  const title = daily ? fill(labels.dailies.newTitle, { date: formatDate(daily.date, "business") }) : labels.nav.dailies
  return { title: `${title} · ${labels.app.name}` }
}

/** Daily registrada: o que foi revisado, criado, anotado — e o texto para o WhatsApp. */
export default async function DailyPage({ params }: { params: Promise<{ dailyId: string }> }) {
  const { user, daily } = await load((await params).dailyId)
  if (!daily) notFound()
  const date = formatDate(daily.date, "business")
  const blockers = daily.present.filter((p) => p.blocker).length

  return (
    <div className="flex flex-col gap-8">
      <CrumbLabel segment={daily.id} label={date} />
      <ContextActions>
        {canWrite(user) ? <EditDailyButton daily={daily} /> : null}
        <CopyWhatsAppButton daily={daily.whatsapp} />
      </ContextActions>
      <PageHeader
        title={fill(labels.dailies.newTitle, { date })}
        subtitle={[
          `${daily.present.length} ${H.present}`,
          plural(H.reviewed, daily.reviewed.length),
          plural(H.created, daily.created.length),
          ...(blockers ? [plural(H.blockers, blockers)] : []),
        ].join(" · ")}
      />
      <DailyDetail daily={daily} />
    </div>
  )
}
