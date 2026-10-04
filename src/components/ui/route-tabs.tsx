"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

export interface RouteTab {
  href: string
  label: string
  /** Só a rota exata ativa a aba (ex.: a visão geral, que é a raiz das outras). */
  exact?: boolean
  /** Quantidade de itens da aba, em mono ao lado do rótulo. */
  count?: number
}

/**
 * Abas em rota: cada aba é um link (linkável, sobrevive a refresh, volta com o
 * navegador). Mesmo visual das Tabs "line" — sublinhado de 2px em --accent na
 * ativa. Em tela estreita a faixa rola na horizontal; a página, não.
 *
 * `activeHref` define a aba ativa quando ela não sai só do caminho — abas
 * que diferem pela query (?view=...) ou o /ui-lab.
 */
function RouteTabs({
  tabs,
  label,
  activeHref,
  className,
}: {
  tabs: RouteTab[]
  /** Nome acessível da navegação. */
  label: string
  activeHref?: string
  className?: string
}) {
  const pathname = usePathname()
  const current = activeHref ?? pathname
  const navRef = React.useRef<HTMLElement>(null)

  // Faixa que rola (tela estreita): a aba ativa entra na área visível, sem mexer na rolagem da página.
  React.useEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector<HTMLElement>("[aria-current=page]")
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return
    nav.scrollLeft = Math.max(0, active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2)
  }, [current])

  function isActive(tab: RouteTab) {
    return tab.exact ? current === tab.href : current === tab.href || current.startsWith(`${tab.href}/`)
  }

  return (
    <nav ref={navRef} data-slot="route-tabs" aria-label={label} className={cn("min-w-0 overflow-x-auto", className)}>
      <ul className="flex h-9 w-max min-w-full items-stretch gap-4 border-b border-line">
        {tabs.map((tab) => {
          const active = isActive(tab)
          return (
            <li key={tab.href} className="flex">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center text-sm font-medium whitespace-nowrap transition-colors -outline-offset-2",
                  "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5",
                  active ? "text-ink after:bg-accent" : "text-ink-secondary hover:text-ink",
                )}
              >
                {tab.label}
                {tab.count !== undefined ? (
                  <span className="ml-1.5 font-mono text-xs font-normal text-ink-secondary">{tab.count}</span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export { RouteTabs }
