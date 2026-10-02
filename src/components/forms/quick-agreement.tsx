"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import type { CreateAgreementInput } from "@/lib/validators/agreement"

import { AgreementDialog } from "./agreement-dialog"
import type { RecordTarget } from "./note-dialog"

type Origin = CreateAgreementInput["origin"]

interface OpenOptions {
  /** Responsável já definido (ex.: aberto do perfil). */
  member?: RecordTarget
  /** Sobrepõe a origem deduzida da página. */
  origin?: Origin
}

const QuickAgreementContext = React.createContext<{ open: (options?: OpenOptions) => void } | null>(null)

/** Origem pelo contexto: aberto numa daily é DAILY; no resto, combinado do gestor. */
function originFor(pathname: string): Origin {
  if (pathname.startsWith("/dailies")) return "DAILY"
  return "MANAGER"
}

/** Campo editável ou dialog aberto: o atalho não pode roubar a tecla. */
function shortcutBlocked(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) return true
  const target = event.target as HTMLElement | null
  if (target?.closest("input, textarea, select, [contenteditable=true], [role=combobox], [role=listbox], [role=menu]")) {
    return true
  }
  return document.querySelector("[role=dialog], [role=alertdialog]") !== null
}

/**
 * Criação rápida de combinado acionável de qualquer lugar do app: atalho C
 * (fora de campos de texto), botão "Novo combinado" de cada página e ações do
 * perfil. Só existe para quem escreve — sem `members`, nada é montado.
 */
export function QuickAgreementProvider({
  members,
  children,
}: {
  /** Pessoas ativas; null para quem só lê. */
  members: { id: string; preferredName: string }[] | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [options, setOptions] = React.useState<OpenOptions | null>(null)
  const context = React.useMemo(() => ({ open: (opts: OpenOptions = {}) => setOptions(opts) }), [])

  React.useEffect(() => {
    if (!members) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "c" || shortcutBlocked(event)) return
      event.preventDefault()
      setOptions({})
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [members])

  if (!members) return <>{children}</>

  return (
    <QuickAgreementContext value={context}>
      {children}
      <AgreementDialog
        open={options !== null}
        onOpenChange={(open) => !open && setOptions(null)}
        member={options?.member}
        members={members}
        origin={options?.origin ?? originFor(pathname)}
      />
    </QuickAgreementContext>
  )
}

/** Abre a criação rápida. null para quem só lê (sem provedor ativo). */
export function useQuickAgreement() {
  return React.useContext(QuickAgreementContext)
}
