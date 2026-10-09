import { RouteTabs } from "@/components/ui/route-tabs"
import { labels } from "@/lib/labels"

const T = labels.devReturns.tabs

/**
 * Abas da seção "Validação de prioridade" (P20): o mesmo domínio — qualidade
 * da triagem de chamados — visto dos dois lados. A devolução do
 * desenvolvimento é aba, não item novo na sidebar (oito é o teto).
 */
export function TriageTabs() {
  return (
    <RouteTabs
      label={T.label}
      tabs={[
        { href: "/priority-validations", label: T.validations },
        { href: "/dev-returns", label: T.devReturns },
      ]}
    />
  )
}
