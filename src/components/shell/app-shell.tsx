"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { labels } from "@/lib/labels"

import {
  CONTEXT_ACTIONS_ID,
  SIDEBAR_COLLAPSED_VALUE,
  SIDEBAR_COOKIE,
  SIDEBAR_COOKIE_MAX_AGE,
} from "./constants"
import { ContextBar } from "./context-bar"
import { crumbsFor } from "./nav-config"
import { ProductIdentity, Sidebar, SidebarNav } from "./sidebar"

function persistCollapsed(collapsed: boolean) {
  const value = collapsed ? SIDEBAR_COLLAPSED_VALUE : "expanded"
  document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`
}

/**
 * Shell da aplicação: sidebar (≥ 1024px) ou drawer (< 1024px), barra de
 * contexto de 48px e conteúdo fluido até 1600px.
 */
export function AppShell({ defaultCollapsed, children }: { defaultCollapsed: boolean; children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed)
  const [drawerOpen, setDrawerOpen] = React.useState(false)

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
    <div className="flex min-h-svh">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-sm bg-surface px-3 py-2 text-sm font-medium text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {labels.shell.skipToContent}
      </a>

      <Sidebar pathname={pathname} collapsed={collapsed} onToggle={toggleCollapsed} />

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-[264px] gap-0 p-0">
          <SheetTitle className="sr-only">{labels.shell.mainNavigation}</SheetTitle>
          <SheetDescription className="sr-only">{labels.app.name}</SheetDescription>
          <ProductIdentity />
          <SidebarNav pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <ContextBar
          className="sticky top-0 z-30"
          crumbs={crumbsFor(pathname)}
          onOpenNavigation={() => setDrawerOpen(true)}
          actionsSlotId={CONTEXT_ACTIONS_ID}
        />
        <main id="conteudo" className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 py-6 md:px-6">
          {children}
        </main>
      </div>
    </div>
  )
}
