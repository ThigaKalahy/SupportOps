"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { CONTEXT_ACTIONS_ID } from "./constants"

/**
 * Injeta a ação primária da página no slot direito da barra de contexto.
 * Uso, dentro de qualquer página do grupo (app):
 *   <ContextActions><Button>Novo combinado</Button></ContextActions>
 */
export function ContextActions({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = React.useState<HTMLElement | null>(null)

  React.useEffect(() => {
    setTarget(document.getElementById(CONTEXT_ACTIONS_ID))
  }, [])

  return target ? createPortal(children, target) : null
}
