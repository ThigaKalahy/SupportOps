"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { labels } from "@/lib/labels"

const E = labels.appError

/**
 * Erro inesperado numa tela do app (C6): mensagem do próprio sistema, em pt-BR,
 * no lugar do "Application error" do navegador. O caso mais comum é uma página
 * aberta antes de um deploy chamando uma ação que mudou — recarregar resolve.
 * O shell (sidebar, barra de contexto) continua de pé.
 */
export default function AppError({ error }: { error: Error & { digest?: string } }) {
  React.useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="rounded-lg border border-line bg-surface">
      <EmptyState
        title={E.title}
        direction={E.direction}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => window.location.reload()}>{E.reload}</Button>
            <Button asChild variant="secondary">
              <Link href="/">{E.home}</Link>
            </Button>
          </div>
        }
      />
    </div>
  )
}
