import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DailyForm } from "@/components/dailies/daily-form"
import { CrumbLabel } from "@/components/shell/crumb-label"
import { PageHeader } from "@/components/ui/page-header"
import { formatDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { canWrite, requireTeamContext } from "@/server/scope"
import { getDailyForm } from "@/server/queries/dailies"

const E = labels.dailies.edit

export const metadata: Metadata = {
  title: `${E.title} · ${labels.app.name}`,
}

/**
 * C11: editar uma daily salva no formato da criação. Revisões gravadas ficam
 * travadas; o que ficou sem desfecho se revisa; combinados de hoje se corrigem,
 * removem e acrescentam. Só para quem escreve.
 */
export default async function EditDailyPage({ params }: { params: Promise<{ dailyId: string }> }) {
  const { dailyId } = await params
  const ctx = await requireTeamContext()
  if (!canWrite(ctx)) notFound()
  const form = await getDailyForm(ctx, undefined, dailyId)
  if (!form?.edit) notFound()
  const date = formatDate(form.date, "business")

  return (
    <div className="flex flex-col gap-6">
      <CrumbLabel segment={dailyId} label={date} />
      <PageHeader title={fill(E.pageTitle, { date })} subtitle={E.subtitle} />
      <DailyForm key={dailyId} form={form} />
    </div>
  )
}
