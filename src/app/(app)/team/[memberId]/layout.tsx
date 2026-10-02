import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ProfileActions } from "@/components/member/profile-actions"
import { CrumbLabel } from "@/components/shell/crumb-label"
import { RouteTabs } from "@/components/ui/route-tabs"
import { labels } from "@/lib/labels"
import { canWrite } from "@/server/access"
import { getMemberForEdit, getMemberFormCatalogs } from "@/server/queries/members"

import { ProfileHeader } from "./_components/profile-header"
import { loadProfile } from "./data"

type Params = { params: Promise<{ memberId: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { profile } = await loadProfile((await params).memberId)
  return { title: `${profile?.preferredName ?? labels.nav.team} · ${labels.app.name}` }
}

/**
 * Perfil da pessoa: cabeçalho sempre visível e abas em rota (linkáveis).
 * A aba ativa é a rota; nada de estado local.
 */
export default async function MemberLayout({ children, params }: Params & { children: React.ReactNode }) {
  const { memberId } = await params
  const { user, profile } = await loadProfile(memberId)
  if (!profile) notFound()

  // Pessoa desativada: perfil só de leitura (o histórico continua acessível).
  const writable = canWrite(user) && profile.status !== "INACTIVE"
  const [catalogs, forEdit] = writable
    ? await Promise.all([getMemberFormCatalogs(user), getMemberForEdit(user, profile.id)])
    : [null, null]

  const base = `/team/${profile.id}`
  const T = labels.profile.tabs

  return (
    <div className="flex flex-col gap-6">
      <CrumbLabel segment={profile.id} label={profile.preferredName} />
      <div className="flex flex-col gap-4">
        <ProfileHeader
          profile={profile}
          actions={catalogs && forEdit ? <ProfileActions member={forEdit} catalogs={catalogs} /> : null}
        />
        <RouteTabs
          label={T.label}
          tabs={[
            { href: base, label: T.overview, exact: true },
            { href: `${base}/timeline`, label: T.timeline },
            { href: `${base}/agreements`, label: T.agreements },
            { href: `${base}/development`, label: T.development },
            { href: `${base}/records`, label: T.records },
          ]}
        />
      </div>
      {children}
    </div>
  )
}
