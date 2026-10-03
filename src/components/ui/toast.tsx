"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

/**
 * Aviso passageiro dentro da página ("Feedback registrado"). Some sozinho em
 * 4 s — o tempo pausa enquanto o ponteiro ou o foco estão sobre ele — e pode
 * ser fechado. Não rouba o foco: a região é `role="status"` (aria-live
 * polite). Nunca usado para pergunta ou erro que exige ação: confirmação é
 * modal, erro de formulário fica no formulário.
 */

const DURATION = 4000

type Tone = "neutral" | "calm"

interface ToastItem {
  id: number
  message: string
  tone: Tone
}

interface ToastApi {
  show: (message: string, options?: { tone?: Tone }) => void
}

const ToastContext = React.createContext<ToastApi | null>(null)

/** Fora de um provider (ex.: componente isolado), o aviso simplesmente não aparece. */
const NOOP: ToastApi = { show: () => {} }

export function useToast(): ToastApi {
  return React.useContext(ToastContext) ?? NOOP
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])
  const nextId = React.useRef(1)

  const dismiss = React.useCallback((id: number) => setItems((current) => current.filter((t) => t.id !== id)), [])
  const api = React.useMemo<ToastApi>(
    () => ({
      show: (message, options) => {
        const id = nextId.current++
        // No máximo três na tela: o mais antigo sai.
        setItems((current) => [...current.slice(-2), { id, message, tone: options?.tone ?? "calm" }])
      },
    }),
    [],
  )

  return (
    <ToastContext value={api}>
      {children}
      <ToastRegion items={items} onDismiss={dismiss} />
    </ToastContext>
  )
}

export function ToastRegion({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={labels.toast.region}
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-[360px]"
    >
      {items.map((item) => (
        <Toast key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
      ))}
    </div>
  )
}

export function Toast({
  item,
  onDismiss,
  static: isStatic = false,
}: {
  item: Pick<ToastItem, "message" | "tone">
  onDismiss: () => void
  /** Sem temporizador (só no /ui-lab). */
  static?: boolean
}) {
  const [paused, setPaused] = React.useState(false)

  React.useEffect(() => {
    if (isStatic || paused) return
    const timer = window.setTimeout(onDismiss, DURATION)
    return () => window.clearTimeout(timer)
  }, [isStatic, paused, onDismiss])

  return (
    <div
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-line bg-surface py-2 pr-2 pl-3 text-sm text-ink shadow-popover",
        item.tone === "calm" ? "border-l-2 border-l-calm" : "border-l-2 border-l-line-strong",
      )}
    >
      <p className="min-w-0 flex-1 py-0.5">{item.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={labels.toast.dismiss}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-ink-secondary hover:bg-surface-sunken hover:text-ink"
      >
        <XIcon className="size-4" strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  )
}
