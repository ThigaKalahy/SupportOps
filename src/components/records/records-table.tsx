"use client"

import * as React from "react"
import Link from "next/link"
import { LockIcon } from "lucide-react"

import { AgreementStatusCell } from "@/components/agreements/agreements-table"
import { RecordActions } from "@/components/forms/record-actions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { DateStamp } from "@/components/ui/date-stamp"
import { MetaLabel } from "@/components/ui/meta-label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatDate } from "@/lib/dates"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import { avatarColors, initials } from "@/lib/people"
import type { RecordRow } from "@/server/queries/records"

import { FollowUpCell } from "./follow-up-cell"

const R = labels.records
const C = R.columns
const O = labels.forms.oneOnOne
const F = labels.forms.feedback

/** Primeira linha do que resume o registro: assuntos do 1:1, comportamento do feedback. */
function headline(row: RecordRow): string {
  const text = row.kind === "oneOnOne" ? (row.topics ?? labels.timeline.oneOnOneFallback) : row.behavior
  return text.split("\n")[0]?.trim() ?? ""
}

function TypeLabel({ row }: { row: RecordRow }) {
  return (
    <span className="font-mono text-2xs tracking-wide text-ink-secondary uppercase">
      {row.kind === "oneOnOne" ? R.types.oneOnOne : enumLabel("timelineEventType", row.category === "RECOGNITION" ? "RECOGNITION" : "FEEDBACK")}
    </span>
  )
}

/**
 * Índice de 1:1 e feedbacks: uma tabela para os dois tipos, mais recente
 * primeiro, com o follow-up (severidade quando vencido) e os combinados
 * gerados. Clicar na linha abre o registro inteiro num painel lateral.
 */
export function RecordsTable({
  rows,
  showMember = true,
  empty,
  canWrite = false,
}: {
  rows: RecordRow[]
  /** Falso na aba do perfil (a pessoa já está no cabeçalho). */
  showMember?: boolean
  empty: { title: string; direction: string }
  /** Mostra editar/excluir no painel do registro. */
  canWrite?: boolean
}) {
  const [selected, setSelected] = React.useState<RecordRow | null>(null)

  const columns: DataTableColumn<RecordRow>[] = [
    { id: "date", header: C.date, cell: (r) => <DateStamp date={r.date} kind="business" className="text-ink" />, title: () => undefined, width: "104px" },
    { id: "type", header: C.type, cell: (r) => <TypeLabel row={r} />, title: () => undefined, width: "144px" },
  ]
  if (showMember) {
    columns.push({
      id: "member",
      header: C.member,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar size="sm">
            <AvatarFallback style={avatarColors(r.member.id)}>{initials(r.member.fullName)}</AvatarFallback>
          </Avatar>
          <span className="truncate">{r.member.preferredName}</span>
        </span>
      ),
      title: (r) => r.member.fullName,
      width: "148px",
    })
  }
  columns.push(
    {
      id: "summary",
      header: C.summary,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-1.5">
          {r.visibility === "PRIVATE" ? (
            <LockIcon className="size-3.5 shrink-0 text-ink-tertiary" aria-label={enumLabel("visibility", "PRIVATE")} />
          ) : null}
          <span className="truncate text-ink">{headline(r)}</span>
        </span>
      ),
      title: (r) => headline(r),
      stacked: "primary",
    },
    {
      id: "category",
      header: C.category,
      cell: (r) =>
        r.kind === "feedback" ? (
          <span className="text-ink-secondary">{enumLabel("feedbackCategory", r.category)}</span>
        ) : (
          <span className="text-ink-tertiary">—</span>
        ),
      width: "128px",
      hideBelow: "xl",
    },
    { id: "followUp", header: C.followUp, cell: (r) => <FollowUpCell state={r.followUp} />, title: () => undefined, width: "208px" },
    {
      id: "agreements",
      header: C.agreements,
      cell: (r) =>
        r.agreements.length ? (
          <span className="font-mono text-xs text-ink-secondary">{r.agreements.length}</span>
        ) : (
          <span className="text-ink-tertiary">—</span>
        ),
      title: (r) => (r.agreements.length ? plural(labels.forms.generated.count, r.agreements.length) : undefined),
      width: "104px",
      hideBelow: "lg",
    },
  )

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => `${r.kind}-${r.id}`}
        label={R.tableLabel}
        empty={empty}
        selectedRowId={selected ? `${selected.kind}-${selected.id}` : null}
        onRowSelect={setSelected}
      />
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-dialog">{selected ? (
            <RecordDetail row={selected} canWrite={canWrite} onChanged={() => setSelected(null)} />
          ) : null}</SheetContent>
      </Sheet>
    </>
  )
}

function Field({ label, text }: { label: string; text: string | null | undefined }) {
  if (!text) return null
  return (
    <div className="flex flex-col gap-1">
      <MetaLabel>{label}</MetaLabel>
      <p className="text-sm whitespace-pre-line text-ink">{text}</p>
    </div>
  )
}

/** O registro inteiro, somente leitura, com o follow-up e os combinados gerados. */
function RecordDetail({ row, canWrite, onChanged }: { row: RecordRow; canWrite: boolean; onChanged: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <TypeLabel row={row} />
          <span>{row.member.preferredName}</span>
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <DateStamp date={row.date} kind="business" />
          {row.kind === "oneOnOne" && row.durationMinutes ? <span>· {fill(R.detail.duration, { minutes: row.durationMinutes })}</span> : null}
          {row.kind === "feedback" ? <span>· {enumLabel("feedbackCategory", row.category)}</span> : null}
          <span>· {enumLabel("visibility", row.visibility)}</span>
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4">
        {row.kind === "oneOnOne" ? (
          <>
            <Field label={O.topics} text={row.topics} />
            <Field label={O.memberPerception} text={row.memberPerception} />
            <Field label={O.managerPerception} text={row.managerPerception} />
            <Field label={O.wins} text={row.wins} />
            <Field label={O.difficulties} text={row.difficulties} />
            <Field label={O.development} text={row.development} />
          </>
        ) : (
          <>
            <Field label={F.context} text={row.context} />
            <Field label={F.behavior} text={row.behavior} />
            <Field label={F.impact} text={row.impact} />
            <Field label={F.guidance} text={row.guidance} />
          </>
        )}
        <div className="flex flex-col gap-1">
          <MetaLabel>{row.kind === "oneOnOne" ? O.nextReviewAt : F.followUpAt}</MetaLabel>
          <FollowUpCell state={row.followUp} />
        </div>
        {row.agreements.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <MetaLabel>{R.detail.agreements}</MetaLabel>
            <ul className="flex flex-col gap-1">
              {row.agreements.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <Link href={`/agreements/${a.id}`} className="text-ink hover:underline">
                    {a.title}
                  </Link>
                  <AgreementStatusCell status={a.status} />
                  <DateStamp date={a.dueDate} kind="business" className="text-xs text-ink-secondary" />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-ink-secondary">
          <span>{fill(R.detail.by, { name: row.author })}</span>
          <span className="flex items-center gap-2">
            {canWrite ? (
              <>
                <RecordActions
                  source={{ kind: row.kind, id: row.id }}
                  member={row.member}
                  typeLabel={row.kind === "oneOnOne" ? R.types.oneOnOne : enumLabel("timelineEventType", row.category === "RECOGNITION" ? "RECOGNITION" : "FEEDBACK")}
                  dateText={formatDate(row.date, "business")}
                  onChanged={onChanged}
                />
                <span aria-hidden className="text-ink-tertiary">
                  ·
                </span>
              </>
            ) : null}
            <Link href={`/team/${row.member.id}/timeline`} className="text-accent hover:underline">
              {R.detail.timeline}
            </Link>
          </span>
        </div>
      </div>
    </div>
  )
}
