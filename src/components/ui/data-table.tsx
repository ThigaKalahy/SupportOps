"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { MetaLabel } from "@/components/ui/meta-label"
import { labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

export interface DataTableColumn<T> {
  id: string
  header: string
  cell: (row: T) => React.ReactNode
  /** Texto completo para o title da célula truncada. Padrão: o conteúdo, quando é texto. */
  title?: (row: T) => string | undefined
  /** Largura CSS da coluna (ex.: "160px", "30%"). Sem largura, divide o espaço restante. */
  width?: string
  align?: "left" | "right"
  /**
   * Papel na lista empilhada (< 768px):
   * primary   linha de título do item
   * aside     à direita da linha de título, sem rótulo (sinal, menu de ações)
   * secondary par rótulo/valor abaixo do título (padrão)
   * hidden    não aparece na lista empilhada
   */
  stacked?: "primary" | "aside" | "secondary" | "hidden"
  /**
   * Oculta a coluna na tabela abaixo do breakpoint (lg = 1024px, xl = 1280px).
   * Use nas colunas de menor prioridade: a soma das larguras fixas não pode
   * passar da largura disponível, senão a coluna flexível (sem `width`) some.
   */
  hideBelow?: "lg" | "xl"
}

const hideCellClasses = { lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" } as const
const hideColClasses = { lg: "hidden lg:table-column", xl: "hidden xl:table-column" } as const

export type DataTableState = "ready" | "loading" | "error"

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowId: (row: T) => string
  /** Nome acessível da tabela. */
  label: string
  state?: DataTableState
  /** Linha selecionada: fundo --accent-wash e barra inset de 2px em --accent. */
  selectedRowId?: string | null
  onRowSelect?: (row: T) => void
  density?: "default" | "compact"
  /** Estado vazio com texto de direção. Obrigatório: tabela vazia nunca fica muda. */
  empty: { title: string; direction: string; action?: React.ReactNode }
  error?: { message: string; onRetry?: () => void }
  /** Altura máxima; com ela, a tabela rola internamente e o cabeçalho gruda no topo dela. */
  maxHeight?: number
  /**
   * Agrupa linhas consecutivas com o mesmo grupo sob um cabeçalho discreto.
   * As linhas precisam chegar já ordenadas pelo grupo.
   */
  groupBy?: (row: T) => { id: string; label: string }
  /** Só para /ui-lab: força o estado visual de hover/foco numa linha. */
  forcedRowState?: { rowId: string; state: "hover" | "focus" }
  className?: string
}

const LOADING_ROWS = 5

function cellTitle<T>(column: DataTableColumn<T>, row: T, content: React.ReactNode): string | undefined {
  if (column.title) return column.title(row)
  return typeof content === "string" || typeof content === "number" ? String(content) : undefined
}

/**
 * Tabela padrão do produto. Cabeçalho sticky, linhas de 40px (32px compacta),
 * hover em --surface-sunken, seleção em --accent-wash com barra de 2px, células
 * truncadas com title e estados de vazio, carregamento e erro.
 * Abaixo de 768px vira lista de linhas empilhadas — nunca scroll horizontal.
 */
function DataTable<T>({
  columns,
  rows,
  getRowId,
  label,
  state = "ready",
  selectedRowId = null,
  onRowSelect,
  density = "default",
  empty,
  error,
  maxHeight,
  forcedRowState,
  groupBy,
  className,
}: DataTableProps<T>) {
  const interactive = Boolean(onRowSelect)
  const rowHeight = density === "compact" ? "h-8" : "h-10"
  const isEmpty = state === "ready" && rows.length === 0

  function rowHandlers(row: T) {
    if (!onRowSelect) return {}
    return {
      tabIndex: 0,
      onClick: () => onRowSelect(row),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onRowSelect(row)
        }
      },
    }
  }

  /** Grupo da linha quando ela inicia um grupo novo (para o cabeçalho), senão null. */
  const groupCounts = new Map<string, number>()
  if (groupBy) for (const row of rows) {
    const g = groupBy(row).id
    groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1)
  }
  function groupStart(index: number): { id: string; label: string; count: number } | null {
    if (!groupBy) return null
    const row = rows[index]
    if (row === undefined) return null
    const current = groupBy(row)
    const previous = index > 0 ? rows[index - 1] : undefined
    if (previous !== undefined && groupBy(previous).id === current.id) return null
    return { ...current, count: groupCounts.get(current.id) ?? 0 }
  }

  function rowState(id: string) {
    const selected = id === selectedRowId
    return {
      selected,
      forced: forcedRowState?.rowId === id ? forcedRowState.state : undefined,
    }
  }

  const statusBlock =
    state === "error" ? (
      <div role="alert" className="flex flex-col items-center gap-1 px-4 py-6 text-center">
        <p className="text-sm font-medium text-overdue">{labels.table.errorTitle}</p>
        <p className="max-w-[48ch] text-sm text-ink-secondary">{error?.message}</p>
        {error?.onRetry ? (
          <Button variant="secondary" size="sm" className="mt-3" onClick={error.onRetry}>
            {labels.common.retry}
          </Button>
        ) : null}
      </div>
    ) : isEmpty ? (
      <EmptyState size="compact" title={empty.title} direction={empty.direction} action={empty.action} />
    ) : null

  return (
    <div
      data-slot="data-table"
      data-state={state}
      className={cn(
        "w-full min-w-0 rounded-lg border border-line bg-surface",
        maxHeight ? "overflow-auto" : "overflow-clip",
        className
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {/* ≥ 768px: tabela */}
      <table
        aria-label={label}
        aria-busy={state === "loading" || undefined}
        className="hidden w-full table-fixed border-separate border-spacing-0 text-sm md:table"
      >
        <colgroup>
          {columns.map((column) => (
            <col
              key={column.id}
              className={column.hideBelow ? hideColClasses[column.hideBelow] : undefined}
              style={column.width ? { width: column.width } : undefined}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  "sticky top-0 z-10 h-8 truncate border-b border-line bg-surface-sunken px-3 font-mono text-2xs font-medium tracking-label text-ink-secondary uppercase",
                  column.align === "right" ? "text-right" : "text-left",
                  column.hideBelow && hideCellClasses[column.hideBelow]
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state === "loading" ? (
            Array.from({ length: LOADING_ROWS }, (_, i) => (
              <tr key={i} className={rowHeight} aria-hidden>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn("border-b border-line px-3", column.hideBelow && hideCellClasses[column.hideBelow])}
                  >
                    <span className={cn("block h-2 rounded-xs bg-surface-sunken", i % 2 ? "w-1/2" : "w-3/4")} />
                  </td>
                ))}
              </tr>
            ))
          ) : statusBlock ? null : (
            rows.map((row, rowIndex) => {
              const id = getRowId(row)
              const { selected, forced } = rowState(id)
              const group = groupStart(rowIndex)
              return (
                <React.Fragment key={id}>
                {group ? (
                  // Uma célula por coluna, com a mesma regra de ocultação: colSpan
                  // sobre colunas ocultas por hideBelow cria colunas fantasmas.
                  <tr data-slot="data-table-group">
                    {columns.map((column, index) => (
                      <th
                        key={column.id}
                        scope={index === 0 ? "colgroup" : undefined}
                        className={cn(
                          "h-7 border-b border-line bg-canvas px-3 text-left font-normal whitespace-nowrap",
                          column.hideBelow && hideCellClasses[column.hideBelow]
                        )}
                      >
                        {index === 0 ? (
                          <MetaLabel>
                            {group.label} · {group.count}
                          </MetaLabel>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                ) : null}
                <tr
                  data-selected={selected || undefined}
                  data-force-state={forced}
                  aria-current={selected || undefined}
                  className={cn(
                    rowHeight,
                    "transition-colors focus-visible:-outline-offset-2 [&:last-child>td]:border-b-0",
                    selected ? "bg-accent-wash" : "hover:bg-surface-sunken",
                    interactive && "cursor-pointer"
                  )}
                  {...rowHandlers(row)}
                >
                  {columns.map((column, index) => {
                    const content = column.cell(row)
                    return (
                      <td
                        key={column.id}
                        title={cellTitle(column, row, content)}
                        className={cn(
                          "truncate border-b border-line px-3",
                          column.align === "right" && "text-right",
                          column.hideBelow && hideCellClasses[column.hideBelow],
                          index === 0 &&
                            selected &&
                            "relative before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent"
                        )}
                      >
                        {content}
                      </td>
                    )
                  })}
                </tr>
                </React.Fragment>
              )
            })
          )}
        </tbody>
      </table>
      {/* Vazio e erro ficam fora da tabela: colSpan sobre colunas ocultas criaria colunas fantasmas. */}
      {statusBlock ? <div className="hidden border-t border-line md:block">{statusBlock}</div> : null}

      {/* < 768px: lista de linhas empilhadas */}
      <div className="md:hidden" aria-label={label} role="list" aria-busy={state === "loading" || undefined}>
        {state === "loading" ? (
          <p className="px-3 py-4 text-sm text-ink-secondary">{labels.table.loading}</p>
        ) : statusBlock ? (
          statusBlock
        ) : (
          rows.map((row, rowIndex) => {
            const id = getRowId(row)
            const { selected, forced } = rowState(id)
            const primary = columns.filter((c) => c.stacked === "primary")
            const aside = columns.filter((c) => c.stacked === "aside")
            const secondary = columns.filter((c) => (c.stacked ?? "secondary") === "secondary")
            const group = groupStart(rowIndex)
            return (
              <React.Fragment key={id}>
              {group ? (
                <div role="presentation" className="border-b border-line bg-canvas px-3 py-1.5">
                  <MetaLabel>
                    {group.label} · {group.count}
                  </MetaLabel>
                </div>
              ) : null}
              <div
                role="listitem"
                data-selected={selected || undefined}
                data-force-state={forced}
                aria-current={selected || undefined}
                className={cn(
                  "relative flex flex-col gap-1.5 border-b border-line px-3 py-2.5 last:border-b-0 focus-visible:-outline-offset-2",
                  selected
                    ? "bg-accent-wash before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent"
                    : "hover:bg-surface-sunken",
                  interactive && "cursor-pointer"
                )}
                {...rowHandlers(row)}
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0 truncate text-sm font-medium text-ink">
                    {primary.map((column) => (
                      <React.Fragment key={column.id}>{column.cell(row)}</React.Fragment>
                    ))}
                  </div>
                  {aside.length ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {aside.map((column) => (
                        <React.Fragment key={column.id}>{column.cell(row)}</React.Fragment>
                      ))}
                    </div>
                  ) : null}
                </div>
                <dl className="flex flex-wrap gap-x-4 gap-y-1">
                  {secondary.map((column) => (
                    <div key={column.id} className="flex min-w-0 items-center gap-1.5">
                      <MetaLabel asChild>
                        <dt>{column.header}</dt>
                      </MetaLabel>
                      <dd className="min-w-0 truncate text-sm">{column.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              </React.Fragment>
            )
          })
        )}
      </div>
    </div>
  )
}

export { DataTable }
