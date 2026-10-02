"use client"

import * as React from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { labels } from "@/lib/labels"
import { buildDailyWhatsApp, type WhatsAppDaily } from "@/server/whatsapp"

const W = labels.dailies.whatsapp

/** Copia texto: Clipboard API; sem ela (HTTP, permissão negada), textarea oculta + execCommand. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // cai no fallback abaixo
  }
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    area.remove()
  }
}

/**
 * "Copiar para WhatsApp": gera o texto (src/server/whatsapp.ts) e copia. A
 * confirmação é o próprio botão dizendo "Copiado" por 2 segundos — sem toast,
 * sem janela. Sem link wa.me (o WhatsApp não preenche texto em grupo).
 */
export function CopyWhatsAppButton({
  daily,
  size = "sm",
  variant = "secondary",
}: {
  /** Dados da daily, ou função que os monta na hora (formulário ainda não salvo). */
  daily: WhatsAppDaily | (() => WhatsAppDaily)
  size?: "sm" | "default"
  variant?: "secondary" | "ghost"
}) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle")
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function copy() {
    const data = typeof daily === "function" ? daily() : daily
    const ok = await copyText(buildDailyWhatsApp(data))
    setState(ok ? "copied" : "failed")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState("idle"), 2000)
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={copy} aria-live="polite">
      {state === "copied" ? <CheckIcon /> : <CopyIcon />}
      {state === "copied" ? W.copied : state === "failed" ? W.failed : W.copy}
    </Button>
  )
}
