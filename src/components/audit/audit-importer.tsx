"use client"

import * as React from "react"
import Link from "next/link"
import { UploadIcon } from "lucide-react"

import { createAuditBatch, importAuditFiles } from "@/actions/audit"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { StatusPill } from "@/components/ui/status-pill"
import { AUDIT_FILE_LIMITS, readSelectedFiles, type ReadFile, type RejectedFile } from "@/lib/audit/files"
import { parseConversation, type ParseResult } from "@/lib/audit/parser"
import { fill, labels } from "@/lib/labels"
import { AUDIT_IMPORT_CHUNK } from "@/lib/validators/audit"

const I = labels.audit.import
/** Teto de bytes por chamada (o limite de corpo das Server Actions é 1 MB). */
const CHUNK_BYTES = 700 * 1024

type Row = { file: ReadFile; parsed: ParseResult }

/**
 * C23 Fase C — importação com pré-visualização. O navegador lê TXT e ZIP (com as proteções de
 * `src/lib/audit/files.ts`), mostra o que o leitor entendeu de cada conversa e só então envia o
 * texto, em pacotes pequenos. O servidor lê tudo de novo. Recusados também vão para o relatório.
 */
export function AuditImporter() {
  const [rows, setRows] = React.useState<Row[]>([])
  const [rejected, setRejected] = React.useState<RejectedFile[]>([])
  const [reading, setReading] = React.useState(false)
  const [name, setName] = React.useState("")
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)
  const [batchId, setBatchId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [nameError, setNameError] = React.useState<string | undefined>()

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const list = event.target.files
    if (!list?.length) return
    setReading(true)
    setError(null)
    setBatchId(null)
    try {
      const read = await readSelectedFiles(list)
      setRows(read.files.map((file) => ({ file, parsed: parseConversation(file.text) })))
      setRejected(read.rejected)
    } finally {
      setReading(false)
      event.target.value = ""
    }
  }

  async function run() {
    setError(null)
    setNameError(undefined)
    if (!rows.length && !rejected.length) return setError(I.nothing)
    const created = await createAuditBatch({ name })
    if (!created.ok) {
      setNameError(created.fieldErrors?.name)
      return setError(created.error)
    }
    // Pacotes por quantidade e por tamanho; os recusados vão no primeiro.
    const chunks: ReadFile[][] = []
    let current: ReadFile[] = []
    let size = 0
    for (const { file } of rows) {
      const bytes = file.text.length * 2
      if (current.length && (current.length >= AUDIT_IMPORT_CHUNK || size + bytes > CHUNK_BYTES)) {
        chunks.push(current)
        current = []
        size = 0
      }
      current.push(file)
      size += bytes
    }
    if (current.length || !chunks.length) chunks.push(current)
    setProgress({ done: 0, total: rows.length })
    let done = 0
    for (const [index, chunk] of chunks.entries()) {
      const result = await importAuditFiles({
        batchId: created.id,
        files: chunk.map((f) => ({ name: f.name, text: f.text, encoding: f.encoding })),
        rejected: index === 0 ? rejected : [],
      })
      if (!result.ok) {
        setError(I.failed)
        break
      }
      done += chunk.length
      setProgress({ done, total: rows.length })
    }
    setBatchId(created.id)
  }

  const situation = (r: Row) =>
    !r.parsed.ok ? (
      <StatusPill severity="overdue" label={I.invalid} />
    ) : r.parsed.needsReview ? (
      <StatusPill severity="attention" label={I.review} />
    ) : (
      <StatusPill severity="calm" label={I.ok} />
    )

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-3xl text-sm text-ink-secondary">{fill(I.direction, { max: AUDIT_FILE_LIMITS.maxFiles })}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="inline-flex">
          <input type="file" multiple accept=".txt,.zip,text/plain,application/zip" className="sr-only" onChange={pick} disabled={reading || progress !== null} />
          <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-sunken">
            <UploadIcon className="size-4" aria-hidden />
            {reading ? I.reading : I.pick}
          </span>
        </label>
      </div>

      {rows.length || rejected.length ? (
        <>
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-ink">{I.preview}</h2>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs text-ink-secondary">
                  <tr>
                    {[I.columns.file, I.columns.chat, I.columns.customer, I.columns.analyst, I.columns.messages, I.columns.situation].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.file.name} className="align-top">
                      <td className="max-w-56 truncate px-3 py-2 font-mono text-xs" title={r.file.name}>
                        {r.file.name}
                        <span className="block text-ink-secondary">{r.file.encoding}</span>
                      </td>
                      <td className="px-3 py-2 font-mono">{r.parsed.ok ? (r.parsed.meta.externalId ?? "—") : "—"}</td>
                      <td className="px-3 py-2">{r.parsed.ok ? (r.parsed.meta.customerCompany ?? "—") : "—"}</td>
                      <td className="px-3 py-2">{r.parsed.ok ? (r.parsed.meta.analystName ?? "—") : "—"}</td>
                      <td className="px-3 py-2 font-mono">{r.parsed.ok ? r.parsed.messages.length : "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          {situation(r)}
                          {(r.parsed.ok ? r.parsed.warnings : [r.parsed.error]).map((w) => (
                            <span key={w} className="text-xs text-ink-secondary">
                              {w}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rejected.map((r) => (
                    <tr key={`rej-${r.name}`}>
                      <td className="max-w-56 truncate px-3 py-2 font-mono text-xs">{r.name}</td>
                      <td colSpan={4} className="px-3 py-2 text-xs text-ink-secondary">
                        {r.reason}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill severity="overdue" label={I.rejected} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {batchId ? (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
              <span className="text-sm text-ink">{I.done}</span>
              <Button asChild size="sm">
                <Link href={`/audit/batches/${batchId}`}>{I.openBatch}</Link>
              </Button>
            </div>
          ) : (
            <div className="flex max-w-xl flex-col gap-3">
              <FieldGroup label={I.batchName} required error={nameError}>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={I.batchNamePlaceholder} />
              </FieldGroup>
              <div className="flex items-center gap-3">
                <Button type="button" onClick={run} loading={progress !== null && !error} disabled={progress !== null}>
                  {fill(I.confirm, { count: rows.length + rejected.length })}
                </Button>
                {progress ? <span className="text-xs text-ink-secondary">{fill(I.importing, progress)}</span> : null}
              </div>
            </div>
          )}
          {error ? (
            <p role="alert" className="text-sm text-overdue">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
