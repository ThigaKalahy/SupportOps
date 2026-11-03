import type { Metadata } from "next"

import { AuditConfigForm } from "@/components/audit/audit-config-form"
import { TriageTabs } from "@/components/priority-validations/triage-tabs"
import { PageHeader } from "@/components/ui/page-header"
import { Section } from "@/components/ui/section"
import { formatDateTime } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { requireAuditPage } from "@/server/audit/access"
import { getAuditConfig } from "@/server/audit/config"

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
  const config = await getAuditConfig(ctx)
  const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" })
  const S = A.status

  const rows: [string, string][] = [
    [S.module, S.on],
    [S.evaluations, config.enabled ? S.on : S.off],
    [S.mode, config.simulation ? S.simulation : S.real],
    [S.apiKey, config.apiKeyConfigured ? S.keyOk : S.keyMissing],
    [S.budget, config.monthlyBudgetUsd > 0 ? usd.format(config.monthlyBudgetUsd) : S.budgetZero],
  ]

  return (
    <div className="flex flex-col gap-6">
      <TriageTabs modules={ctx.modules} audit />
      <PageHeader title={A.title} subtitle={A.subtitle} />
      <p className="max-w-3xl rounded-lg border border-line bg-surface-sunken px-3 py-2 text-sm text-ink-secondary">{A.phase}</p>

      <Section title={S.title}>
        <dl className="grid max-w-3xl gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-secondary">{label}</dt>
              <dd className="text-ink">{value}</dd>
            </div>
          ))}
        </dl>
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
