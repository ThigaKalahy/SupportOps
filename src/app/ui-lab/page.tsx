import { PlusIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DateStamp } from "@/components/ui/date-stamp"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MetaLabel } from "@/components/ui/meta-label"
import { PageHeader } from "@/components/ui/page-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { SeverityDot } from "@/components/ui/severity-dot"
import { Sparkline } from "@/components/ui/sparkline"
import { StatStrip } from "@/components/ui/stat-strip"
import { StatusPill } from "@/components/ui/status-pill"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { todayBusinessDate } from "@/lib/dates"
import { enumLabel, labels } from "@/lib/labels"
import { deadlineSeverity, SEVERITIES } from "@/lib/severity"

import { LabDataTables } from "./_components/lab-data-tables"
import { LabCalendar, LabOverlays } from "./_components/lab-overlays"
import { LabSection, Specimen } from "./_components/specimen"
import { addDays, buildAgreements, demo, notes, people, sectionCopy, seniorities } from "./_fixtures"

// Datas relativas a "hoje": a página não pode ser congelada no build.
export const dynamic = "force-dynamic"

const S = labels.uiLab.states

const structuralTokens = [
  ["--canvas", "#FBFBFC", "bg-canvas"],
  ["--surface", "#FFFFFF", "bg-surface"],
  ["--surface-sunken", "#F4F5F7", "bg-surface-sunken"],
  ["--ink", "#16181D", "bg-ink"],
  ["--ink-secondary", "#5C6270", "bg-ink-secondary"],
  ["--ink-tertiary", "#8A909E", "bg-ink-tertiary"],
  ["--line", "#E4E6EB", "bg-line"],
  ["--line-strong", "#CDD1D9", "bg-line-strong"],
  ["--accent", "#2C4A7C", "bg-accent"],
  ["--accent-wash", "#EDF1F6", "bg-accent-wash"],
] as const

const severityTokens = [
  ["--calm", "#487756", "bg-calm", "#EDF3EF", "bg-calm-wash"],
  ["--attention", "#94650C", "bg-attention", "#FBF3E2", "bg-attention-wash"],
  ["--attention-strong", "#9E4F14", "bg-attention-strong", "#FAEEE4", "bg-attention-strong-wash"],
  ["--overdue", "#A33A32", "bg-overdue", "#FAECEA", "bg-overdue-wash"],
  ["--neutral", "#5C6270", "bg-neutral", "#F4F5F7", "bg-neutral-wash"],
] as const

const typeScale = [
  ["text-2xs", "11px", "Rótulos mono uppercase, metadados mínimos"],
  ["text-xs", "12px", "Texto auxiliar, legendas"],
  ["text-sm", "13px", "Corpo de UI padrão, tabelas"],
  ["text-base", "15px", "Destaque dentro de conteúdo, subtítulos"],
  ["text-lg", "18px", "Título de seção"],
  ["text-xl", "22px", "Título de página"],
  ["text-2xl", "28px", "Número de destaque (uso raro)"],
] as const

function Swatch({ name, hex, className }: { name: string; hex: string; className: string }) {
  return (
    <div className="flex w-36 flex-col gap-1.5">
      <div className={`h-10 rounded-sm border border-line ${className}`} />
      <div className="flex flex-col">
        <span className="font-mono text-2xs text-ink">{name}</span>
        <span className="font-mono text-2xs text-ink-secondary">{hex}</span>
      </div>
    </div>
  )
}

export default function UiLabPage() {
  const today = todayBusinessDate()
  const agreements = buildAgreements(today)
  const now = new Date()

  const deadlineSamples = [
    { offset: null, resolved: true },
    { offset: null, resolved: false },
    { offset: 12, resolved: false },
    { offset: 3, resolved: false },
    { offset: 1, resolved: false },
    { offset: 0, resolved: false },
    { offset: -2, resolved: false },
    { offset: -12, resolved: false },
    { offset: -45, resolved: false },
  ].map((sample) => {
    const dueDate = sample.offset === null ? null : addDays(today, sample.offset)
    return { dueDate, ...deadlineSeverity(dueDate, { resolved: sample.resolved, today }) }
  })

  return (
    <main className="mx-auto flex w-full max-w-page flex-col gap-8 px-4 py-6 md:px-6">
      <PageHeader title={labels.uiLab.title} subtitle={labels.uiLab.subtitle} />

      {/* Tokens */}
      <LabSection id="tokens" title={sectionCopy.tokens.title} description={sectionCopy.tokens.description}>
        <div className="flex flex-wrap gap-4">
          {structuralTokens.map(([name, hex, cls]) => (
            <Swatch key={name} name={name} hex={hex} className={cls} />
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {severityTokens.map(([name, hex, cls, washHex, washCls]) => (
            <div key={name} className="flex gap-2">
              <Swatch name={name} hex={hex} className={cls} />
              <Swatch name={`${name}-wash`} hex={washHex} className={washCls} />
            </div>
          ))}
        </div>
      </LabSection>

      {/* Tipografia */}
      <LabSection id="typography" title={sectionCopy.typography.title} description={sectionCopy.typography.description}>
        <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {typeScale.map(([cls, px, use]) => (
            <div key={cls} className="grid grid-cols-[64px_1fr] items-baseline gap-4 px-4 py-2 md:grid-cols-[64px_1fr_280px]">
              <span className="font-mono text-2xs text-ink-secondary">{px}</span>
              <span className={`${cls} truncate text-ink`}>Registro de gestão do time de suporte</span>
              <span className="hidden text-xs text-ink-secondary md:block">{use}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-8">
          <Specimen state="IBM Plex Sans 400 / 500 / 600">
            <span className="text-sm">Combinado revisado</span>
            <span className="text-sm font-medium">Combinado revisado</span>
            <span className="text-sm font-semibold">Combinado revisado</span>
          </Specimen>
          <Specimen state="IBM Plex Mono · tabular-nums">
            <span className="font-mono text-sm">01/10/2026 14:05</span>
            <span className="font-mono text-sm">1.234,56</span>
            <span className="font-mono text-sm">111.111</span>
          </Specimen>
        </div>
      </LabSection>

      {/* Raio e sombra */}
      <LabSection id="shape" title={sectionCopy.shape.title} description={sectionCopy.shape.description}>
        <div className="flex flex-wrap gap-6">
          <Specimen state="rounded-sm · 4px">
            <div className="size-16 rounded-sm border border-line-strong bg-surface" />
          </Specimen>
          <Specimen state="rounded-lg · 6px">
            <div className="size-16 rounded-lg border border-line-strong bg-surface" />
          </Specimen>
          <Specimen state="shadow-popover">
            <div className="size-16 rounded-lg border border-line bg-surface shadow-popover" />
          </Specimen>
        </div>
      </LabSection>

      {/* Button */}
      <LabSection id="buttons" title={sectionCopy.buttons.title} description={sectionCopy.buttons.description}>
        {(["default", "secondary", "ghost", "destructive"] as const).map((variant) => {
          const text =
            variant === "default"
              ? demo.buttonPrimary
              : variant === "secondary"
                ? demo.buttonSecondary
                : variant === "ghost"
                  ? demo.buttonGhost
                  : demo.buttonDestructive
          return (
            <div key={variant} className="flex flex-wrap gap-6">
              <Specimen state={`${variant} · ${S.default}`}>
                <Button variant={variant}>{text}</Button>
                <Button variant={variant} size="sm">
                  {text}
                </Button>
              </Specimen>
              <Specimen state={S.hover}>
                <Button variant={variant} data-force-state="hover">
                  {text}
                </Button>
              </Specimen>
              <Specimen state={S.focus}>
                <Button variant={variant} data-force-state="focus">
                  {text}
                </Button>
              </Specimen>
              <Specimen state={S.disabled}>
                <Button variant={variant} disabled>
                  {text}
                </Button>
              </Specimen>
              <Specimen state={S.loading}>
                <Button variant={variant} loading>
                  {text}
                </Button>
              </Specimen>
            </div>
          )
        })}
        <div className="flex flex-wrap gap-6">
          <Specimen state="link">
            <Button variant="link">{demo.buttonLink}</Button>
          </Specimen>
          <Specimen state="icon · icon-sm">
            <Button variant="secondary" size="icon" aria-label={demo.iconButton}>
              <PlusIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={demo.iconButton}>
              <PlusIcon />
            </Button>
          </Specimen>
          <Specimen state="com ícone">
            <Button>
              <PlusIcon />
              {demo.pageAction}
            </Button>
          </Specimen>
        </div>
      </LabSection>

      {/* Campos */}
      <LabSection id="controls" title={sectionCopy.controls.title} description={sectionCopy.controls.description}>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          <Specimen state={S.default}>
            <FieldGroup label={demo.fieldTitle} help={demo.fieldTitleHelp} className="w-full">
              <Input placeholder={demo.fieldTitlePlaceholder} />
            </FieldGroup>
          </Specimen>
          <Specimen state={S.hover}>
            <FieldGroup label={demo.fieldTitle} className="w-full">
              <Input placeholder={demo.fieldTitlePlaceholder} data-force-state="hover" />
            </FieldGroup>
          </Specimen>
          <Specimen state={S.focus}>
            <FieldGroup label={demo.fieldTitle} className="w-full">
              <Input defaultValue="Revisar macro de reembolso" data-force-state="focus" />
            </FieldGroup>
          </Specimen>
          <Specimen state={S.disabled}>
            <FieldGroup label={demo.fieldTitle} className="w-full">
              <Input defaultValue="Revisar macro de reembolso" disabled />
            </FieldGroup>
          </Specimen>
          <Specimen state={S.error}>
            <FieldGroup label={demo.fieldTitle} error={demo.fieldTitleError} required className="w-full">
              <Input placeholder={demo.fieldTitlePlaceholder} />
            </FieldGroup>
          </Specimen>
          <Specimen state={`${S.empty} · ${labels.common.optional}`}>
            <FieldGroup label={demo.fieldNotes} optional className="w-full">
              <Textarea placeholder={demo.fieldNotesPlaceholder} />
            </FieldGroup>
          </Specimen>
          <Specimen state={`Select · ${S.empty}`}>
            <FieldGroup label={demo.fieldOwner} className="w-full">
              <Select>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={demo.fieldOwnerPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{demo.fieldOwner}</SelectLabel>
                    {people.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FieldGroup>
          </Specimen>
          <Specimen state={`Select · ${S.selected}`}>
            <FieldGroup label={demo.fieldSeniority} className="w-full">
              <Select defaultValue="Pleno">
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {seniorities.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldGroup>
          </Specimen>
          <Specimen state={`Select · ${S.disabled}`}>
            <FieldGroup label={demo.fieldSeniority} className="w-full">
              <Select defaultValue="Sênior" disabled>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {seniorities.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldGroup>
          </Specimen>
        </div>
      </LabSection>

      {/* Checkbox */}
      <LabSection id="checkbox" title={sectionCopy.checkbox.title}>
        <div className="flex flex-wrap gap-8">
          {[
            { state: S.default, id: "cb-1", text: demo.checkboxShared, props: {} },
            { state: S.selected, id: "cb-2", text: demo.checkboxReviewed, props: { defaultChecked: true } },
            { state: "indeterminate", id: "cb-3", text: demo.checkboxPartial, props: { checked: "indeterminate" as const } },
            { state: S.focus, id: "cb-4", text: demo.checkboxShared, props: { "data-force-state": "focus" } },
            { state: S.disabled, id: "cb-5", text: demo.checkboxReviewed, props: { disabled: true, defaultChecked: true } },
            { state: S.error, id: "cb-6", text: demo.checkboxRequired, props: { "aria-invalid": true } },
          ].map(({ state, id, text, props }) => (
            <Specimen key={id} state={state}>
              <div className="flex items-center gap-2">
                <Checkbox id={id} {...props} />
                <Label htmlFor={id} className="font-normal">
                  {text}
                </Label>
              </div>
            </Specimen>
          ))}
        </div>
      </LabSection>

      {/* Status e metadados */}
      <LabSection id="status" title={sectionCopy.status.title} description={sectionCopy.status.description}>
        <div className="flex flex-wrap gap-8">
          <Specimen state="StatusPill">
            {SEVERITIES.map((s) => (
              <StatusPill key={s} severity={s} label={enumLabel("severity", s)} />
            ))}
            <StatusPill severity="attention" strong label={labels.severity.attentionStrong} />
          </Specimen>
          <Specimen state="SeverityDot · 6px">
            {SEVERITIES.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-sm">
                <SeverityDot severity={s} label={enumLabel("severity", s)} />
                {enumLabel("severity", s)}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-sm">
              <SeverityDot severity="attention" strong label={labels.severity.attentionStrong} />
              {labels.severity.attentionStrong}
            </span>
          </Specimen>
          <Specimen state="Badge">
            <Badge>{seniorities[1]}</Badge>
            <Badge variant="outline">{demo.tabsTimeline}</Badge>
            <Badge variant="accent">{demo.checkboxShared}</Badge>
          </Specimen>
          <Specimen state="MetaLabel">
            <MetaLabel>Feedback</MetaLabel>
            <MetaLabel>1:1</MetaLabel>
            <MetaLabel>Combinado</MetaLabel>
          </Specimen>
          <Specimen state="DateStamp">
            <DateStamp date={now} />
            <DateStamp date={now} display="datetime" />
            <DateStamp date={now} display="short" />
            <DateStamp date={today} kind="business" className="text-ink-secondary" />
          </Specimen>
        </div>
      </LabSection>

      {/* Escala de prazo */}
      <LabSection id="deadline" title={sectionCopy.deadline.title} description={sectionCopy.deadline.description}>
        <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {deadlineSamples.map((s, i) => (
            <div key={i} className="grid h-10 grid-cols-[16px_112px_1fr] items-center gap-3 px-3 sm:grid-cols-[16px_112px_200px_1fr]">
              <SeverityDot severity={s.severity} strong={s.strong} label={s.label} />
              {s.dueDate ? <DateStamp date={s.dueDate} kind="business" /> : <span className="text-ink-tertiary">—</span>}
              <StatusPill severity={s.severity} strong={s.strong} label={s.label} />
              <span className="hidden font-mono text-2xs text-ink-secondary sm:block">
                {s.stage}
                {s.strong ? " · strong" : ""}
              </span>
            </div>
          ))}
        </div>
      </LabSection>

      {/* PageHeader */}
      <LabSection id="page-header" title={sectionCopy.pageHeader.title}>
        <div className="rounded-lg border border-line bg-surface p-4">
          <PageHeader
            title={demo.pageTitle}
            subtitle={demo.pageSubtitle}
            actions={
              <>
                <Button variant="secondary">{demo.popoverTrigger}</Button>
                <Button>
                  <PlusIcon />
                  {demo.pageAction}
                </Button>
              </>
            }
          />
        </div>
      </LabSection>

      {/* EmptyState */}
      <LabSection id="empty-state" title={sectionCopy.emptyState.title} description={sectionCopy.emptyState.description}>
        <div className="grid gap-6 lg:grid-cols-2">
          <Specimen state={S.default}>
            <div className="w-full rounded-lg border border-line bg-surface">
              <EmptyState
                title={demo.emptyTitle}
                direction={demo.emptyDirection}
                action={<Button variant="secondary">{demo.emptyAction}</Button>}
              />
            </div>
          </Specimen>
          <Specimen state={S.compact}>
            <div className="w-full rounded-lg border border-line bg-surface">
              <EmptyState size="compact" title={demo.tableEmptyTitle} direction={demo.tableEmptyDirection} />
            </div>
          </Specimen>
        </div>
      </LabSection>

      {/* StatStrip */}
      <LabSection id="stat-strip" title={sectionCopy.statStrip.title} description={sectionCopy.statStrip.description}>
        <Specimen state={S.default}>
          <StatStrip
            className="w-full"
            items={[
              { id: "open", label: demo.statOpen, value: 14 },
              { id: "overdue", label: demo.statOverdue, value: 3, severity: "overdue" },
              { id: "completion", label: demo.statCompletion, value: "71%", coverage: demo.statCompletionCoverage },
              { id: "csat", label: demo.statCsat, value: 4.8, coverage: demo.statCsatCoverage },
            ]}
          />
        </Specimen>
        <Specimen state={S.empty}>
          <StatStrip
            className="w-full"
            items={[
              { id: "open", label: demo.statOpen, value: 0 },
              { id: "csat", label: demo.statCsat, value: null, coverage: "0 avaliações" },
              { id: "daily", label: demo.statDaily, value: null },
            ]}
          />
        </Specimen>
      </LabSection>

      {/* Sparkline */}
      <LabSection id="sparkline" title={sectionCopy.sparkline.title} description={sectionCopy.sparkline.description}>
        <div className="flex flex-wrap gap-8">
          <Specimen state={S.default}>
            <Sparkline label={demo.sparkLabel} values={[9, 11, 10, 14, 13, 15, 12, 14]} />
            <span className="font-mono text-sm">14</span>
          </Specimen>
          <Specimen state="overdue">
            <Sparkline label={demo.statOverdue} values={[0, 1, 1, 2, 2, 3, 5, 3]} className="text-overdue" width={120} />
          </Specimen>
          <Specimen state="flat">
            <Sparkline label={demo.sparkLabel} values={[4, 4, 4, 4, 4]} />
          </Specimen>
          <Specimen state={S.empty}>
            <Sparkline label={demo.sparkLabel} values={[]} />
          </Specimen>
        </div>
      </LabSection>

      {/* DataTable */}
      <LabSection id="data-table" title={sectionCopy.dataTable.title} description={sectionCopy.dataTable.description}>
        <LabDataTables agreements={agreements} today={today} />
      </LabSection>

      {/* Tabs */}
      <LabSection id="tabs" title={sectionCopy.tabs.title}>
        <div className="flex flex-col gap-6">
          <Specimen state={`line · ${S.selected} · ${S.disabled}`}>
            <Tabs defaultValue="overview" className="w-full">
              <TabsList>
                <TabsTrigger value="overview">{demo.tabsOverview}</TabsTrigger>
                <TabsTrigger value="timeline">{demo.tabsTimeline}</TabsTrigger>
                <TabsTrigger value="agreements">{demo.tabsAgreements}</TabsTrigger>
                <TabsTrigger value="development">{demo.tabsDevelopment}</TabsTrigger>
                <TabsTrigger value="records">{demo.tabsRecords}</TabsTrigger>
                <TabsTrigger value="archived" disabled>
                  {demo.tabsArchived}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="text-ink-secondary">
                {notes[0]}
              </TabsContent>
              <TabsContent value="timeline" className="text-ink-secondary">
                {notes[1]}
              </TabsContent>
            </Tabs>
          </Specimen>
          <Specimen state="segmented">
            <Tabs defaultValue="90">
              <TabsList variant="segmented">
                <TabsTrigger value="30">{demo.period30}</TabsTrigger>
                <TabsTrigger value="90">{demo.period90}</TabsTrigger>
                <TabsTrigger value="180">{demo.period180}</TabsTrigger>
                <TabsTrigger value="all">{demo.periodAll}</TabsTrigger>
              </TabsList>
            </Tabs>
          </Specimen>
        </div>
      </LabSection>

      {/* Sobreposições */}
      <LabSection id="overlays" title={sectionCopy.overlays.title} description={sectionCopy.overlays.description}>
        <LabOverlays />
      </LabSection>

      {/* Calendar */}
      <LabSection id="calendar" title={sectionCopy.calendar.title}>
        <LabCalendar today={today} />
      </LabSection>

      {/* Avatar, Separator, ScrollArea */}
      <LabSection id="misc" title={sectionCopy.misc.title}>
        <div className="flex flex-wrap items-start gap-8">
          <Specimen state="Avatar · sm / default / lg">
            {(["sm", "default", "lg"] as const).map((size) => (
              <Avatar key={size} size={size}>
                <AvatarFallback>HL</AvatarFallback>
              </Avatar>
            ))}
          </Specimen>
          <Specimen state="AvatarGroup">
            <AvatarGroup>
              {people.slice(0, 4).map((name) => (
                <Avatar key={name} size="sm">
                  <AvatarFallback>
                    {name
                      .split(" ")
                      .map((p) => p[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
              ))}
            </AvatarGroup>
          </Specimen>
          <Specimen state="Separator">
            <div className="flex h-5 items-center gap-3 text-sm text-ink-secondary">
              <span>{people[0]}</span>
              <Separator orientation="vertical" />
              <span>{seniorities[1]}</span>
              <Separator orientation="vertical" />
              <DateStamp date={addDays(today, -400)} kind="business" />
            </div>
          </Specimen>
          <Specimen state="ScrollArea">
            <ScrollArea className="h-40 w-72 rounded-lg border border-line bg-surface">
              <div className="p-3">
                <MetaLabel>{demo.scrollTitle}</MetaLabel>
                {notes.map((note, i) => (
                  <div key={i} className="flex gap-3 border-b border-line py-2 text-sm last:border-b-0">
                    <DateStamp date={addDays(today, -i * 3)} kind="business" display="short" className="text-ink-secondary" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Specimen>
        </div>
      </LabSection>
    </main>
  )
}
