"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"

import { createMentorship, endMentorship } from "@/actions/development"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Section } from "@/components/ui/section"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { formatDate, maskDateInput, todayBusinessDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { fieldErrorsOf } from "@/lib/validators/fields"
import { mentorshipSchema } from "@/lib/validators/development"

const M = labels.development.mentorships
const MD = M.dialog
const GENERAL = "general"

interface Person {
  id: string
  preferredName: string
}

export interface MentorshipView {
  id: string
  role: "mentor" | "mentee"
  other: Person
  competency: string | null
  startedAt: Date
}

/**
 * Mentorias da pessoa (nos dois sentidos), com registrar e encerrar para quem
 * escreve. Encerrar grava a data de fim — o vínculo sai do mapa, não é apagado.
 */
export function MentorshipSection({
  member,
  mentorships,
  people,
  competencies,
  canWrite,
}: {
  member: Person
  mentorships: MentorshipView[]
  /** O time, menos a própria pessoa. */
  people: Person[]
  competencies: { id: string; name: string }[]
  canWrite: boolean
}) {
  const [creating, setCreating] = React.useState(false)
  const [ending, setEnding] = React.useState<MentorshipView | null>(null)

  return (
    <Section
      title={M.title}
      count={mentorships.length}
      action={
        canWrite ? (
          <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
            <PlusIcon />
            {M.add}
          </Button>
        ) : undefined
      }
    >
      {mentorships.length === 0 ? (
        <p className="text-sm text-ink-secondary">{M.empty}</p>
      ) : (
        <ul className="flex flex-col">
          {mentorships.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-b-0">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm text-ink">
                  <span className="font-mono text-2xs tracking-wide text-ink-secondary uppercase">
                    {m.role === "mentor" ? labels.profile.mentorship.mentors : labels.profile.mentorship.mentoredBy}
                  </span>{" "}
                  {m.other.preferredName}
                </span>
                <span className="text-xs text-ink-secondary">
                  {m.competency ?? M.noCompetency} · {fill(M.since, { date: formatDate(m.startedAt, "business") })}
                </span>
              </span>
              {canWrite ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  aria-label={fill(M.endLabel, { name: m.other.preferredName })}
                  onClick={() => setEnding(m)}
                >
                  {M.end}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <>
          <NewMentorshipDialog open={creating} onOpenChange={setCreating} member={member} people={people} competencies={competencies} />
          <EndMentorshipDialog member={member} link={ending} onOpenChange={(open) => !open && setEnding(null)} />
        </>
      ) : null}
    </Section>
  )
}

function NewMentorshipDialog({
  open,
  onOpenChange,
  member,
  people,
  competencies,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: Person
  people: Person[]
  competencies: { id: string; name: string }[]
}) {
  const toast = useToast()
  const [role, setRole] = React.useState<"mentor" | "mentee">("mentor")
  const [other, setOther] = React.useState("")
  const [competencyId, setCompetencyId] = React.useState("")
  const [startedAt, setStartedAt] = React.useState("")
  const [note, setNote] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!open) return
    setRole("mentor")
    setOther("")
    setCompetencyId("")
    setStartedAt(formatDate(todayBusinessDate(), "business"))
    setNote("")
    setErrors({})
    setFormError(null)
  }, [open])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const input = {
      mentorMemberId: role === "mentor" ? member.id : other,
      menteeMemberId: role === "mentor" ? other : member.id,
      competencyId,
      startedAt,
      note,
    }
    const parsed = mentorshipSchema.safeParse(input)
    if (!parsed.success) {
      const found = fieldErrorsOf(parsed.error)
      // O campo "outra pessoa" é o mentor ou o mentorado, conforme o papel.
      return setErrors({ ...found, other: found[role === "mentor" ? "menteeMemberId" : "mentorMemberId"] ?? found.menteeMemberId ?? "" })
    }
    setErrors({})
    setFormError(null)
    startTransition(async () => {
      const result = await createMentorship(parsed.data)
      if (result.ok) {
        toast.show(labels.toast.mentorshipCreated)
        return onOpenChange(false)
      }
      setFormError(result.error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{MD.title}</DialogTitle>
          <DialogDescription>{MD.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label={fill(MD.role, { name: member.preferredName })}>
              {(control) => (
                <Select value={role} onValueChange={(v) => setRole(v as "mentor" | "mentee")}>
                  <SelectTrigger {...control} className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mentor">{MD.roles.mentor}</SelectItem>
                    <SelectItem value="mentee">{MD.roles.mentee}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            <FieldGroup label={role === "mentor" ? MD.mentee : MD.mentor} required error={errors.other || undefined}>
              {(control) => (
                <Select value={other} onValueChange={setOther}>
                  <SelectTrigger {...control} className="w-full min-w-0">
                    <SelectValue placeholder={MD.personPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.preferredName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <FieldGroup label={MD.competency} optional>
              {(control) => (
                <Select value={competencyId || GENERAL} onValueChange={(v) => setCompetencyId(v === GENERAL ? "" : v)}>
                  <SelectTrigger {...control} className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GENERAL}>{MD.general}</SelectItem>
                    {competencies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            <FieldGroup label={MD.startedAt} required error={errors.startedAt}>
              <Input
                value={startedAt}
                inputMode="numeric"
                autoComplete="off"
                placeholder={labels.forms.datePlaceholder}
                className="font-mono"
                onChange={(e) => setStartedAt(maskDateInput(e.target.value))}
              />
            </FieldGroup>
          </div>
          <FieldGroup label={MD.note} optional error={errors.note}>
            <Input value={note} maxLength={300} autoComplete="off" onChange={(e) => setNote(e.target.value)} />
          </FieldGroup>
          <FormError message={formError} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {MD.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EndMentorshipDialog({
  member,
  link,
  onOpenChange,
}: {
  member: Person
  link: MentorshipView | null
  onOpenChange: (open: boolean) => void
}) {
  const E = M.endDialog
  const toast = useToast()
  const keepRef = React.useRef<HTMLButtonElement>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (link) setError(null)
  }, [link])

  function confirm() {
    if (!link) return
    startTransition(async () => {
      const result = await endMentorship({ linkId: link.id })
      if (!result.ok) return setError(result.error)
      toast.show(labels.toast.mentorshipEnded)
      onOpenChange(false)
    })
  }

  const mentor = link?.role === "mentor" ? member.preferredName : (link?.other.preferredName ?? "")
  const mentee = link?.role === "mentor" ? (link.other.preferredName ?? "") : member.preferredName

  return (
    <Dialog open={link !== null} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          keepRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{E.title}</DialogTitle>
          <DialogDescription>
            {fill(E.description, { mentor, mentee, competency: link?.competency ?? M.noCompetency })}
          </DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        <DialogFooter>
          <Button ref={keepRef} type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {labels.common.cancel}
          </Button>
          <Button type="button" variant="destructive" onClick={confirm} loading={pending}>
            {E.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
