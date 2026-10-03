"use client"

import * as React from "react"

import { deleteRecord, loadRecordForEdit, type RecordForEdit } from "@/actions/records"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import type { RecordRef } from "@/lib/validators/records"

import { FeedbackDialog } from "./feedback-dialog"
import { NoteDialog } from "./note-dialog"
import { OneOnOneDialog } from "./one-on-one-dialog"

const L = labels.forms

/**
 * Editar e excluir um 1:1, feedback ou anotação já salvo (só para quem
 * escreve). Editar carrega o registro e abre o mesmo formulário da criação;
 * excluir pede confirmação em modal — botão de perigo, foco inicial em
 * Cancelar. A exclusão é lógica e fica na auditoria.
 */
export function RecordActions({
  source,
  member,
  typeLabel,
  dateText,
  onChanged,
  className,
}: {
  source: RecordRef
  member: { id: string; preferredName: string }
  /** "1:1", "Feedback", "Anotação" — para o texto da confirmação. */
  typeLabel: string
  dateText: string
  /** Depois de salvar ou excluir (ex.: fechar o painel, recarregar a lista). */
  onChanged?: (change: "updated" | "deleted") => void
  className?: string
}) {
  const toast = useToast()
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  const [editing, setEditing] = React.useState<RecordForEdit | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, startLoading] = React.useTransition()
  const [deleting, startDeleting] = React.useTransition()

  function edit() {
    setError(null)
    startLoading(async () => {
      const record = await loadRecordForEdit(source.kind, source.id)
      if (record) setEditing(record)
      else setError(labels.validation.generic)
    })
  }

  function remove() {
    startDeleting(async () => {
      const result = await deleteRecord(source, member.id)
      if (!result.ok) return setError(result.error)
      setConfirming(false)
      toast.show(labels.toast.recordDeleted)
      onChanged?.("deleted")
    })
  }

  const button = "font-medium text-accent hover:underline disabled:opacity-50"

  return (
    <>
      <span className={cn("inline-flex items-center gap-2", className)}>
        <button type="button" className={button} onClick={edit} disabled={loading}>
          {L.edit}
        </button>
        <span aria-hidden className="text-ink-tertiary">
          ·
        </span>
        <button type="button" className={button} onClick={() => setConfirming(true)}>
          {L.delete}
        </button>
        {error ? (
          <span role="alert" className="text-overdue">
            {error}
          </span>
        ) : null}
      </span>

      {editing?.kind === "oneOnOne" ? (
        <OneOnOneDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() => onChanged?.("updated")}
          member={editing.member}
          editing={{ id: editing.id, values: editing.values }}
        />
      ) : null}
      {editing?.kind === "feedback" ? (
        <FeedbackDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() => onChanged?.("updated")}
          member={editing.member}
          editing={{ id: editing.id, values: editing.values }}
        />
      ) : null}
      {editing?.kind === "note" ? (
        <NoteDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() => onChanged?.("updated")}
          member={editing.member}
          editing={{ id: editing.id, values: editing.values }}
        />
      ) : null}

      <Dialog open={confirming} onOpenChange={(open) => !deleting && setConfirming(open)}>
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            cancelRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{L.deleteDialog.title}</DialogTitle>
            <DialogDescription>
              {fill(L.deleteDialog.description, { type: typeLabel, name: member.preferredName, date: dateText })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button ref={cancelRef} type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={deleting}>
              {labels.common.cancel}
            </Button>
            <Button type="button" variant="destructive" onClick={remove} loading={deleting}>
              {L.deleteDialog.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
