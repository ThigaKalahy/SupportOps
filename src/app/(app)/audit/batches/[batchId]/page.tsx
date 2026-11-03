import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AnalystAliasRow } from "@/components/audit/analyst-alias"
import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { StatusPill } from "@/components/ui/status-pill"
import { formatDateTime } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import type { Severity } from "@/lib/severity"
import { requireAuditPage } from "@/server/audit/access"
import { getAuditBatch, listMembersForAudit, listUnrecognizedAnalysts } from "@/server/audit/queries"

const A = labels.audit
const B = A.batch

export const metadata: Metadata = {
  title: `${A.title} · ${labels.app.name}`,
}

const STATUS_SEVERITY: Record<string, Severity> = { IMPORTED: "neutral", QUEUED: "neutral", PROCESSING: "attention", DONE: "calm", FAILED: "overdue", REVIEW_NEEDED: "attention" }
const RESULT_SEVERITY: Record<string, Severity> = { imported: "calm", duplicate: "neutral", failed: "overdue", rejected: "overdue" }

/** C23 Fase C — um lote: relatório da importação, conversas e analistas a reconhecer. */
export default async function AuditBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const ctx = await requireAuditPage()
  const { batchId } = await params
  const [batch, unrecognized, members] = await Promise.all([getAuditBatch(ctx, batchId), listUnrecognizedAnalysts(ctx), listMembersForAudit(ctx)])
  if (!batch) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={batch.name}
        subtitle={`${formatDateTime(batch.createdAt)} · ${fill(A.batches.counts, { files: batch.fileCount, imported: batch.importedCount, duplicates: batch.duplicateCount, failed: batch.failedCount })}`}
      />

      <Section title={B.unrecognized} count={unrecognized.length}>
        {unrecognized.length === 0 ? (
          <p className="text-sm text-ink-secondary">{B.noUnrecognized}</p>
        ) : (
          <>
            <p className="-mt-2 text-xs text-ink-secondary">{B.unrecognizedHint}</p>
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
              {unrecognized.map((u) => (
                <AnalystAliasRow key={u.name} name={u.name} count={u.count} members={members} />
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title={B.conversations} count={batch.conversations.length}>
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {batch.conversations.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-3 py-2">
              <Link href={`/audit/conversations/${c.id}`} className="min-w-0 flex-1 text-sm text-ink hover:underline">
                <span className="font-mono">#{c.externalId ?? "—"}</span> · {c.customerName ?? c.fileName}
                <span className="block text-xs text-ink-secondary">
                  {c.member ? c.member.name : (c.analystName ?? A.conversation.notRecognized)}
                  {c.member ? null : ` · ${A.conversation.notRecognized}`}
                  {c.multipleAnalysts ? ` · ${B.multiple}` : null}
                  {c.startedAt ? ` · ${formatDateTime(c.startedAt)}` : null} · {c.messageCount} msg
                </span>
                {c.lastError ? <span className="block text-xs text-overdue">{c.lastError}</span> : null}
              </Link>
              <StatusPill severity={STATUS_SEVERITY[c.status] ?? "neutral"} label={A.conversationStatus[c.status]} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title={B.report} count={batch.report.length}>
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          {batch.report.map((e, i) => (
            <li key={`${e.file}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1 font-mono text-xs text-ink">{e.file}</span>
              <StatusPill severity={RESULT_SEVERITY[e.result] ?? "neutral"} label={B.results[e.result]} />
              {e.warnings.length ? <span className="basis-full text-xs text-ink-secondary">{e.warnings.join(" · ")}</span> : null}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
