"use client"

import * as React from "react"
import { PencilIcon } from "lucide-react"

import { updateDaily } from "@/actions/dailies"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { MetaLabel } from "@/components/ui/meta-label"
import { Textarea } from "@/components/ui/textarea"
import { fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { editDailySchema, type EditDailyInput } from "@/lib/validators/daily"
import type { DailyDetail } from "@/server/queries/dailies"

const L = labels.dailies
const E = L.edit

type Participant = EditDailyInput["participants"][number] & { name: string }

function initial(daily: DailyDetail): { summary: string; decisions: string; participants: Participant[] } {
  const present = daily.present.map((p) => ({
    memberId: p.memberId,
    name: p.name,
    present: true,
    note: p.blocker ?? p.note ?? "",
    isBlocker: p.blocker !== null,
  }))
  const absent = daily.absent.map((p) => ({ memberId: p.memberId, name: p.name, present: false, note: "", isBlocker: false }))
  return {
    summary: daily.summary ?? "",
    decisions: daily.decisions ?? "",
    participants: [...present, ...absent].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/**
 * Edita uma daily salva: resumo, decisões, presença e notas. Revisões e
 * combinados criados ficam como estão — já mudaram os combinados. Ctrl+Enter salva.
 */
export function EditDailyButton({ daily }: { daily: DailyDetail }) {
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState(() => initial(daily))
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const summaryRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (!open) return
    setState(initial(daily))
    setError(null)
  }, [open, daily])

  function patch(memberId: string, change: Partial<Participant>) {
    setState((s) => ({ ...s, participants: s.participants.map((p) => (p.memberId === memberId ? { ...p, ...change } : p)) }))
  }

  function submit(event?: React.FormEvent) {
    event?.preventDefault()
    const input: EditDailyInput = {
      id: daily.id,
      summary: state.summary,
      decisions: state.decisions,
      participants: state.participants.map(({ memberId, present, note, isBlocker }) => ({ memberId, present, note, isBlocker })),
    }
    const parsed = editDailySchema.safeParse(input)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? labels.validation.generic)
    setError(null)
    startTransition(async () => {
      const result = await updateDaily(parsed.data)
      if (result.ok) setOpen(false)
      else setError(result.error)
    })
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <PencilIcon />
        {E.button}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent
          className="max-h-[90svh] overflow-y-auto"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            summaryRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{E.title}</DialogTitle>
            <DialogDescription>{E.description}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={submit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                submit()
              }
            }}
            className="flex flex-col gap-4"
            noValidate
          >
            <FieldGroup label={L.extra.summary} optional>
              <Textarea
                ref={summaryRef}
                rows={2}
                value={state.summary}
                onChange={(e) => setState((s) => ({ ...s, summary: e.target.value }))}
              />
            </FieldGroup>
            <FieldGroup label={L.extra.decisions} optional>
              <Textarea rows={2} value={state.decisions} onChange={(e) => setState((s) => ({ ...s, decisions: e.target.value }))} />
            </FieldGroup>
            <div className="flex flex-col gap-1.5">
              <MetaLabel>{L.participants.title}</MetaLabel>
              <ul className="rounded-lg border border-line bg-surface">
                {state.participants.map((p) => (
                  <li
                    key={p.memberId}
                    className={cn(
                      "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-3 py-1.5 last:border-b-0",
                      !p.present && "bg-surface-sunken",
                    )}
                  >
                    <Checkbox
                      checked={p.present}
                      aria-label={`${L.participants.present}: ${p.name}`}
                      onCheckedChange={(c) => patch(p.memberId, { present: c === true })}
                    />
                    <span className={cn("min-w-0 flex-1 truncate text-sm", p.present ? "text-ink" : "text-ink-secondary line-through")}>
                      {p.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-pressed={p.isBlocker}
                      title={p.isBlocker ? L.participants.unmarkBlocker : L.participants.markBlocker}
                      onClick={() => patch(p.memberId, { isBlocker: !p.isBlocker })}
                      className={cn("shrink-0", p.isBlocker && "bg-overdue-wash text-overdue hover:bg-overdue-wash hover:text-overdue")}
                    >
                      {L.participants.blocker}
                    </Button>
                    <Input
                      value={p.note}
                      maxLength={1000}
                      autoComplete="off"
                      aria-label={fill(L.participants.notePlaceholder, { name: p.name })}
                      placeholder={fill(L.participants.notePlaceholder, { name: p.name })}
                      className={cn("h-8 basis-full", p.isBlocker && "border-overdue")}
                      onChange={(e) => patch(p.memberId, { note: e.target.value })}
                    />
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-ink-secondary">{E.notEditable}</p>
            <FormError message={error} />
            <DialogFooter className="items-center sm:justify-between">
              <p className="font-mono text-2xs text-ink-secondary max-sm:hidden">{E.shortcut}</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                  {labels.common.cancel}
                </Button>
                <Button type="submit" loading={pending}>
                  {E.submit}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
