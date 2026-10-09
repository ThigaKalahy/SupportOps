import { PageHeader } from "@/components/ui/page-header"
import { RouteTabs } from "@/components/ui/route-tabs"
import { labels } from "@/lib/labels"

const S = labels.settings

/** Configurações: cabeçalho e uma aba por catálogo (níveis, motivos, padrões de URL). */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={S.title} subtitle={labels.pages.settings.subtitle} />
      <RouteTabs
        label={S.tabsLabel}
        tabs={[
          { href: "/settings", label: S.tabs.priorityLevels, exact: true },
          { href: "/settings/reclassification-reasons", label: S.tabs.reclassificationReasons },
          { href: "/settings/blocker-reasons", label: S.tabs.blockerReasons },
          { href: "/settings/dev-return-reasons", label: S.tabs.devReturnReasons },
          { href: "/settings/ticket-patterns", label: S.tabs.ticketPatterns },
          { href: "/settings/centrals", label: S.tabs.centrals },
          { href: "/settings/competencies", label: S.tabs.competencies },
          { href: "/settings/competency-matrix", label: S.tabs.competencyMatrix },
          { href: "/settings/thresholds", label: S.tabs.thresholds },
          { href: "/settings/metrics", label: S.tabs.metrics },
          { href: "/settings/score", label: S.tabs.score },
        ]}
      />
      {children}
    </div>
  )
}
