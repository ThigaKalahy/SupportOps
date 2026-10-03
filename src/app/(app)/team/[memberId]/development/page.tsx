import { notFound } from "next/navigation"

import { CompetencyList } from "@/components/development/competency-list"
import { MentorshipSection } from "@/components/development/mentorship-section"
import { NewPlanButton } from "@/components/development/new-plan-button"
import { PlanBlock } from "@/components/development/plan-block"
import { TraitsSection } from "@/components/development/traits-section"
import { ContextActions } from "@/components/shell/context-actions"
import { EmptyState } from "@/components/ui/empty-state"
import { Section } from "@/components/ui/section"
import { fill, labels } from "@/lib/labels"
import { canWrite } from "@/server/access"
import { listAgreementMembers } from "@/server/queries/agreements"
import { getMemberDevelopment } from "@/server/queries/development"

import { loadProfile } from "../data"

const D = labels.development

/**
 * Desenvolvimento da pessoa: PDIs (ativos primeiro, parados em destaque),
 * competências contra o esperado da senioridade atual e da próxima, a
 * prontidão (só quando se aplica), mentorias e pontos fortes/de
 * desenvolvimento com o histórico.
 */
export default async function MemberDevelopmentPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params
  const { user, profile } = await loadProfile(memberId)
  if (!profile) notFound()

  const [dev, members] = await Promise.all([getMemberDevelopment(user, profile.id), listAgreementMembers(user)])
  if (!dev) notFound()
  const writer = canWrite(user) && profile.status !== "INACTIVE"
  const active = dev.plans.filter((p) => p.status === "ACTIVE" || p.status === "PAUSED")
  const others = dev.plans.filter((p) => p.status !== "ACTIVE" && p.status !== "PAUSED")
  const mentors = members.filter((m) => m.id !== profile.id)
  const editOptions = { competencies: dev.competencies.map((c) => ({ id: c.id, name: c.name })), mentors }

  return (
    <div className="flex flex-col gap-8">
      {writer ? (
        <ContextActions>
          <NewPlanButton
            member={{ id: profile.id, preferredName: profile.preferredName }}
            competencies={dev.competencies.map((c) => ({ id: c.id, name: c.name }))}
            mentors={mentors}
          />
        </ContextActions>
      ) : null}

      <Section title={D.plans.title} count={dev.plans.length}>
        {dev.plans.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line">
            <EmptyState size="compact" title={D.plans.empty} direction={D.plans.emptyDirection} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {active.map((p) => (
              <PlanBlock key={p.id} plan={p} canWrite={writer} edit={writer ? editOptions : undefined} />
            ))}
            {others.length > 0 ? (
              <details className="group" open={active.length === 0}>
                <summary className="cursor-pointer text-xs text-ink-secondary hover:text-ink">
                  {D.plans.others} · {others.length}
                </summary>
                <div className="mt-3 flex flex-col gap-4">
                  {others.map((p) => (
                    <PlanBlock key={p.id} plan={p} canWrite={writer} edit={writer ? editOptions : undefined} />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        )}
      </Section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(300px,400px)]">
        <CompetencyList competencies={dev.competencies} seniority={dev.seniority} matrixEmpty={dev.matrixEmpty} canWrite={writer} />
        <div className="flex flex-col gap-8">
          {dev.readiness ? (
            <Section title={D.readiness.title}>
              <p className="text-sm text-ink">
                {fill(D.readiness.line, {
                  seniority: dev.readiness.next.label,
                  met: dev.readiness.met,
                  total: dev.readiness.total,
                })}
              </p>
            </Section>
          ) : null}
          <MentorshipSection
            member={{ id: profile.id, preferredName: profile.preferredName }}
            mentorships={dev.mentorships}
            people={mentors}
            competencies={editOptions.competencies}
            canWrite={writer}
          />
        </div>
      </div>

      <TraitsSection traits={dev.traits} member={{ id: profile.id, preferredName: profile.preferredName }} canWrite={writer} />
    </div>
  )
}
