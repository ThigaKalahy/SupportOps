"use client"

import * as React from "react"
import Link from "next/link"
import { FlameIcon } from "lucide-react"

import { createWatch, reviewWatch } from "@/actions/watch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { StatusPill } from "@/components/ui/status-pill"
import { fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"
import { HEAT_SEVERITY, WATCH_HEATS, type WatchHeat, type WatchOrigin } from "@/lib/watch"

const W = labels.watch
const B = W.button

export interface WatchLink {
  memberId?: string
  centralId?: string
  agreementId?: string
  dailyId?: string
  priorityValidationId?: string
  devReturnId?: string
  oneOnOneId?: string
  feedbackId?: string
}

const heatText: Record<WatchHeat, string> = { HIGH: "text-overdue", MEDIUM: "text-attention", LOW: "text-ink-secondary" }

/**
 * "Colocar em observação" em um clique, onde a informação aparece (P21).
 * Ícone de 16px discreto que abre um popover INLINE (não dialog) com o título
 * pré-preenchido pelo contexto, o grau e o contexto opcional. Salvar fecha o
 * popover e confirma por 2 s, sem tirar ninguém do formulário em que está.
 *
 * Já existe observação ativa ligada ao registro: o ícone fica preenchido na cor
 * do grau e o popover mostra a existente ("Revisado hoje" e "Abrir
 * observação") em vez de criar outra. A observação nasce PRIVATE (D25).
 */
export function WatchButton({
  defaults,
  link = {},
  origin,
  existing: initialExisting = null,
  variant = "icon",
  pendingHint,
  onCreated,
  className,
  openByDefault = false,
  skipTab = false,
  openSignal = 0,
  labelText,
  repeatable = false,
  createAction = createWatch,
}: {
  defaults: { title: string; context?: string; heat?: WatchHeat }
  link?: WatchLink
  origin: WatchOrigin
  existing?: { id: string; heat: WatchHeat } | null
  /** "label": botão com texto ("Colocar em observação", "Nova observação"). */
  variant?: "icon" | "label"
  /** Texto para quando o vínculo só se completa ao salvar o formulário (daily, 1:1...). */
  pendingHint?: string
  /** Avisa o formulário que guarda observações pendentes de vínculo. */
  onCreated?: (id: string, heat: WatchHeat) => void
  className?: string
  /** Abre ao montar (ex.: /watch?new=1 vindo da paleta). */
  openByDefault?: boolean
  /** Fora do Tab (linhas da daily, onde Tab anda de campo em campo); o formulário oferece um atalho. */
  skipTab?: boolean
  /** Muda o número para abrir de fora (atalho de teclado do formulário). */
  openSignal?: number
  /** Texto do botão na variante "label" (padrão: "Colocar em observação"). */
  labelText?: string
  /** Sem registro de origem (manual, perfil): cada clique cria uma nova; o botão volta ao estado inicial. */
  repeatable?: boolean
  /** Quem cria no servidor; o /ui-lab passa uma versão simulada. */
  createAction?: (input: Record<string, unknown>) => Promise<{ ok: true; id: string; existed: boolean } | { ok: false; error: string }>
}) {
  const [open, setOpen] = React.useState(openByDefault)
  const [existing, setExisting] = React.useState(initialExisting)
  const [title, setTitle] = React.useState(defaults.title)
  const [context, setContext] = React.useState(defaults.context ?? "")
  const [heat, setHeat] = React.useState<WatchHeat>(defaults.heat ?? "MEDIUM")
  const [error, setError] = React.useState<string | null>(null)
  const [confirmed, setConfirmed] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()
  const titleRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => setExisting(initialExisting), [initialExisting])
  React.useEffect(() => {
    if (openSignal > 0) setOpen(true)
  }, [openSignal])

  // Pré-preenchimento acompanha o contexto (o texto da nota muda enquanto se digita) até abrir.
  React.useEffect(() => {
    if (open) return
    setTitle(defaults.title)
    setContext(defaults.context ?? "")
  }, [defaults.title, defaults.context, open])

  React.useEffect(() => {
    if (!confirmed) return
    const t = setTimeout(() => setConfirmed(null), 2000)
    return () => clearTimeout(t)
  }, [confirmed])

  function save() {
    if (pending) return
    if (!title.trim()) {
      setError(W.validation.title)
      return titleRef.current?.focus()
    }
    setError(null)
    startTransition(async () => {
      const result = await createAction({ title, heat, context, origin, ...link })
      if (!result.ok) return setError(result.error)
      if (repeatable) {
        setTitle(defaults.title)
        setContext(defaults.context ?? "")
        setHeat(defaults.heat ?? "MEDIUM")
      } else setExisting({ id: result.id, heat })
      onCreated?.(result.id, heat)
      setOpen(false)
      setConfirmed(B.saved)
    })
  }

  function review() {
    if (!existing) return
    startTransition(async () => {
      const result = await reviewWatch({ id: existing.id })
      if (!result.ok) return setError(result.error)
      setOpen(false)
      setConfirmed(W.reviewedToast)
    })
  }

  const label = existing ? fill(B.watching, { heat: W.heat[existing.heat].toLowerCase() }) : variant === "label" ? (labelText ?? B.label) : B.label

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setError(null)
        }}
      >
        <PopoverTrigger asChild>
          {variant === "label" && !existing ? (
            <Button type="button" variant="secondary" size="sm">
              <FlameIcon aria-hidden />
              {label}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              title={label}
              tabIndex={skipTab ? -1 : undefined}
              className={existing ? heatText[existing.heat] : "text-ink-secondary"}
            >
              <FlameIcon aria-hidden className={existing ? "fill-current" : undefined} />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (!existing) titleRef.current?.focus()
          }}
          // Enter/Esc do popover não chegam ao formulário de fora (daily, 1:1).
          onKeyDown={(event) => {
            event.stopPropagation()
            if (!existing && event.key === "Enter" && (event.ctrlKey || event.metaKey || (event.target as HTMLElement).tagName === "INPUT")) {
              event.preventDefault()
              save()
            }
          }}
        >
          {existing ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <StatusPill severity={HEAT_SEVERITY[existing.heat]} label={W.heat[existing.heat]} />
                <span className="truncate text-sm text-ink">{title || defaults.title}</span>
              </div>
              {error ? <p role="alert" className="text-xs text-overdue">{error}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" loading={pending} onClick={review}>
                  {W.actions.reviewed}
                </Button>
                <Button asChild type="button" variant="secondary" size="sm">
                  <Link href={`/watch?open=${existing.id}`} target="_blank" rel="noopener">
                    {W.actions.open}
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                {B.title}
                <Input ref={titleRef} value={title} maxLength={160} autoComplete="off" aria-invalid={Boolean(error) || undefined} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-sm font-medium text-ink">{B.heat}</legend>
                <div className="flex gap-1" role="radiogroup" aria-label={B.heat}>
                  {WATCH_HEATS.map((h) => (
                    <Button
                      key={h}
                      type="button"
                      size="sm"
                      role="radio"
                      aria-checked={heat === h}
                      variant={heat === h ? "secondary" : "ghost"}
                      className={cn("flex-1", heat === h && heatText[h], heat === h && "border-current")}
                      onClick={() => setHeat(h)}
                    >
                      {W.heat[h]}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                {B.context}
                <Input value={context} maxLength={1000} autoComplete="off" placeholder={B.contextPlaceholder} onChange={(e) => setContext(e.target.value)} />
              </label>
              {pendingHint ? <p className="text-xs text-ink-secondary">{pendingHint}</p> : null}
              {error ? <p role="alert" className="text-xs text-overdue">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                  {B.cancel}
                </Button>
                <Button type="button" size="sm" loading={pending} onClick={save}>
                  {B.save}
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {confirmed ? (
        <span role="status" className="text-xs text-calm">
          {confirmed}
        </span>
      ) : null}
    </span>
  )
}
