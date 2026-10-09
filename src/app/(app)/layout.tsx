import { cookies } from "next/headers"

import { AppShell } from "@/components/shell/app-shell"
import { SIDEBAR_COLLAPSED_VALUE, SIDEBAR_COOKIE } from "@/components/shell/constants"
import { MODULES } from "@/lib/modules"
import { requireUser } from "@/server/access"
import { listAgreementMembers } from "@/server/queries/agreements"
import { listActiveCentrals } from "@/server/queries/centrals"
import { canWrite, hasModule, requireTeamContext } from "@/server/scope"

import { loadAlerts, loadThresholds } from "./alerts-data"

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
  const [members, alerts, thresholds, centrals] = await Promise.all([
    listAgreementMembers(ctx),
    loadAlerts(),
    loadThresholds(),
    !hasModule(ctx, MODULES.CENTRALS) ? null : writes ? listActiveCentrals(ctx) : [],
  ])
  const people = members.map((m) => ({ id: m.id, preferredName: m.preferredName }))
  const agreementMembers = writes ? people : null

  return (
    <AppShell
      defaultCollapsed={collapsed}
      user={{ name: user.name, email: user.email, level: ctx.level }}
      modules={[...ctx.modules]}
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
