import { PageHeader } from "@/components/ui/page-header"
import { RouteTabs } from "@/components/ui/route-tabs"
import { labels } from "@/lib/labels"
import { SETTINGS_TABS, settingsTabEnabled } from "@/lib/settings-tabs"
import { requireTeamContext } from "@/server/scope"

const S = labels.settings

/**
 * Configurações do time ativo: cabeçalho e uma aba por catálogo. Catálogo de
 * módulo desligado no time (D32) não tem aba — e a página dele responde 404.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTeamContext()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={S.title} subtitle={labels.pages.settings.subtitle} />
      <RouteTabs
        label={S.tabsLabel}
        tabs={SETTINGS_TABS.filter((tab) => settingsTabEnabled(tab, ctx.modules)).map(({ href, label, exact }) => ({
          href,
          label,
          ...(exact ? { exact } : {}),
        }))}
      />
      {children}
    </div>
  )
}
