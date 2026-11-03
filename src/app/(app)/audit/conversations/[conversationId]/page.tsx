import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { formatDateTime, formatTime } from "@/lib/dates"
import { labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { requireAuditPage } from "@/server/audit/access"
import { getAuditConversation } from "@/server/audit/queries"

const A = labels.audit
const C = A.conversation

export const metadata: Metadata = {
  title: `${A.title} · ${labels.app.name}`,
}

const SENDER_STYLE: Record<string, string> = {
  CUSTOMER: "border-line bg-surface",
  ANALYST: "border-accent/40 bg-accent-wash",
  SYSTEM: "border-dashed border-line bg-surface-sunken text-ink-secondary",
  UNKNOWN: "border-attention bg-attention-wash",
}

/** C23 Fase C — uma conversa: identificação, avisos da leitura e a transcrição em ordem. */
export default async function AuditConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const ctx = await requireAuditPage()
  const { conversationId } = await params
  const c = await getAuditConversation(ctx, conversationId)
  if (!c) notFound()
  const meta = c.meta ?? {}

  const facts: [string, string | null | undefined][] = [
    [C.chat, c.externalId ? `#${c.externalId}` : null],
    [C.customer, c.customerName],
    [C.contact, meta.customerContact],
    [C.analyst, c.member ? `${c.member.name} (${c.analystName})` : c.analystName ? `${c.analystName} — ${C.notRecognized}` : null],
    [C.period, c.startedAt ? `${formatDateTime(c.startedAt)}${c.endedAt ? ` → ${formatDateTime(c.endedAt)}` : ""}` : null],
    [C.firstResponse, meta.firstResponse],
    [C.rating, meta.customerRating],
    [C.tags, meta.tags?.join(", ")],
    [C.tickets, meta.tickets?.join(", ")],
    [C.file, `${c.fileName} · ${c.encoding}`],
  ]

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/audit/batches/${c.batchId}`} className="self-start text-sm text-ink-secondary hover:text-ink hover:underline">
        {C.back}: {c.batch.name}
      </Link>
      <PageHeader title={`${c.customerName ?? c.fileName}${c.externalId ? ` · #${c.externalId}` : ""}`} subtitle={`${A.conversationStatus[c.status]} · ${C.notEvaluated}`} />

      <dl className="grid max-w-4xl gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[max-content_1fr]">
        {facts.map(([label, value]) =>
          value ? (
            <div key={label} className="contents">
              <dt className="text-ink-secondary">{label}</dt>
              <dd className="text-ink">{value}</dd>
            </div>
          ) : null,
        )}
      </dl>

      {c.warnings.length || c.lastError ? (
        <Section title={C.warnings}>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-secondary">
            {c.lastError ? <li className="text-overdue">{c.lastError}</li> : null}
            {c.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={C.transcript} count={c.messages.length}>
        <ol className="flex max-w-4xl flex-col gap-2">
          {c.messages.map((m) => {
            const audio = /^\[Áudio\]/i.test(m.text)
            const attachment = m.text.trim() === ""
            return (
              <li key={m.position} id={`m${m.position}`} className={cn("flex flex-col gap-1 rounded-lg border px-3 py-2", SENDER_STYLE[m.sender])}>
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-secondary">
                  <span className="font-mono">{m.position}</span>
                  <span className="font-medium text-ink">{m.authorName}</span>
                  <span>{C.senders[m.sender]}</span>
                  {m.sentAt ? <span className="font-mono">{formatTime(m.sentAt)}</span> : null}
                  {audio ? <span className="italic">{C.audio}</span> : null}
                </div>
                {attachment ? <p className="text-sm italic text-ink-secondary">{C.attachment}</p> : <p className="text-sm whitespace-pre-line text-ink">{m.text}</p>}
              </li>
            )
          })}
        </ol>
      </Section>
    </div>
  )
}
