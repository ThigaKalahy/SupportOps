import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { labels } from "@/lib/labels"

export const metadata: Metadata = {
  title: `${labels.notFound.title} · ${labels.app.name}`,
}

/** 404 global em pt-BR (substitui a página padrão do Next, em inglês). */
export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <EmptyState
        title={labels.notFound.title}
        direction={labels.notFound.direction}
        action={
          <Button asChild variant="secondary">
            <Link href="/">{labels.notFound.action}</Link>
          </Button>
        }
      />
    </main>
  )
}
