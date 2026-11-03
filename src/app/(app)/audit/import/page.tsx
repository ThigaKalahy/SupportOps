import type { Metadata } from "next"

import { AuditImporter } from "@/components/audit/audit-importer"
import { PageHeader } from "@/components/ui/page-header"
import { labels } from "@/lib/labels"
import { requireAuditPage } from "@/server/audit/access"

export const metadata: Metadata = {
  title: `${labels.audit.import.title} · ${labels.app.name}`,
}

/** C23 Fase C — importar conversas (TXT ou ZIP), com pré-visualização. Sem IA. */
export default async function AuditImportPage() {
  await requireAuditPage()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={labels.audit.import.title} subtitle={labels.audit.phaseC} />
      <AuditImporter />
    </div>
  )
}
