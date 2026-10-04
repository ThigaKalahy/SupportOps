"use client"

import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { enumLabel, fill, labels } from "@/lib/labels"
import { extractTicketRef, matchPattern } from "@/lib/priority-validation"
import { BLOCKER_CATEGORIES, catalogSchemas, METRIC_DIRECTIONS, type CatalogInput } from "@/lib/validators/settings"
import type {
  BlockerReasonItem,
  CompetencyItem,
  MetricItem,
  PriorityLevelItem,
  ReclassificationReasonItem,
  TicketPatternItem,
} from "@/server/queries/settings"

import { CatalogSettings } from "./catalog-settings"

const S = labels.settings

function LabelField({
  value,
  onChange,
  error,
  label,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
  label: string
  placeholder: string
}) {
  return (
    <FieldGroup label={label} required error={error}>
      <Input value={value} maxLength={80} autoComplete="off" placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </FieldGroup>
  )
}

/** Níveis de prioridade, do mais alto para o mais baixo. A posição define o rank. */
export function PriorityLevelsSettings({ items, canWrite }: { items: PriorityLevelItem[]; canWrite: boolean }) {
  const T = S.priorityLevels
  return (
    <CatalogSettings<PriorityLevelItem, CatalogInput<"priorityLevel">>
      kind="priorityLevel"
      items={items}
      canWrite={canWrite}
      texts={T}
      schema={catalogSchemas.priorityLevel}
      emptyValues={{ label: "" }}
      toValues={(item) => ({ id: item.id, label: item.label })}
      columns={[
        {
          id: "rank",
          header: S.columns.rank,
          cell: (item) => <span className="font-mono text-xs text-ink-secondary">{item.rank}</span>,
          title: () => undefined,
          width: "64px",
        },
        {
          id: "key",
          header: S.columns.key,
          cell: (item) => <span className="font-mono text-xs text-ink-secondary">{item.key}</span>,
          width: "140px",
          hideBelow: "lg",
        },
      ]}
      renderFields={({ values, set, errors }) => (
        <LabelField
          label={T.label}
          placeholder={T.labelPlaceholder}
          value={values.label}
          error={errors.label}
          onChange={(label) => set({ label })}
        />
      )}
    />
  )
}

export function ReclassificationReasonsSettings({
  items,
  canWrite,
}: {
  items: ReclassificationReasonItem[]
  canWrite: boolean
}) {
  const T = S.reclassificationReasons
  return (
    <CatalogSettings<ReclassificationReasonItem, CatalogInput<"reclassificationReason">>
      kind="reclassificationReason"
      items={items}
      canWrite={canWrite}
      texts={T}
      schema={catalogSchemas.reclassificationReason}
      emptyValues={{ label: "", requiresDetail: false }}
      toValues={(item) => ({ id: item.id, label: item.label, requiresDetail: item.requiresDetail })}
      columns={[
        {
          id: "requiresDetail",
          header: S.columns.requiresDetail,
          cell: (item) => (
            <span className={item.requiresDetail ? "text-ink" : "text-ink-tertiary"}>{item.requiresDetail ? S.yes : S.no}</span>
          ),
          width: "104px",
        },
      ]}
      renderFields={({ values, set, errors }) => (
        <>
          <LabelField
            label={T.label}
            placeholder={T.labelPlaceholder}
            value={values.label}
            error={errors.label}
            onChange={(label) => set({ label })}
          />
          <div className="flex items-start gap-2">
            <Checkbox
              id="reason-requires-detail"
              checked={values.requiresDetail}
              onCheckedChange={(c) => set({ requiresDetail: c === true })}
              aria-describedby="reason-requires-detail-help"
              className="mt-0.5"
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="reason-requires-detail">{T.requiresDetail}</Label>
              <p id="reason-requires-detail-help" className="text-xs text-ink-secondary">
                {T.requiresDetailHelp}
              </p>
            </div>
          </div>
        </>
      )}
    />
  )
}

export function BlockerReasonsSettings({ items, canWrite }: { items: BlockerReasonItem[]; canWrite: boolean }) {
  const T = S.blockerReasons
  return (
    <CatalogSettings<BlockerReasonItem, CatalogInput<"blockerReason">>
      kind="blockerReason"
      items={items}
      canWrite={canWrite}
      texts={T}
      schema={catalogSchemas.blockerReason}
      emptyValues={{ label: "", category: "INTERNAL" }}
      toValues={(item) => ({ id: item.id, label: item.label, category: item.category })}
      columns={[
        {
          id: "category",
          header: S.columns.category,
          cell: (item) => <span className="text-ink-secondary">{enumLabel("blockerCategory", item.category)}</span>,
          width: "120px",
        },
      ]}
      renderFields={({ values, set, errors }) => (
        <>
          <LabelField
            label={T.label}
            placeholder={T.labelPlaceholder}
            value={values.label}
            error={errors.label}
            onChange={(label) => set({ label })}
          />
          <FieldGroup label={T.category} required error={errors.category}>
            {(control) => (
              <Select value={values.category} onValueChange={(v) => set({ category: v as (typeof BLOCKER_CATEGORIES)[number] })}>
                <SelectTrigger {...control} className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCKER_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {enumLabel("blockerCategory", c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FieldGroup>
        </>
      )}
    />
  )
}

/** Padrões de URL de chamado, aplicados em ordem; com testador de URL. */
export function TicketPatternsSettings({ items, canWrite }: { items: TicketPatternItem[]; canWrite: boolean }) {
  const T = S.ticketPatterns
  return (
    <CatalogSettings<TicketPatternItem, CatalogInput<"ticketPattern">>
      kind="ticketPattern"
      items={items}
      canWrite={canWrite}
      texts={T}
      schema={catalogSchemas.ticketPattern}
      emptyValues={{ label: "", regex: "", captureGroup: 1 }}
      toValues={(item) => ({ id: item.id, label: item.label, regex: item.regex, captureGroup: item.captureGroup })}
      columns={[
        {
          id: "regex",
          header: S.columns.regex,
          cell: (item) => <code className="truncate font-mono text-xs text-ink">{item.regex}</code>,
          title: (item) => item.regex,
          hideBelow: "lg",
        },
        {
          id: "captureGroup",
          header: S.columns.captureGroup,
          cell: (item) => <span className="font-mono text-xs text-ink-secondary">{item.captureGroup}</span>,
          title: () => undefined,
          width: "72px",
          hideBelow: "lg",
        },
      ]}
      renderFields={({ values, set, errors }) => <PatternFields values={values} set={set} errors={errors} />}
    >
      <PatternTester patterns={items.filter((p) => p.isActive)} />
    </CatalogSettings>
  )
}

function PatternFields({
  values,
  set,
  errors,
}: {
  values: CatalogInput<"ticketPattern">
  set: (patch: Partial<CatalogInput<"ticketPattern">>) => void
  errors: Record<string, string>
}) {
  const T = S.ticketPatterns
  const [url, setUrl] = React.useState("")
  const ref = url.trim() ? matchPattern(url.trim(), values) : null
  return (
    <>
      <LabelField
        label={T.label}
        placeholder={T.labelPlaceholder}
        value={values.label}
        error={errors.label}
        onChange={(label) => set({ label })}
      />
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <FieldGroup label={T.regex} required error={errors.regex}>
          <Input
            value={values.regex}
            maxLength={300}
            autoComplete="off"
            spellCheck={false}
            placeholder={T.regexPlaceholder}
            className="font-mono"
            onChange={(e) => set({ regex: e.target.value })}
          />
        </FieldGroup>
        <FieldGroup label={T.captureGroup} required error={errors.captureGroup}>
          <Input
            value={String(values.captureGroup)}
            inputMode="numeric"
            autoComplete="off"
            className="font-mono"
            onChange={(e) => set({ captureGroup: Number(e.target.value.replace(/\D/g, "").slice(0, 1) || "0") })}
          />
        </FieldGroup>
      </div>
      <p className="-mt-2 text-xs text-ink-secondary">{T.captureGroupHelp}</p>
      <FieldGroup label={T.tester} optional>
        <Input
          value={url}
          autoComplete="off"
          spellCheck={false}
          placeholder={T.testerPlaceholder}
          onChange={(e) => setUrl(e.target.value)}
        />
      </FieldGroup>
      {url.trim() ? (
        <p role="status" className="text-sm text-ink">
          {ref ? (
            <>
              {T.testerThis} <span className="font-mono">{ref}</span>
            </>
          ) : (
            <span className="text-ink-secondary">{T.testerThisNone}</span>
          )}
        </p>
      ) : null}
    </>
  )
}

/** Testador da página: cola uma URL e vê o ID que a validação extrairia, com os padrões ativos em ordem. */
function PatternTester({ patterns }: { patterns: TicketPatternItem[] }) {
  const T = S.ticketPatterns
  const [url, setUrl] = React.useState("")
  const found = url.trim() ? extractTicketRef(url, patterns) : null
  const pattern = found ? patterns.find((p) => p.id === found.patternId) : null
  return (
    <section aria-label={T.tester} className="flex max-w-2xl flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <FieldGroup label={T.tester}>
        <Input
          value={url}
          autoComplete="off"
          spellCheck={false}
          placeholder={T.testerPlaceholder}
          onChange={(e) => setUrl(e.target.value)}
        />
      </FieldGroup>
      {url.trim() ? (
        <p role="status" className="text-sm text-ink">
          {found && pattern ? (
            <>
              {T.testerResult} <span className="font-mono font-medium">{found.ref}</span>
              <span className="text-ink-secondary"> · {fill(T.testerPattern, { pattern: pattern.label })}</span>
            </>
          ) : (
            <span className="text-ink-secondary">{T.testerNone}</span>
          )}
        </p>
      ) : null}
    </section>
  )
}

/** Competências: nome, categoria e descrição. Sem posição própria (categoria e nome). */
export function CompetenciesSettings({ items, canWrite }: { items: CompetencyItem[]; canWrite: boolean }) {
  const T = S.competencies
  return (
    <CatalogSettings<CompetencyItem, CatalogInput<"competency">>
      kind="competency"
      items={items}
      canWrite={canWrite}
      texts={T}
      ordered={false}
      schema={catalogSchemas.competency}
      emptyValues={{ label: "", category: "", description: "" }}
      toValues={(item) => ({ id: item.id, label: item.label, category: item.category ?? "", description: item.description ?? "" })}
      columns={[
        {
          id: "category",
          header: S.columns.category,
          cell: (item) => (
            <span className={item.category ? "text-ink-secondary" : "text-ink-tertiary"}>{item.category ?? T.noCategory}</span>
          ),
          width: "160px",
        },
      ]}
      renderFields={({ values, set, errors }) => (
        <>
          <LabelField
            label={T.label}
            placeholder={T.labelPlaceholder}
            value={values.label}
            error={errors.label}
            onChange={(label) => set({ label })}
          />
          <FieldGroup label={T.category} optional error={errors.category}>
            <Input
              value={values.category}
              maxLength={60}
              autoComplete="off"
              placeholder={T.categoryPlaceholder}
              onChange={(e) => set({ category: e.target.value })}
            />
          </FieldGroup>
          <FieldGroup label={T.description} optional error={errors.description}>
            <Input value={values.description} maxLength={300} autoComplete="off" onChange={(e) => set({ description: e.target.value })} />
          </FieldGroup>
        </>
      )}
    />
  )
}

/**
 * Métricas (P17): só o cadastro — chave (fixa depois de criada), rótulo,
 * unidade, direção, sistema de origem, ativa. A coluna de resultados mostra
 * que nada foi importado; nenhum valor de pessoa aparece aqui.
 */
export function MetricsSettings({ items, canWrite }: { items: MetricItem[]; canWrite: boolean }) {
  const T = S.metrics
  return (
    <CatalogSettings<MetricItem, CatalogInput<"metric">>
      kind="metric"
      items={items}
      canWrite={canWrite}
      texts={T}
      ordered={false}
      schema={catalogSchemas.metric}
      emptyValues={{ label: "", key: "", unit: "", direction: "HIGHER_IS_BETTER", sourceSystem: "helpdesk" }}
      toValues={(item) => ({
        id: item.id,
        label: item.label,
        key: item.key,
        unit: item.unit ?? "",
        direction: item.direction,
        sourceSystem: item.sourceSystem ?? "",
      })}
      columns={[
        { id: "key", header: T.key, cell: (item) => <span className="font-mono text-xs text-ink-secondary">{item.key}</span>, width: "176px", hideBelow: "lg" },
        { id: "unit", header: T.unit, cell: (item) => <span className="text-ink-secondary">{item.unit ?? "—"}</span>, width: "96px", hideBelow: "xl" },
        {
          id: "direction",
          header: T.directionField,
          cell: (item) => <span className="text-ink-secondary">{enumLabel("metricDirection", item.direction)}</span>,
          width: "136px",
        },
        {
          id: "results",
          header: T.results,
          cell: (item) => (
            <span className={item.results ? "font-mono text-xs text-ink" : "text-ink-tertiary"}>{item.results || T.noResults}</span>
          ),
          width: "104px",
          hideBelow: "lg",
        },
      ]}
      renderFields={({ values, set, errors }) => (
        <>
          <LabelField label={T.label} placeholder={T.labelPlaceholder} value={values.label} error={errors.label} onChange={(label) => set({ label })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label={T.key} required help={values.id ? T.keyLocked : T.keyHelp} error={errors.key}>
              <Input
                value={values.key}
                maxLength={40}
                autoComplete="off"
                disabled={Boolean(values.id)}
                placeholder={T.keyPlaceholder}
                className="font-mono"
                onChange={(e) => set({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
              />
            </FieldGroup>
            <FieldGroup label={T.unit} optional error={errors.unit}>
              <Input value={values.unit} maxLength={20} autoComplete="off" placeholder={T.unitPlaceholder} onChange={(e) => set({ unit: e.target.value })} />
            </FieldGroup>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label={T.directionField} required>
              {(control) => (
                <Select value={values.direction} onValueChange={(v) => set({ direction: v as CatalogInput<"metric">["direction"] })}>
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METRIC_DIRECTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {enumLabel("metricDirection", d)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FieldGroup>
            <FieldGroup label={T.sourceSystem} optional error={errors.sourceSystem}>
              <Input
                value={values.sourceSystem}
                maxLength={40}
                autoComplete="off"
                placeholder={T.sourceSystemPlaceholder}
                onChange={(e) => set({ sourceSystem: e.target.value })}
              />
            </FieldGroup>
          </div>
        </>
      )}
    />
  )
}
