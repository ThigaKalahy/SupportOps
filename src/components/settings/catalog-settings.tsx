"use client"

import * as React from "react"
import type { ZodType } from "zod"
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, PlusIcon } from "lucide-react"

import { deleteCatalogItem, moveCatalogItem, saveCatalogItem, setCatalogItemActive } from "@/actions/settings"
import { FormError } from "@/components/forms/form-kit"
import { ContextActions } from "@/components/shell/context-actions"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { StatusPill } from "@/components/ui/status-pill"
import { fill, labels, plural } from "@/lib/labels"
import { fieldErrorsOf } from "@/lib/validators/fields"
import type { CatalogKind } from "@/lib/validators/settings"

const S = labels.settings

export interface CatalogItemBase {
  id: string
  label: string
  isActive: boolean
  /** Registros que apontam para o item. Em uso não se exclui. */
  usage: number
}

export interface CatalogTexts {
  direction: string
  new: string
  dialogTitle: { create: string; edit: string }
  dialogDescription: string
  emptyTitle: string
  emptyDirection: string
}

export type FieldsRenderer<V> = (props: {
  values: V
  set: (patch: Partial<V>) => void
  errors: Record<string, string>
}) => React.ReactNode

/**
 * Lista editável de um catálogo de /settings. Ordem com Subir/Descer (a
 * posição é o que importa — rank dos níveis, ordem dos motivos e padrões),
 * editar e criar no dialog, ativar/desativar, e excluir só o que nada usa.
 * Toda escrita é Server Action auditada.
 */
export function CatalogSettings<T extends CatalogItemBase, V extends { id?: string; label: string }>({
  kind,
  items,
  canWrite,
  texts,
  columns,
  schema,
  emptyValues,
  toValues,
  renderFields,
  children,
}: {
  kind: CatalogKind
  items: T[]
  canWrite: boolean
  texts: CatalogTexts
  /** Colunas próprias do catálogo, entre o nome e o uso. */
  columns: DataTableColumn<T>[]
  schema: ZodType
  emptyValues: V
  toValues: (item: T) => V
  renderFields: FieldsRenderer<V>
  /** Conteúdo extra abaixo da lista (ex.: testador de URL). */
  children?: React.ReactNode
}) {
  const [editing, setEditing] = React.useState<V | null>(null)
  const [deleting, setDeleting] = React.useState<T | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error ?? labels.validation.generic)
    })
  }

  const all: DataTableColumn<T>[] = [
    {
      id: "order",
      header: S.columns.order,
      cell: (item) => {
        const index = items.indexOf(item)
        if (!canWrite) return <span className="font-mono text-xs text-ink-secondary">{index + 1}</span>
        return (
          <span className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending || index === 0}
              aria-label={fill(S.moveUp, { label: item.label })}
              onClick={() => run(() => moveCatalogItem({ kind, id: item.id, direction: "up" }))}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending || index === items.length - 1}
              aria-label={fill(S.moveDown, { label: item.label })}
              onClick={() => run(() => moveCatalogItem({ kind, id: item.id, direction: "down" }))}
            >
              <ArrowDownIcon />
            </Button>
          </span>
        )
      },
      title: () => undefined,
      width: canWrite ? "88px" : "64px",
    },
    {
      id: "label",
      header: S.columns.label,
      cell: (item) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className={item.isActive ? "truncate text-ink" : "truncate text-ink-secondary"}>{item.label}</span>
          {item.isActive ? null : <StatusPill severity="neutral" label={S.inactive} />}
        </span>
      ),
      title: (item) => item.label,
      stacked: "primary",
    },
    ...columns,
    {
      id: "usage",
      header: S.columns.usage,
      cell: (item) =>
        item.usage > 0 ? (
          <span className="font-mono text-xs text-ink-secondary">{plural(S.usage, item.usage)}</span>
        ) : (
          <span className="text-xs text-ink-tertiary">{S.unused}</span>
        ),
      title: () => undefined,
      width: "120px",
      hideBelow: "lg",
    },
  ]
  if (canWrite) {
    all.push({
      id: "actions",
      header: S.columns.actions,
      cell: (item) => (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={fill(S.rowActions, { label: item.label })}>
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(toValues(item))}>{S.edit}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run(() => setCatalogItemActive({ kind, id: item.id, active: !item.isActive }))}>
              {item.isActive ? S.deactivate : S.activate}
            </DropdownMenuItem>
            {item.usage === 0 ? (
              <DropdownMenuItem onSelect={() => setDeleting(item)} className="text-overdue focus:text-overdue">
                {S.delete}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      title: () => undefined,
      width: "56px",
      align: "right",
      stacked: "aside",
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <ContextActions>
          <Button size="sm" onClick={() => setEditing(emptyValues)}>
            <PlusIcon />
            {texts.new}
          </Button>
        </ContextActions>
      ) : null}
      <p className="max-w-3xl text-sm text-ink-secondary">{texts.direction}</p>
      {canWrite ? null : <p className="text-xs text-ink-secondary">{S.readOnly}</p>}
      {error ? (
        <p role="alert" className="rounded-sm border border-overdue bg-overdue-wash px-3 py-2 text-sm text-overdue">
          {error}
        </p>
      ) : null}
      <DataTable
        columns={all}
        rows={items}
        getRowId={(item) => item.id}
        label={texts.new}
        empty={{ title: texts.emptyTitle, direction: texts.emptyDirection }}
      />
      {children}
      <ItemDialog
        kind={kind}
        values={editing}
        texts={texts}
        schema={schema}
        renderFields={renderFields}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <DeleteItemDialog kind={kind} item={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </div>
  )
}

function ItemDialog<V extends { id?: string; label: string }>({
  kind,
  values: initial,
  texts,
  schema,
  renderFields,
  onOpenChange,
}: {
  kind: CatalogKind
  values: V | null
  texts: CatalogTexts
  schema: ZodType
  renderFields: FieldsRenderer<V>
  onOpenChange: (open: boolean) => void
}) {
  const [values, setValues] = React.useState<V | null>(initial)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const formRef = React.useRef<HTMLFormElement>(null)

  React.useEffect(() => {
    setValues(initial)
    setErrors({})
    setFormError(null)
  }, [initial])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!values) return
    const parsed = schema.safeParse(values)
    if (!parsed.success) return setErrors(fieldErrorsOf(parsed.error))
    setErrors({})
    setFormError(null)
    startTransition(async () => {
      const result = await saveCatalogItem(kind, parsed.data)
      if (result.ok) return onOpenChange(false)
      setFormError(result.error)
      setErrors(result.fieldErrors ?? {})
    })
  }

  return (
    <Dialog open={initial !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          formRef.current?.querySelector<HTMLElement>("input, textarea, button[role=combobox]")?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{initial?.id ? texts.dialogTitle.edit : texts.dialogTitle.create}</DialogTitle>
          <DialogDescription>{texts.dialogDescription}</DialogDescription>
        </DialogHeader>
        {values ? (
          <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4" noValidate>
            {renderFields({
              values,
              set: (patch) => setValues((v) => (v ? { ...v, ...patch } : v)),
              errors,
            })}
            <FormError message={formError} />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
                {labels.common.cancel}
              </Button>
              <Button type="submit" loading={pending}>
                {labels.common.save}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** Exclusão de item sem uso. Botão em cor de perigo, nunca o padrão. */
function DeleteItemDialog({
  kind,
  item,
  onOpenChange,
}: {
  kind: CatalogKind
  item: CatalogItemBase | null
  onOpenChange: (open: boolean) => void
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const keepRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (item) setError(null)
  }, [item])

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          keepRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{item ? fill(S.deleteDialog.title, { label: item.label }) : null}</DialogTitle>
          <DialogDescription>{S.deleteDialog.description}</DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        <DialogFooter>
          <Button ref={keepRef} type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {S.deleteDialog.keep}
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={pending}
            onClick={() =>
              item &&
              startTransition(async () => {
                const result = await deleteCatalogItem({ kind, id: item.id })
                if (result.ok) onOpenChange(false)
                else setError(result.error)
              })
            }
          >
            {S.deleteDialog.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
