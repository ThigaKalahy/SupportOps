"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { QuickAgreementProvider } from "@/components/forms/quick-agreement"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { ToastProvider } from "@/components/ui/toast"
import type { AlertThresholds } from "@/lib/alert-thresholds"
import { labels } from "@/lib/labels"

import {
  CONTEXT_ACTIONS_ID,
  SIDEBAR_COLLAPSED_VALUE,
  SIDEBAR_COOKIE,
  SIDEBAR_COOKIE_MAX_AGE,
} from "./constants"
import { CommandPalette, openCommandPalette } from "./command-palette"
import { ContextBar } from "./context-bar"
import { CrumbLabelsContext } from "./crumb-label"
import { crumbsFor } from "./nav-config"
import { CurrentUser, ProductIdentity, Sidebar, SidebarNav, type NavCounts, type ShellUser } from "./sidebar"
import { ThresholdsProvider } from "./thresholds-context"

function persistCollapsed(collapsed: boolean) {
  const value = collapsed ? SIDEBAR_COLLAPSED_VALUE : "expanded"
  document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`
}

/**
 * Shell da aplicação: sidebar (≥ 1024px) ou drawer (< 1024px), barra de
 * contexto de 48px e conteúdo fluido até 1600px.
 */
export function AppShell({
  defaultCollapsed,
  user,
  agreementMembers,
  centrals,
  people,
  counts,
  thresholds,
  modules,
  children,
}: {
  defaultCollapsed: boolean
  user: ShellUser
  /** Módulos ligados no time ativo (D32). */
  modules: string[]
  /** Pessoas para a criação rápida de combinado (atalho C); null para quem só lê. */
  agreementMembers: { id: string; preferredName: string }[] | null
  /** Centrais ativas para o campo de central da criação rápida (P19); null sem o módulo (D32). */
  centrals: { id: string; name: string }[] | null
  /** Pessoas do time para a paleta de comandos (navegar; registrar só para quem escreve). */
  people: { id: string; preferredName: string }[]
  /** Contadores discretos da sidebar (mesma fonte da lista da home). */
  counts: NavCounts
  thresholds: AlertThresholds
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [segmentLabels, setSegmentLabels] = React.useState<Record<string, string>>({})
  const crumbLabels = React.useMemo(
    () => ({
      set: (segment: string, label: string) =>
        setSegmentLabels((current) => (current[segment] === label ? current : { ...current, [segment]: label })),
    }),
    [],
  )

  // Fecha o drawer quando a rota muda (inclusive por voltar/avançar do navegador).
  React.useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    persistCollapsed(next)
  }

  return (
    <ToastProvider>
    <div className="flex min-h-svh">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-sm bg-surface px-3 py-2 text-sm font-medium text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {labels.shell.skipToContent}
      </a>

      <Sidebar pathname={pathname} collapsed={collapsed} onToggle={toggleCollapsed} user={user} counts={counts} modules={modules} />

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-[264px] gap-0 p-0">
          <SheetTitle className="sr-only">{labels.shell.mainNavigation}</SheetTitle>
          <SheetDescription className="sr-only">{labels.app.name}</SheetDescription>
          <ProductIdentity />
          <SidebarNav
            pathname={pathname}
            counts={counts}
            modules={modules}
            onNavigate={() => setDrawerOpen(false)}
            footer={<CurrentUser user={user} />}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <ContextBar
          className="sticky top-0 z-30"
          crumbs={crumbsFor(pathname, segmentLabels)}
          onOpenNavigation={() => setDrawerOpen(true)}
          actionsSlotId={CONTEXT_ACTIONS_ID}
          readOnly={user.level === "VIEWER"}
          onOpenSearch={openCommandPalette}
        />
        <main id="conteudo" className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 py-6 md:px-6">
          <CrumbLabelsContext value={crumbLabels}>
            <ThresholdsProvider value={thresholds}>
              <QuickAgreementProvider members={agreementMembers} centrals={centrals}>
                {children}
                <CommandPalette people={people} canWrite={user.level === "MANAGER"} modules={modules} />
              </QuickAgreementProvider>
            </ThresholdsProvider>
          </CrumbLabelsContext>
        </main>
      </div>
    </div>
    </ToastProvider>
  )
}
