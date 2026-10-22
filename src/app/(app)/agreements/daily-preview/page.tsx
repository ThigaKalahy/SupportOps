import type { Metadata } from "next"

import { DailyPreviewView, PreviewRefresh } from "@/components/agreements/daily-preview"
import { ContextActions } from "@/components/shell/context-actions"
import { PageHeader } from "@/components/ui/page-header"
import { formatDate, formatTime } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { getDailyPreview } from "@/server/queries/dailies"
import { requireTeamContext } from "@/server/scope"

const L = labels.dailyPreview

export const metadata: Metadata = {
  title: `${L.title} · ${labels.app.name}`,
}

/**
 * C18 — Prévia da daily: o que o time relatou e criou desde a última daily registrada,
 * para o gestor ver o movimento antes dela. Só leitura (nada é gravado; a daily decide).
 */
export default async function DailyPreviewPage() {
  const ctx = await requireTeamContext()
  const preview = await getDailyPreview(ctx)

  return (
    <div className="flex flex-col gap-6">
      <ContextActions>
        <PreviewRefresh at={formatTime(new Date())} />
      </ContextActions>
      <PageHeader
        title={L.title}
        subtitle={
          preview.previous
            ? fill(L.since, { date: formatDate(preview.previous.date, "business"), time: formatTime(preview.previous.at) })
            : L.sinceNone
        }
      />
      <p className="-mt-3 max-w-3xl text-sm text-ink-secondary">{L.direction}</p>
      <DailyPreviewView preview={preview} />
    </div>
  )
}
