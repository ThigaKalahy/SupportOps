"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import { createScoreDefinition } from "@/actions/score"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { DateStamp } from "@/components/ui/date-stamp"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { StatusPill } from "@/components/ui/status-pill"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { fill, labels } from "@/lib/labels"
import { WEIGHT_TOTAL, weightSum } from "@/lib/score-composition"
import { fieldErrorsOf } from "@/lib/validators/fields"
import { createScoreDefinitionSchema } from "@/lib/validators/score"
import type { ScoreDefinitionView } from "@/server/queries/score"

const S = labels.settings.score

/** Soma dos pesos em texto: "100%", "80% · faltam 20" ou "120% · passa 20". */
export function WeightSumText({ components }: { components: { weight: number }[] }) {
  const sum = weightSum(components)
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
  if (sum === WEIGHT_TOTAL) return <StatusPill severity="calm" label={S.weightOk} />
  return (
    <span className="text-xs text-attention">
      {sum < WEIGHT_TOTAL
        ? fill(S.weightMissing, { sum: fmt(sum), missing: fmt(WEIGHT_TOTAL - sum) })
        : fill(S.weightOver, { sum: fmt(sum), over: fmt(sum - WEIGHT_TOTAL) })}
    </span>
  )
}

export function ScoreStatus({ definition }: { definition: Pick<ScoreDefinitionView, "isActive"> }) {
  return definition.isActive ? <StatusPill severity="calm" label={S.active} /> : <span className="text-xs text-ink-secondary">{S.draft}</span>
}

/** Todas as versões de todas as definições; clicar abre a versão. */
export function ScoreList({ definitions, canWrite }: { definitions: ScoreDefinitionView[]; canWrite: boolean }) {
  const [creating, setCreating] = React.useState(false)
  const C = S.columns
  const columns: DataTableColumn<ScoreDefinitionView>[] = [
    { id: "name", header: C.name, cell: (d) => <span className="truncate text-ink">{d.name}</span>, title: (d) => d.name, stacked: "primary" },
    { id: "version", header: C.version, cell: (d) => <span className="font-mono text-xs">{fill(S.versionLabel, { version: d.version })}</span>, width: "88px" },
    { id: "status", header: C.status, cell: (d) => <ScoreStatus definition={d} />, title: () => undefined, width: "112px" },
    { id: "components", header: C.components, cell: (d) => <span className="font-mono text-xs">{d.components.length}</span>, width: "96px" },
    { id: "weights", header: C.weights, cell: (d) => <WeightSumText components={d.components} />, title: () => undefined, width: "176px" },
    { id: "created", header: C.created, cell: (d) => <DateStamp date={d.createdAt} />, title: () => undefined, width: "112px", hideBelow: "lg" },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-ink-secondary">{S.direction}</p>
        {canWrite ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon />
            {S.new}
          </Button>
        ) : null}
      </div>
      {canWrite ? null : <p className="text-xs text-ink-secondary">{labels.settings.readOnly}</p>}
      <DataTable
        columns={columns}
        rows={definitions}
        getRowId={(d) => d.id}
        label={S.tableLabel}
        rowHref={(d) => `/settings/score/${d.id}`}
        empty={{ title: S.emptyTitle, direction: S.emptyDirection }}
      />
      {canWrite ? <CreateDialog open={creating} onOpenChange={setCreating} /> : null}
    </div>
  )
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const D = S.createDialog
  const router = useRouter()
  const toast = useToast()
  const ref = React.useRef<HTMLInputElement>(null)
  const [name, setName] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (!open) return
    setName("")
    setNotes("")
    setErrors({})
    setFormError(null)
  }, [open])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = createScoreDefinitionSchema.safeParse({ name, notes })
    if (!parsed.success) return setErrors(fieldErrorsOf(parsed.error))
    startTransition(async () => {
      const result = await createScoreDefinition(parsed.data)
      if (!result.ok) {
        setFormError(result.error)
        setErrors(result.fieldErrors ?? {})
        return
      }
      toast.show(labels.toast.scoreCreated)
      onOpenChange(false)
      if ("id" in result) router.push(`/settings/score/${result.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ref.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{D.title}</DialogTitle>
          <DialogDescription>{D.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FieldGroup label={D.name} required error={errors.name}>
            <Input ref={ref} value={name} maxLength={80} autoComplete="off" placeholder={D.namePlaceholder} onChange={(e) => setName(e.target.value)} />
          </FieldGroup>
          <FieldGroup label={D.notes} optional help={D.notesHelp} error={errors.notes}>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FieldGroup>
          <FormError message={formError} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {labels.common.cancel}
            </Button>
            <Button type="submit" loading={pending}>
              {D.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
