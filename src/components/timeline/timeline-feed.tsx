"use client"

import * as React from "react"

import { setRecordVisibility } from "@/actions/records"
import { loadTimelinePage } from "@/actions/timeline"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MetaLabel } from "@/components/ui/meta-label"
import { formatMonthYear } from "@/lib/dates"
import { labels } from "@/lib/labels"
import type { TimelineItem, TimelinePage } from "@/server/queries/timeline"

import { TimelineEvent } from "./timeline-event"
import { GUTTER, TimelineMonth } from "./timeline-rail"

const T = labels.timeline

/** Agrupa itens consecutivos do mesmo mês (já vêm do mais recente para o mais antigo). */
function byMonth(items: TimelineItem[]) {
  const groups: { label: string; items: TimelineItem[] }[] = []
  for (const item of items) {
    const label = formatMonthYear(item.occurredAt)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}

/**
 * Lista da timeline. A primeira página vem do servidor; "Carregar mais" busca
 * a próxima por cursor e acrescenta embaixo. Sem scroll infinito: o ponto de
 * leitura fica onde a pessoa deixou. Mudar um filtro remonta a lista (key).
 */
export function TimelineFeed({
  memberId,
  initial,
  search,
  showVisibility,
  canWrite,
}: {
  memberId: string
  initial: TimelinePage
  /** Query string dos filtros, repassada à página seguinte. */
  search: string
  showVisibility: boolean
  canWrite: boolean
}) {
  const [items, setItems] = React.useState(initial.items)
  const [cursor, setCursor] = React.useState(initial.nextCursor)
  const [loading, startLoading] = React.useTransition()
  const [loadError, setLoadError] = React.useState(false)
  const [toggling, setToggling] = React.useState<string | null>(null)
  const [sharing, setSharing] = React.useState<TimelineItem | null>(null)
  const [toggleError, setToggleError] = React.useState<string | null>(null)

  function loadMore() {
    if (!cursor) return
    setLoadError(false)
    startLoading(async () => {
      try {
        const next = await loadTimelinePage(memberId, search, cursor)
        setItems((current) => [...current, ...next.items])
        setCursor(next.nextCursor)
      } catch {
        setLoadError(true)
      }
    })
  }

  async function applyVisibility(item: TimelineItem, visibility: TimelineItem["visibility"]) {
    setToggling(item.id)
    setToggleError(null)
    const result = await setRecordVisibility({ eventId: item.id, visibility }, memberId)
    setToggling(null)
    if (!result.ok) return setToggleError(result.error)
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, visibility } : i)))
  }

  // Tornar privado é imediato; compartilhar expõe o registro e pede confirmação.
  function toggle(item: TimelineItem) {
    if (item.visibility === "PRIVATE") setSharing(item)
    else void applyVisibility(item, "PRIVATE")
  }

  return (
    <div>
      {toggleError ? (
        <p role="alert" className="mb-3 text-xs text-overdue">
          {toggleError}
        </p>
      ) : null}

      {byMonth(items).map((group) => (
        <TimelineMonth key={group.label} label={group.label}>
          {group.items.map((item) => (
            <TimelineEvent
              key={item.id}
              item={item}
              showVisibility={showVisibility}
              onToggleVisibility={canWrite ? toggle : undefined}
              pending={toggling === item.id}
            />
          ))}
        </TimelineMonth>
      ))}

      <div className={`grid ${GUTTER}`}>
        <span />
        <div className="flex flex-col items-start gap-2 pb-4">
          {cursor ? (
            <Button variant="secondary" size="sm" onClick={loadMore} loading={loading}>
              {T.loadMore}
            </Button>
          ) : (
            <MetaLabel>{T.end}</MetaLabel>
          )}
          {loadError ? (
            <p role="alert" className="text-xs text-overdue">
              {T.loadError}
            </p>
          ) : null}
        </div>
      </div>

      <Dialog open={sharing !== null} onOpenChange={(open) => !open && setSharing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{T.shareDialog.title}</DialogTitle>
            <DialogDescription>{T.shareDialog.description}</DialogDescription>
          </DialogHeader>
          {sharing ? <p className="text-sm font-medium text-ink">{sharing.title}</p> : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSharing(null)}>
              {labels.common.cancel}
            </Button>
            <Button
              onClick={() => {
                const item = sharing
                setSharing(null)
                if (item) void applyVisibility(item, "SHARED")
              }}
            >
              {T.shareDialog.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
