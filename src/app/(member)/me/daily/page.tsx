import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { ConductDailyForm, OpenConductButton } from "@/components/member-portal/conduct-daily"
import { formatDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { getConductDaily } from "@/server/member-daily"
import { MemberAccessError, requireMemberContext, type MemberContext } from "@/server/member-scope"

const C = labels.conductDaily

export const metadata: Metadata = {
  title: `${C.title} · ${labels.app.name}`,
}

/**
 * /me/daily — o scrum master de hoje conduz e registra a daily (C19, D46). Só quem foi
 * sorteado hoje chega aqui (a ponte confere); o resto volta para /me.
 */
export default async function ConductDailyPage() {
  let ctx: MemberContext
  try {
    ctx = await requireMemberContext()
  } catch (error) {
    if (error instanceof MemberAccessError) redirect(error.reason === "unauthenticated" ? "/login" : "/me")
    throw error
  }
  const data = await getConductDaily(ctx)
  if (!data) redirect("/me")
  const date = formatDate(data.date, "business")

  return (
    <>
      <header className="flex flex-col gap-1 border-b border-line pb-4">
        <Link href="/me" className="min-h-11 self-start py-2 text-sm text-ink-secondary underline-offset-2 hover:text-ink hover:underline">
          {C.back}
        </Link>
        <h1 className="text-lg font-semibold text-ink">{C.title}</h1>
        <p className="text-sm text-ink-secondary">{fill(C.subtitle, { date })}</p>
      </header>
      {data.state === "closed" ? <p className="text-sm text-ink">{C.closed}</p> : null}
      {data.state === "other" ? <p className="text-sm text-ink">{fill(C.byOther, { name: data.name })}</p> : null}
      {data.state === "none" ? (
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-4">
          <p className="text-sm text-ink-secondary">{C.openHint}</p>
          <OpenConductButton />
        </section>
      ) : null}
      {data.state === "mine" ? <ConductDailyForm data={data} /> : null}
    </>
  )
}
