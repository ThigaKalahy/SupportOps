import type { Metadata } from "next"
import { cookies } from "next/headers"
import { cache } from "react"

import { AppShell } from "@/components/shell/app-shell"
import { SIDEBAR_COLLAPSED_VALUE, SIDEBAR_COOKIE } from "@/components/shell/constants"
import { labels } from "@/lib/labels"
import { MODULES } from "@/lib/modules"
import { requireUser } from "@/server/access"
import { listAgreementMembers } from "@/server/queries/agreements"
import { listActiveCentrals } from "@/server/queries/centrals"
import { canWrite, hasModule, listAccessibleTeams, requireTeamContext } from "@/server/scope"

import { loadAlerts, loadThresholds } from "./alerts-data"

/** Times do usuário e o ativo, uma vez por requisição (layout e metadata). */
const loadTeams = cache(async () => {
  const ctx = await requireTeamContext()
  const teams = await listAccessibleTeams(ctx.userId)
  const active = teams.find((t) => t.id === ctx.teamId)
  return { teams, activeTeam: { id: ctx.teamId, name: active?.name ?? "" } }
})

/**
 * Com mais de um time, o nome do time ativo entra no <title> de toda página, para
 * abas de times diferentes serem distinguíveis (P23). Com um só, nada muda.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { teams, activeTeam } = await loadTeams()
  if (teams.length <= 1) return {}
  return { title: { template: `%s · ${activeTeam.name}`, default: `${labels.app.name} · ${activeTeam.name}` } }
}

/**
 * Shell autenticado. O middleware já barra quem não tem sessão; requireUser()
 * é a segunda barreira e entrega o usuário ao shell. O time ativo vem de
 * requireTeamContext (revalidado contra TeamAccess a cada requisição, D30): dele
 * saem o nível (o que escrever) e os módulos ligados (o que navegar, D32). O
 * estado recolhido da sidebar vem do cookie, lido no servidor para não haver
 * salto na hidratação.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, ctx] = await Promise.all([requireUser(), requireTeamContext()])
  const writes = canWrite(ctx)
  const cookieStore = await cookies()
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED_VALUE
  const [members, alerts, thresholds, centrals, { teams, activeTeam }] = await Promise.all([
    listAgreementMembers(ctx),
    loadAlerts(),
    loadThresholds(),
    !hasModule(ctx, MODULES.CENTRALS) ? null : writes ? listActiveCentrals(ctx) : [],
    loadTeams(),
  ])
  const people = members.map((m) => ({ id: m.id, preferredName: m.preferredName }))
  const agreementMembers = writes ? people : null

  return (
    <AppShell
      defaultCollapsed={collapsed}
      user={{ name: user.name, email: user.email, level: ctx.level }}
      modules={[...ctx.modules]}
      teams={teams}
      activeTeam={activeTeam}
      agreementMembers={agreementMembers}
      centrals={centrals}
      people={people}
      counts={alerts.counts}
      thresholds={thresholds}
    >
      {children}
    </AppShell>
  )
}
