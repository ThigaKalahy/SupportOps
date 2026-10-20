import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { logoutAction } from "@/actions/auth"
import { PortalLive } from "@/components/member-portal/portal-live"
import { HistoryZone, LastDailyZone } from "@/components/member-portal/portal-zones"
import { Button } from "@/components/ui/button"
import { formatDateLong, todayBusinessDate } from "@/lib/dates"
import { labels } from "@/lib/labels"
import { getCurrentUser } from "@/server/access"
import { MemberAccessError, requireMemberContext, type MemberContext } from "@/server/member-scope"
import {
  getMyAgreementHistory,
  getMyBlockerReasons,
  getMyLastDailyRecord,
  getMyOpenAgreements,
  getMyPortalState,
} from "@/server/queries/member-portal"
import { accessibleTeamIds } from "@/server/scope"

const L = labels.memberPortal

export const metadata: Metadata = {
  title: `${L.title} · ${labels.app.name}`,
}

/**
 * /me — a tela única do colaborador (P25), somente leitura. O contexto vem de
 * `requireMemberContext` (pessoa ativa, TeamAccess MEMBER no time ativo); as leituras,
 * só de src/server/queries/member-portal.ts (D38). Sem contexto: sem sessão vai para o
 * login; quem tem acesso de gestor ou leitura volta para as telas dele; o resto vê o
 * aviso (pessoa desativada, acesso revogado) — sem redirecionar em círculo.
 */
export default async function MemberHomePage() {
  let ctx: MemberContext
  try {
    ctx = await requireMemberContext()
  } catch (error) {
    if (!(error instanceof MemberAccessError)) throw error
    if (error.reason === "unauthenticated") redirect("/login")
    const user = await getCurrentUser()
    if (user && (await accessibleTeamIds(user.id)).length > 0) redirect("/")
    return (
      <>
        <PortalHeader name={user?.name ?? ""} />
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-4">
          <h1 className="text-base font-semibold text-ink">{L.noAccessTitle}</h1>
          <p className="text-sm text-ink-secondary">{error.message}</p>
        </section>
      </>
    )
  }

  const [open, last, history, reasons, state] = await Promise.all([
    getMyOpenAgreements(ctx),
    getMyLastDailyRecord(ctx),
    getMyAgreementHistory(ctx, 20),
    getMyBlockerReasons(ctx),
    getMyPortalState(ctx),
  ])

  // P26: a parte viva (relato, propostas, travamento) recomeça quando chega uma daily nova.
  return (
    <PortalLive
      key={state.lastClosedDailyId ?? "none"}
      initialState={state}
      agreements={open}
      reasons={reasons}
      header={<PortalHeader name={ctx.preferredName} />}
    >
      <LastDailyZone record={last} />
      <HistoryZone agreements={history} />
    </PortalLive>
  )
}

/** Cabeçalho mínimo: nome, data de hoje e sair. Alvo de toque de 44px. */
function PortalHeader({ name }: { name: string }) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-line pb-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-ink">{name}</h1>
        <p className="text-sm text-ink-secondary first-letter:uppercase">{formatDateLong(todayBusinessDate(), "business")}</p>
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="secondary" className="min-h-11">
          {L.signOut}
        </Button>
      </form>
    </header>
  )
}
