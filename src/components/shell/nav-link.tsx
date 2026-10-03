"use client"

import * as React from "react"
import Link from "next/link"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

import type { NavItem } from "./nav-config"

/**
 * Item da navegação principal. Ativo: fundo --accent-wash, texto --ink e barra
 * inset de 2px em --accent à esquerda. Recolhido: só o ícone, com o rótulo em
 * tooltip e como nome acessível.
 */
export function NavLink({
  item,
  active,
  collapsed = false,
  onNavigate,
  count = 0,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href" | "children"> & {
  item: NavItem
  active: boolean
  collapsed?: boolean
  onNavigate?: () => void
  /** Contador discreto do motor de alertas (0 = nada a mostrar). */
  count?: number
}) {
  const Icon = item.icon
  const countText = count > 0 ? fill(labels.today.counters, { count }) : null
  const name = countText ? `${item.label}, ${countText}` : item.label

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed || countText ? name : undefined}
      onClick={onNavigate}
      data-active={active || undefined}
      className={cn(
        "relative flex h-8 items-center gap-2 overflow-hidden rounded-sm text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
        collapsed ? "justify-center px-0" : "px-2",
        active
          ? "bg-accent-wash font-medium text-ink before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent"
          : "text-ink-secondary hover:bg-surface-sunken hover:text-ink"
      )}
      {...props}
    >
      <Icon aria-hidden />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
      {count > 0 ? (
        <span
          aria-hidden
          className={cn(
            "font-mono text-2xs text-ink-secondary",
            collapsed ? "absolute top-0.5 right-1 leading-none" : "ml-auto pl-2",
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{name}</TooltipContent>
    </Tooltip>
  )
}
