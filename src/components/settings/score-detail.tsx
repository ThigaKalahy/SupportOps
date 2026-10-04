"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import {
  deleteScoreDefinition,
  newScoreVersion,
  removeScoreComponent,
  setScoreActive,
  setScoreComponent,
  updateScoreNotes,
} from "@/actions/score"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { DateStamp } from "@/components/ui/date-stamp"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { MetaLabel } from "@/components/ui/meta-label"
import { Section } from "@/components/ui/section"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { enumLabel, fill, labels } from "@/lib/labels"
import { activationProblems, isEditable } from "@/lib/score-composition"
import { fieldErrorsOf } from "@/lib/validators/fields"
import { scoreComponentSchema } from "@/lib/validators/score"
import type { ScoreComponentView, ScoreDefinitionView } from "@/server/queries/score"

import { ScoreStatus, WeightSumText } from "./score-list"

const S = labels.settings.score
const D = S.detail

type Metric = { id: string; key: string; label: string; unit: string | null; direction: ScoreComponentView["direction"] }

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })

/**
 * Uma versão de definição de score: notas, composição (métrica, direção,
 * peso, faixa) e as ações de versionamento. Rascunho edita; ativa (ou com
 * resultado) fica travada — mudar exige versão nova. Nada é calculado.
 */
export function ScoreDetail({
  definition,
  versions,
  metrics,
  canWrite,
}: {
  definition: ScoreDefinitionView
  versions: { id: string; version: number; isActive: boolean; createdAt: Date }[]
  metrics: Metric[]
  canWrite: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const editable = canWrite && isEditable(definition)
  const [editing, setEditing] = React.useState<ScoreComponentView | "new" | null>(null)
  const [confirm, setConfirm] = React.useState<"activate" | "delete" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  const problems = activationProblems(definition.components)

  function run(action: () => Promise<{ ok: boolean; error?: string; id?: string }>, done: string, then?: (result: { id?: string }) => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) return setError(result.error ?? labels.validation.generic)
      toast.show(done)
      then?.(result)
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link href="/settings/score" className="text-xs text-accent hover:underline">
          ← {D.back}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              {definition.name}
              <span className="font-mono text-sm font-normal text-ink-secondary">{fill(S.versionLabel, { version: definition.version })}</span>
            </h2>
            <span className="flex items-center gap-2 text-xs text-ink-secondary">
              <ScoreStatus definition={definition} />
              <DateStamp date={definition.createdAt} />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/settings/score/${definition.id}/preview`}>{D.preview}</Link>
            </Button>
            {canWrite ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => newScoreVersion({ scoreDefinitionId: definition.id }), labels.toast.scoreVersion, (r) => r.id && router.push(`/settings/score/${r.id}`))}
                >
                  {D.newVersion}
                </Button>
                {definition.isActive ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => setScoreActive({ scoreDefinitionId: definition.id, active: false }), labels.toast.scoreDeactivated)}
                  >
                    {D.deactivate}
                  </Button>
                ) : (
                  <Button size="sm" disabled={pending || problems.length > 0} onClick={() => setConfirm("activate")}>
                    {D.activate}
                  </Button>
                )}
                {editable ? (
                  <Button variant="ghost" size="sm" className="text-overdue" disabled={pending} onClick={() => setConfirm("delete")}>
                    {D.delete}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        <FormError message={error} />
        {canWrite && !editable ? <p className="text-xs text-ink-secondary">{D.lockedHelp}</p> : null}
      </div>

      <Section
        title={D.components}
        count={definition.components.length}
        action={
          editable ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing("new")}>
              <PlusIcon />
              {D.add}
            </Button>
          ) : undefined
        }
      >
        <p className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
          {D.sum}: <WeightSumText components={definition.components} /> · {D.sumHelp}
        </p>
        {definition.components.length === 0 ? (
          <p className="text-sm text-ink-secondary">{D.componentsEmpty}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken text-left font-mono text-2xs tracking-wide text-ink-secondary uppercase">
                  <th scope="col" className="px-3 py-2 font-medium">{D.metric}</th>
                  <th scope="col" className="w-36 px-3 py-2 font-medium">{D.direction}</th>
                  <th scope="col" className="w-24 px-3 py-2 text-right font-medium">{D.weight}</th>
                  <th scope="col" className="w-44 px-3 py-2 font-medium">{D.range}</th>
                  {editable ? <th scope="col" className="w-36 px-3 py-2"><span className="sr-only">{labels.settings.columns.actions}</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {definition.components.map((c) => (
                  <tr key={c.metricDefinitionId} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <span className="text-ink">{c.label}</span>{" "}
                      <span className="font-mono text-2xs text-ink-secondary">{c.key}</span>
                      {c.metricActive ? null : <span className="text-xs text-ink-secondary"> · {D.inactiveMetric}</span>}
                    </th>
                    <td className="px-3 py-2 text-ink-secondary">{enumLabel("metricDirection", c.direction)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(c.weight)}</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {fill(D.rangeText, { min: fmt(c.normalizationMin), max: fmt(c.normalizationMax) })} {c.unit ?? ""}
                    </td>
                    {editable ? (
                      <td className="px-3 py-1.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                          {D.edit}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          aria-label={fill(D.removeLabel, { metric: c.label })}
                          onClick={() => run(() => removeScoreComponent({ scoreDefinitionId: definition.id, metricDefinitionId: c.metricDefinitionId }), labels.toast.componentSaved)}
                        >
                          {D.remove}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <NotesSection definition={definition} editable={editable} />

      {versions.length > 1 ? (
        <Section title={D.versions} count={versions.length}>
          <ul className="flex flex-col">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 border-b border-line py-1.5 text-sm last:border-b-0">
                {v.id === definition.id ? (
                  <span className="font-mono font-medium text-ink">{fill(S.versionLabel, { version: v.version })}</span>
                ) : (
                  <Link href={`/settings/score/${v.id}`} className="font-mono text-accent hover:underline">
                    {fill(S.versionLabel, { version: v.version })}
                  </Link>
                )}
                <ScoreStatus definition={v} />
                <DateStamp date={v.createdAt} className="text-ink-secondary" />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {editable ? (
        <ComponentDialog
          definitionId={definition.id}
          component={editing}
          metrics={metrics.filter((m) => editing !== "new" || !definition.components.some((c) => c.metricDefinitionId === m.id))}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      ) : null}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            cancelRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {confirm === "delete"
                ? D.deleteDialog.title
                : fill(D.activateDialog.title, { version: definition.version })}
            </DialogTitle>
            <DialogDescription>
              {fill(confirm === "delete" ? D.deleteDialog.description : D.activateDialog.description, {
                name: definition.name,
                version: definition.version,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button ref={cancelRef} type="button" variant="secondary" onClick={() => setConfirm(null)}>
              {labels.common.cancel}
            </Button>
            <Button
              type="button"
              variant={confirm === "delete" ? "destructive" : "default"}
              loading={pending}
              onClick={() => {
                const which = confirm
                setConfirm(null)
                if (which === "delete") {
                  run(() => deleteScoreDefinition({ scoreDefinitionId: definition.id }), labels.toast.scoreDeleted, () => router.push("/settings/score"))
                } else {
                  run(() => setScoreActive({ scoreDefinitionId: definition.id, active: true }), labels.toast.scoreActivated)
                }
              }}
            >
              {confirm === "delete" ? D.deleteDialog.confirm : D.activateDialog.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NotesSection({ definition, editable }: { definition: ScoreDefinitionView; editable: boolean }) {
  const toast = useToast()
  const [notes, setNotes] = React.useState(definition.notes ?? "")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  React.useEffect(() => setNotes(definition.notes ?? ""), [definition.notes])

  if (!editable) {
    return (
      <Section title={D.notes}>
        <p className={definition.notes ? "max-w-3xl text-sm whitespace-pre-line text-ink" : "text-sm text-ink-secondary"}>
          {definition.notes ?? D.notesEmpty}
        </p>
      </Section>
    )
  }
  return (
    <Section title={D.notes}>
      <div className="flex max-w-3xl flex-col gap-2">
        <Textarea rows={3} aria-label={D.notes} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <FormError message={error} />
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          loading={pending}
          disabled={notes === (definition.notes ?? "")}
          onClick={() =>
            startTransition(async () => {
              const result = await updateScoreNotes({ scoreDefinitionId: definition.id, notes })
              if (!result.ok) return setError(result.error)
              setError(null)
              toast.show(labels.toast.recordUpdated)
            })
          }
        >
          {D.saveNotes}
        </Button>
      </div>
    </Section>
  )
}

function ComponentDialog({
  definitionId,
  component,
  metrics,
  onOpenChange,
}: {
  definitionId: string
  /** "new" inclui; um componente edita; null fecha. */
  component: ScoreComponentView | "new" | null
  metrics: Metric[]
  onOpenChange: (open: boolean) => void
}) {
  const toast = useToast()
  const [metricId, setMetricId] = React.useState("")
  const [weight, setWeight] = React.useState("")
  const [min, setMin] = React.useState("")
  const [max, setMax] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const existing = component && component !== "new" ? component : null

  React.useEffect(() => {
    if (!component) return
    setMetricId(existing?.metricDefinitionId ?? "")
    setWeight(existing ? String(existing.weight).replace(".", ",") : "")
    setMin(existing ? String(existing.normalizationMin).replace(".", ",") : "")
    setMax(existing ? String(existing.normalizationMax).replace(".", ",") : "")
    setErrors({})
    setFormError(null)
  }, [component, existing])

  // Números em pt-BR: vírgula decimal.
  const num = (text: string) => (text.trim() === "" ? Number.NaN : Number(text.replace(/\./g, "").replace(",", ".")))

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = scoreComponentSchema.safeParse({
      scoreDefinitionId: definitionId,
      metricDefinitionId: metricId,
      weight: num(weight),
      normalizationMin: num(min),
      normalizationMax: num(max),
    })
    if (!parsed.success) return setErrors(fieldErrorsOf(parsed.error))
    startTransition(async () => {
      const result = await setScoreComponent(parsed.data)
      if (!result.ok) {
        setFormError(result.error)
        setErrors(result.fieldErrors ?? {})
        return
      }
      toast.show(labels.toast.componentSaved)
      onOpenChange(false)
    })
  }

  const metric = metrics.find((m) => m.id === metricId) ?? (existing ? { unit: existing.unit } : null)

  return (
    <Dialog open={component !== null} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? fill(D.editTitle, { metric: existing.label }) : D.addTitle}</DialogTitle>
          <DialogDescription>{D.addDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {existing ? (
            <div className="flex flex-col gap-1">
              <MetaLabel>{D.metric}</MetaLabel>
              <span className="text-sm text-ink">
                {existing.label} · {enumLabel("metricDirection", existing.direction)}
              </span>
            </div>
          ) : (
            <FieldGroup label={D.metric} required error={errors.metricDefinitionId}>
              {(control) => (
                <Select value={metricId} onValueChange={setMetricId}>
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue placeholder={D.metric} />
                  </SelectTrigger>
                  <SelectContent>
                    {metrics.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label} · {enumLabel("metricDirection", m.direction)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <FieldGroup label={D.weight} required error={errors.weight}>
              <Input inputMode="decimal" autoComplete="off" className="font-mono" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </FieldGroup>
            <FieldGroup label={D.min} required error={errors.normalizationMin} help={metric?.unit ?? undefined}>
              <Input inputMode="decimal" autoComplete="off" className="font-mono" value={min} onChange={(e) => setMin(e.target.value)} />
            </FieldGroup>
            <FieldGroup label={D.max} required error={errors.normalizationMax} help={metric?.unit ?? undefined}>
              <Input inputMode="decimal" autoComplete="off" className="font-mono" value={max} onChange={(e) => setMax(e.target.value)} />
            </FieldGroup>
          </div>
          <FormError message={formError} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {D.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
