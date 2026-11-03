import { RouteTabs } from "@/components/ui/route-tabs"
import { labels } from "@/lib/labels"
import { MODULES } from "@/lib/modules"

const T = labels.devReturns.tabs

/**
 * Abas da seção "Validação de prioridade" (P20): o mesmo domínio — qualidade
 * da triagem de chamados — visto dos dois lados. A devolução do
 * desenvolvimento é aba, não item novo na sidebar (oito é o teto). Só as abas
 * dos módulos ligados no time (D32); com uma só, não há abas.
 */
/** C23: `audit` = a conta pode abrir a Auditoria (conferido no servidor por quem renderiza). */
export function TriageTabs({ modules, audit = false }: { modules: ReadonlySet<string>; audit?: boolean }) {
  const tabs = [
    ...(modules.has(MODULES.PRIORITY_VALIDATION) ? [{ href: "/priority-validations", label: T.validations }] : []),
    ...(modules.has(MODULES.DEV_RETURNS) ? [{ href: "/dev-returns", label: T.devReturns }] : []),
    ...(audit ? [{ href: "/audit", label: labels.audit.tab }] : []),
  ]
  if (tabs.length < 2) return null
  return <RouteTabs label={T.label} tabs={tabs} />
}
