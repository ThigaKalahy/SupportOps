"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"

import { ContextBar } from "@/components/shell/context-bar"
import { crumbsFor, mainNav } from "@/components/shell/nav-config"
import { NavLink } from "@/components/shell/nav-link"
import { CurrentUser, ProductIdentity, SidebarNav, type NavCounts } from "@/components/shell/sidebar"
import { MODULE_KEYS } from "@/lib/modules"

/** Todos os módulos ligados, como no time do Suporte. */
const LAB_MODULES = MODULE_KEYS

/** Contadores do motor de alertas (P15), como o seed os produz. */
const LAB_COUNTS: NavCounts = { today: 11, watch: 3, team: 6, agreements: 6, validations: 2, dailies: 0, records: 4, development: 1 }
import { Button } from "@/components/ui/button"
import { labels } from "@/lib/labels"

import { demo } from "../_fixtures"
import { Specimen } from "./specimen"

const S = labels.uiLab.states

export function LabShell() {
  const team = mainNav[1]
  const agreements = mainNav[2]
  if (!team || !agreements) return null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-6">
        <Specimen state={S.default}>
          <div className="w-52">
            <NavLink item={team} active={false} />
          </div>
        </Specimen>
        <Specimen state={S.hover}>
          <div className="w-52">
            <NavLink item={team} active={false} data-force-state="hover" />
          </div>
        </Specimen>
        <Specimen state={S.focus}>
          <div className="w-52">
            <NavLink item={team} active={false} data-force-state="focus" />
          </div>
        </Specimen>
        <Specimen state={S.selected}>
          <div className="w-52">
            <NavLink item={agreements} active />
          </div>
        </Specimen>
        <Specimen state={`${S.compact} · ${S.selected}`}>
          <div className="flex w-8 flex-col gap-0.5">
            <NavLink item={team} active={false} collapsed />
            <NavLink item={agreements} active collapsed />
          </div>
        </Specimen>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Specimen state="Sidebar · 232px">
          <div className="flex h-[460px] w-[232px] flex-col rounded-lg border border-line bg-surface">
            <ProductIdentity />
            <SidebarNav pathname="/agreements" counts={LAB_COUNTS} modules={LAB_MODULES} />
          </div>
        </Specimen>
        <Specimen state="Sidebar · 56px">
          <div className="flex h-[460px] w-14 flex-col rounded-lg border border-line bg-surface">
            <ProductIdentity collapsed />
            <SidebarNav pathname="/agreements" counts={LAB_COUNTS} modules={LAB_MODULES} collapsed />
          </div>
        </Specimen>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Specimen state="CurrentUser · 232px">
          <div className="w-[208px]">
            <CurrentUser user={{ name: "Rafael Bittencourt", email: "rafael@exemplo.com.br", level: "MANAGER" }} />
          </div>
        </Specimen>
        <Specimen state="CurrentUser · 56px">
          <div className="w-8">
            <CurrentUser user={{ name: "Rafael Bittencourt", email: "rafael@exemplo.com.br", level: "VIEWER" }} collapsed />
          </div>
        </Specimen>
      </div>

      <Specimen state="ContextBar · VIEWER (somente leitura)" className="w-full">
        <div className="w-full overflow-hidden rounded-lg border border-line">
          <ContextBar className="border-b-0" crumbs={crumbsFor("/agreements")} onOpenNavigation={() => {}} readOnly />
        </div>
      </Specimen>

      <Specimen state="ContextBar · 48px" className="w-full">
        <div className="w-full overflow-hidden rounded-lg border border-line">
          <ContextBar
            className="border-b-0"
            crumbs={[...crumbsFor("/team"), { label: labels.nav.timeline, href: "/team/exemplo/timeline" }]}
            onOpenNavigation={() => {}}
            actions={
              <Button size="sm">
                <PlusIcon />
                {demo.pageAction}
              </Button>
            }
          />
        </div>
      </Specimen>
    </div>
  )
}
