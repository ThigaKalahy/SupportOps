import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AuditEvaluationView, AuditRunList, maskSummary, type AuditFeedbackView } from "@/components/audit/audit-evaluation"
import { AuditRunner } from "@/components/audit/audit-runner"
import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { formatDateTime, formatTime } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { requireAuditPage } from "@/server/audit/access"
import { getAuditRunState } from "@/server/audit/evaluate"
import { getAuditConversation, getAuditEvaluation, getAuditPayloadPreview } from "@/server/audit/queries"

const A = labels.audit
const C = A.conversation
const E = A.evaluation

export const metadata: Metadata = {
  title: `${A.title} · ${labels.app.name}`,
}

/** As Server Actions da avaliação rodam nesta rota: uma conversa por chamada cabe em 60 s. */
export const maxDuration = 60

const int = new Intl.NumberFormat("pt-BR")

const SENDER_STYLE: Record<string, string> = {
  CUSTOMER: "border-line bg-surface",
  ANALYST: "border-accent/40 bg-accent-wash",
  SYSTEM: "border-dashed border-line bg-surface-sunken text-ink-secondary",
  UNKNOWN: "border-attention bg-attention-wash",
}

/**
 * C23 Fases C e D — uma conversa: identificação, avaliação (nota com detalhamento, evidências que
 * levam à mensagem, feedback SCI), avaliar/simular, execuções, o que seria enviado à IA e a
 * transcrição em ordem, com as mensagens citadas marcadas.
 */
export default async function AuditConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const ctx = await requireAuditPage()
  const { conversationId } = await params
  const c = await getAuditConversation(ctx, conversationId)
  if (!c) notFound()
  const [evaluation, runState, payload] = await Promise.all([
    getAuditEvaluation(ctx, c.id),
    getAuditRunState(ctx, c.batchId),
    getAuditPayloadPreview(ctx, c.id),
  ])
  const meta = c.meta ?? {}
  const current = evaluation.current
  const eligible = c.messageCount > 0 && !current && ["IMPORTED", "REVIEW_NEEDED", "FAILED"].includes(c.status)
  const cited = new Set<number>(
    current?.response && Array.isArray(current.response.evidences) ? (current.response.evidences as { messagePosition: number }[]).map((e) => e.messagePosition) : [],
  )

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
      <PageHeader title={`${c.customerName ?? c.fileName}${c.externalId ? ` · #${c.externalId}` : ""}`} subtitle={`${A.conversationStatus[c.status]}${current ? "" : ` · ${C.notEvaluated}`}`} />

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

      <Section title={E.title}>
        {current ? (
          <AuditEvaluationView run={current} feedback={evaluation.feedback as AuditFeedbackView[]} />
        ) : (
          <p className="text-sm text-ink-secondary">{E.none}</p>
        )}
        {runState && (eligible || runState.queued + runState.processing > 0) ? (
          <AuditRunner batchId={c.batchId} conversationId={c.id} state={{ ...runState, eligible: eligible ? 1 : 0 }} />
        ) : null}
      </Section>

      {evaluation.runs.length ? (
        <Section title={E.runs} count={evaluation.runs.length}>
          <AuditRunList runs={evaluation.runs} />
        </Section>
      ) : null}

      {payload ? (
        <details className="max-w-4xl rounded-lg border border-line bg-surface px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-ink">{E.payload}</summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs text-ink-secondary">
              {E.payloadHint} {fill(E.payloadTokens, { tokens: int.format(payload.estimatedInputTokens), max: int.format(payload.maxInputTokens) })} ·{" "}
              {payload.model} · {maskSummary(payload.masked, payload.maskCounts)}
            </p>
            <h3 className="text-xs font-medium text-ink-secondary">{E.instructions}</h3>
            <pre className="max-h-64 overflow-auto rounded-sm bg-surface-sunken p-2 font-mono text-xs whitespace-pre-wrap text-ink">{payload.instructions}</pre>
            <h3 className="text-xs font-medium text-ink-secondary">{E.conversation}</h3>
            <pre className="max-h-96 overflow-auto rounded-sm bg-surface-sunken p-2 font-mono text-xs whitespace-pre-wrap text-ink">{payload.input}</pre>
          </div>
        </details>
      ) : null}

      <Section title={C.transcript} count={c.messages.length}>
        <ol className="flex max-w-4xl flex-col gap-2">
          {c.messages.map((m) => {
            const audio = /^\[Áudio\]/i.test(m.text)
            const attachment = m.text.trim() === ""
            return (
              <li
                key={m.position}
                id={`m${m.position}`}
                className={cn("flex scroll-mt-16 flex-col gap-1 rounded-lg border px-3 py-2 target:outline target:outline-2 target:outline-accent", SENDER_STYLE[m.sender], cited.has(m.position) && "border-l-4")}
              >
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
