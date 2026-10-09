"use client"

import * as React from "react"

import { importCentrals } from "@/actions/centrals"
import { FormError } from "@/components/forms/form-kit"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Section } from "@/components/ui/section"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { centralSlug, previewCentralImport, type ImportPreview } from "@/lib/centrals"
import { fill, labels, plural } from "@/lib/labels"
import { catalogSchemas, type CatalogInput } from "@/lib/validators/settings"
import type { CentralItem } from "@/server/queries/settings"

import { CatalogSettings } from "./catalog-settings"

const C = labels.centrals
const T = C.settings

/**
 * Centrais de atendimento (P19, D20): CRUD no catálogo genérico — nome,
 * observação, ativa; desativar preenche deletedAt e tira dos formulários sem
 * apagar o histórico — e a importação por colagem logo abaixo.
 */
export function CentralsSettings({ items, canWrite }: { items: CentralItem[]; canWrite: boolean }) {
  return (
    <CatalogSettings<CentralItem, CatalogInput<"central">>
      kind="central"
      items={items}
      canWrite={canWrite}
      texts={T}
      ordered={false}
      schema={catalogSchemas.central}
      emptyValues={{ label: "", note: "" }}
      toValues={(item) => ({ id: item.id, label: item.label, note: item.note ?? "" })}
      columns={[
        {
          id: "note",
          header: T.note,
          cell: (item) => <span className="truncate text-ink-secondary">{item.note ?? T.noExternalId}</span>,
          title: (item) => item.note ?? undefined,
          hideBelow: "lg",
        },
        {
          id: "externalId",
          header: T.externalId,
          cell: (item) => <span className="font-mono text-xs text-ink-secondary">{item.externalId ?? T.noExternalId}</span>,
          width: "140px",
          hideBelow: "xl",
        },
      ]}
      renderFields={({ values, set, errors }) => (
        <>
          <FieldGroup label={T.label} required error={errors.label}>
            <Input
              value={values.label}
              maxLength={80}
              autoComplete="off"
              placeholder={T.labelPlaceholder}
              onChange={(e) => set({ label: e.target.value })}
            />
          </FieldGroup>
          <FieldGroup label={T.note} optional error={errors.note}>
            <Input value={values.note} maxLength={300} autoComplete="off" onChange={(e) => set({ note: e.target.value })} />
          </FieldGroup>
        </>
      )}
    >
      {canWrite ? <CentralImport items={items} /> : null}
    </CatalogSettings>
  )
}

/** Importação por colagem: pré-visualiza (novas, já existentes, inválidas) e cria só as novas. */
function CentralImport({ items }: { items: CentralItem[] }) {
  const toast = useToast()
  const [text, setText] = React.useState("")
  const [preview, setPreview] = React.useState<ImportPreview | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const I = C.import

  const existing = React.useMemo(
    () => items.map((i) => ({ id: i.id, name: i.label, slug: centralSlug(i.label), isActive: i.isActive })),
    [items],
  )

  function runPreview() {
    setError(null)
    setPreview(previewCentralImport(text, existing))
  }

  function runImport() {
    setError(null)
    startTransition(async () => {
      const result = await importCentrals({ text })
      if (!result.ok) return setError(result.error)
      toast.show(plural(I.done, result.created), { tone: "calm" })
      setText("")
      setPreview(null)
    })
  }

  const invalidCount = (preview?.invalid.length ?? 0) + (preview?.empty ?? 0)

  return (
    <Section title={I.title} className="mt-4 max-w-3xl">
      <p className="-mt-2 text-sm text-ink-secondary">{I.direction}</p>
      <FieldGroup label={I.textarea}>
        <Textarea
          rows={6}
          value={text}
          placeholder={I.placeholder}
          className="font-mono"
          onChange={(e) => {
            setText(e.target.value)
            setPreview(null)
          }}
        />
      </FieldGroup>
      {preview ? (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3" role="status">
          <p className="text-sm text-ink">
            {fill(I.summary, {
              created: plural(I.created, preview.created.length),
              existing: plural(I.existing, preview.existing.length),
              invalid: plural(I.invalid, invalidCount),
            })}
          </p>
          {preview.created.length ? (
            <PreviewList title={I.newList} lines={preview.created.map((c) => (c.externalId ? `${c.name} · ${c.externalId}` : c.name))} />
          ) : null}
          {preview.existing.length ? (
            <PreviewList
              title={I.existingList}
              lines={preview.existing.map((e) => `${e.name} — ${fill(e.inactive ? I.existingInactive : I.existingAs, { name: e.existingName })}`)}
            />
          ) : null}
          {preview.invalid.length ? (
            <PreviewList
              title={I.invalidList}
              lines={preview.invalid.map((i) => `${fill(I.line, { line: i.line })}: ${i.text} — ${I.reasons[i.reason]}`)}
            />
          ) : null}
        </div>
      ) : null}
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        {preview ? (
          <>
            <Button type="button" size="sm" disabled={preview.created.length === 0} loading={pending} onClick={runImport}>
              {fill(I.confirm, { count: preview.created.length })}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setPreview(null)}>
              {I.cancel}
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" size="sm" disabled={text.trim() === ""} onClick={runPreview}>
            {I.preview}
          </Button>
        )}
      </div>
    </Section>
  )
}

function PreviewList({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-2xs font-medium tracking-label text-ink-secondary uppercase">{title}</p>
      <ul className="max-h-40 overflow-y-auto text-sm text-ink">
        {lines.map((line, i) => (
          <li key={i} className="truncate">
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
