"use client"

import * as React from "react"

/**
 * Rótulo de um segmento dinâmico do breadcrumb (ex.: o id da pessoa vira o
 * nome dela). O layout da rota renderiza <CrumbLabel segment={id} label={nome} />;
 * o AppShell guarda o rótulo e o breadcrumb passa a mostrá-lo.
 */

export const CrumbLabelsContext = React.createContext<{ set: (segment: string, label: string) => void } | null>(null)

export function CrumbLabel({ segment, label }: { segment: string; label: string }) {
  const context = React.useContext(CrumbLabelsContext)
  React.useEffect(() => {
    context?.set(segment, label)
  }, [context, segment, label])
  return null
}
