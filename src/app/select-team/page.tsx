import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { logoutAction } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { labels } from "@/lib/labels"
import { requireUser } from "@/server/access"
import { ACTIVE_TEAM_COOKIE, listAccessibleTeams } from "@/server/scope"

import { TeamPicker } from "./team-picker"

const T = labels.teams

export const metadata: Metadata = {
  title: `${T.selectTitle} · ${labels.app.name}`,
  robots: { index: false, follow: false },
}

/**
 * Escolha do time ativo (P23), depois do login, para quem tem acesso a mais de
 * um time — `requireTeamContext` manda para cá quando não há time ativo válido.
 * Fora do shell: não depende de time ativo. Quem tem um time só nunca vê esta
 * tela (volta para a home, que resolve sozinha); quem não tem nenhum lê o aviso.
 */
export default async function SelectTeamPage() {
  const user = await requireUser()
  const teams = await listAccessibleTeams(user.id)
  if (teams.length === 1) redirect("/")
  const current = (await cookies()).get(ACTIVE_TEAM_COOKIE)?.value
  const activeId = teams.some((t) => t.id === current) ? current! : null

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex size-6 items-center justify-center rounded-sm border border-line-strong font-mono text-xs font-medium text-ink"
            >
              P
            </span>
            <h1 className="text-lg font-semibold text-ink">{labels.app.name}</h1>
          </div>
          <p className="text-sm text-ink-secondary">{teams.length === 0 ? labels.access.noTeams : T.selectLead}</p>
        </div>
        {teams.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
            <p className="text-sm font-medium text-ink">{T.noTeamsTitle}</p>
            <form action={logoutAction}>
              <Button type="submit" variant="secondary" size="sm">
                {labels.auth.signOut}
              </Button>
            </form>
          </div>
        ) : (
          <TeamPicker teams={teams} activeId={activeId} />
        )}
      </div>
    </main>
  )
}
