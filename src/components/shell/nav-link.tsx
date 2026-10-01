"use client"

import * as React from "react"
import Link from "next/link"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href" | "children"> & {
  item: NavItem
  active: boolean
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
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
    </Link>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}
