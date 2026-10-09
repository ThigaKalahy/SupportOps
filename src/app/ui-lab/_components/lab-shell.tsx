"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"

import { ContextBar } from "@/components/shell/context-bar"
import { crumbsFor, mainNav } from "@/components/shell/nav-config"
import { NavLink } from "@/components/shell/nav-link"
import { CurrentUser, ProductIdentity, SidebarNav, type NavCounts } from "@/components/shell/sidebar"
import { TeamList, type TeamOption } from "@/components/teams/team-list"
import { TeamSwitcher } from "@/components/teams/team-switcher"
import { MODULE_KEYS } from "@/lib/modules"

/** Todos os módulos ligados, como no time do Suporte. */
const LAB_MODULES = MODULE_KEYS

/** Contadores do motor de alertas (P15), como o seed os produz. */
const LAB_COUNTS: NavCounts = { today: 11, watch: 3, team: 6, agreements: 6, validations: 2, dailies: 0, records: 4, development: 1 }

/** Times de quem acompanha mais de um (P23). */
const LAB_TEAMS: TeamOption[] = [
  { id: "lab-suporte", name: "Suporte N1/N2", level: "MANAGER", members: 9 },
  { id: "lab-treinamento", name: "Treinamento", level: "VIEWER", members: 4 },
  { id: "lab-implantacao", name: "Implantação", level: "VIEWER", members: 1 },
]
const LAB_ACTIVE = { id: "lab-suporte", name: "Suporte N1/N2" }
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
        <Specimen state="TeamSwitcher · um time (texto, não controle)">
          <div className="w-[232px] rounded-lg border border-line bg-surface">
            <TeamSwitcher teams={LAB_TEAMS.slice(0, 1)} activeTeam={LAB_ACTIVE} />
          </div>
        </Specimen>
        <Specimen state="TeamSwitcher · vários times">
          <div className="w-[232px] rounded-lg border border-line bg-surface">
            <TeamSwitcher teams={LAB_TEAMS} activeTeam={LAB_ACTIVE} />
          </div>
        </Specimen>
        <Specimen state="TeamSwitcher · 56px">
          <div className="w-14 rounded-lg border border-line bg-surface">
            <TeamSwitcher teams={LAB_TEAMS} activeTeam={LAB_ACTIVE} collapsed />
          </div>
        </Specimen>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Specimen state={`TeamList · ${S.default}`}>
          <div className="w-[360px] overflow-hidden rounded-lg border border-line bg-surface">
            <TeamList teams={LAB_TEAMS} onSelect={() => {}} />
          </div>
        </Specimen>
        <Specimen state={`TeamList · ${S.selected} (time atual)`}>
          <div className="w-[360px] overflow-hidden rounded-lg border border-line bg-surface">
            <TeamList teams={LAB_TEAMS} activeId={LAB_ACTIVE.id} onSelect={() => {}} />
          </div>
        </Specimen>
        <Specimen state="TeamList · abrindo">
          <div className="w-[360px] overflow-hidden rounded-lg border border-line bg-surface">
            <TeamList teams={LAB_TEAMS} activeId={LAB_ACTIVE.id} pendingId="lab-treinamento" onSelect={() => {}} />
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

      <Specimen state="ContextBar · mais de um time (time ativo sempre à vista)" className="w-full">
        <div className="w-full overflow-hidden rounded-lg border border-line">
          <ContextBar
            className="border-b-0"
            crumbs={[...crumbsFor("/team"), { label: labels.nav.timeline, href: "/team/exemplo/timeline" }]}
            onOpenNavigation={() => {}}
            teamName={LAB_ACTIVE.name}
          />
        </div>
      </Specimen>

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
