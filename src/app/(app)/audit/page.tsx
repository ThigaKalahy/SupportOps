import type { Metadata } from "next"
import Link from "next/link"
import { UploadIcon } from "lucide-react"

import { AuditConfigForm } from "@/components/audit/audit-config-form"
import { TriageTabs } from "@/components/priority-validations/triage-tabs"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { formatDateTime } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { requireAuditPage } from "@/server/audit/access"
import { getAuditConfig } from "@/server/audit/config"
import { getAuditSpend } from "@/server/audit/evaluate"
import { listAuditBatches } from "@/server/audit/queries"

const A = labels.audit

export const metadata: Metadata = {
  title: `${A.title} · ${labels.app.name}`,
}

/**
 * C23 — Auditoria de Atendimentos (D47), Fase B: situação e configuração. Sem as três travas
 * (gestor, módulo, conta autorizada) a rota responde 404.
 */
export default async function AuditPage() {
  const ctx = await requireAuditPage()
  const [config, batches] = await Promise.all([getAuditConfig(ctx), listAuditBatches(ctx)])
  const spend = await getAuditSpend(ctx, config)
  const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" })
  const amount = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  const S = A.status
  const alert = spend.alertLevel === 100 ? A.budget.alert100 : spend.alertLevel === 80 ? A.budget.alert80 : spend.alertLevel === 50 ? A.budget.alert50 : null

  const rows: [string, string][] = [
    [S.module, S.on],
    [S.evaluations, config.enabled ? S.on : S.off],
    [S.mode, config.simulation ? S.simulation : S.real],
    [S.apiKey, config.apiKeyConfigured ? S.keyOk : S.keyMissing],
    [S.budget, config.monthlyBudgetUsd > 0 ? usd.format(config.monthlyBudgetUsd) : S.budgetZero],
    [A.budget.title, fill(A.budget.line, { spent: amount.format(spend.monthUsd), budget: amount.format(spend.monthlyBudgetUsd) })],
  ]

  return (
    <div className="flex flex-col gap-6">
      <TriageTabs modules={ctx.modules} audit />
      <PageHeader
        title={A.title}
        subtitle={A.subtitle}
        actions={
          <Button asChild size="sm">
            <Link href="/audit/import">
              <UploadIcon />
              {A.batches.new}
            </Link>
          </Button>
        }
      />
      <p className="max-w-3xl rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-secondary">{A.phaseD}</p>

      <Section title={A.batches.title} count={batches.length}>
        {batches.length === 0 ? (
          <p className="text-sm text-ink-secondary">{A.batches.empty}</p>
        ) : (
          <ul className="flex max-w-4xl flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {batches.map((b) => (
              <li key={b.id} className="px-3 py-2">
                <Link href={`/audit/batches/${b.id}`} className="text-sm font-medium text-ink hover:underline">
                  {b.name}
                </Link>
                <p className="text-xs text-ink-secondary">
                  {formatDateTime(b.createdAt)} ·{" "}
                  {fill(A.batches.counts, { files: b.fileCount, imported: b.importedCount, duplicates: b.duplicateCount, failed: b.failedCount })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={S.title}>
        <dl className="grid max-w-3xl gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-secondary">{label}</dt>
              <dd className="text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        {alert ? (
          <p className={spend.alertLevel === 100 ? "text-sm text-overdue" : "text-sm text-attention"} role="status">
            {alert}
          </p>
        ) : null}
        <p className="text-xs text-ink-secondary">{A.budget.note}</p>
      </Section>

      <Section
        title={A.config.title}
        action={
          <span className="text-xs text-ink-secondary">
            {config.updatedAt ? fill(A.config.lastSaved, { date: formatDateTime(config.updatedAt) }) : A.config.neverSaved}
          </span>
        }
      >
        <AuditConfigForm config={config} />
      </Section>
    </div>
  )
}
