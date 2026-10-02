"use client"

import * as React from "react"
import { PencilIcon } from "lucide-react"

import { updateManagerSummary } from "@/actions/members"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Section } from "@/components/ui/section"
import { Textarea } from "@/components/ui/textarea"
import { labels } from "@/lib/labels"

const L = labels.profile.summary

/**
 * Resumo gerencial, editado no próprio lugar (sem dialog). Ctrl/⌘+Enter
 * salva, Esc cancela e devolve o foco ao botão de edição.
 */
export function SummaryEditor({
  memberId,
  summary,
  canEdit,
}: {
  memberId: string
  summary: string | null
  canEdit: boolean
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(summary ?? "")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const editButton = React.useRef<HTMLButtonElement>(null)

  function start() {
    setDraft(summary ?? "")
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
    setError(null)
    requestAnimationFrame(() => editButton.current?.focus())
  }

  function save() {
    startTransition(async () => {
      const result = await updateManagerSummary({ id: memberId, managerSummary: draft })
      if (!result.ok) return setError(result.error)
      setEditing(false)
      requestAnimationFrame(() => editButton.current?.focus())
    })
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      cancel()
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      save()
    }
  }

  const action =
    canEdit && !editing && summary ? (
      <Button ref={editButton} variant="ghost" size="sm" onClick={start}>
        <PencilIcon />
        {L.edit}
      </Button>
    ) : null

  return (
    <Section title={L.title} action={action}>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label={L.fieldLabel}
            rows={4}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={pending}
          />
          <FormError message={error} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-secondary">
              {L.visibleToViewer} <span className="font-mono text-2xs">{L.hint}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={cancel} disabled={pending}>
                {labels.common.cancel}
              </Button>
              <Button size="sm" onClick={save} loading={pending}>
                {L.save}
              </Button>
            </div>
          </div>
        </div>
      ) : summary ? (
        <p className="max-w-[72ch] text-base whitespace-pre-line text-ink">{summary}</p>
      ) : (
        <EmptyState
          size="compact"
          className="items-start rounded-lg border border-dashed border-line text-left"
          title={L.emptyTitle}
          direction={canEdit ? L.emptyDirection : L.emptyViewer}
          action={
            canEdit ? (
              <Button ref={editButton} variant="secondary" size="sm" onClick={start}>
                <PencilIcon />
                {L.write}
              </Button>
            ) : undefined
          }
        />
      )}
    </Section>
  )
}
