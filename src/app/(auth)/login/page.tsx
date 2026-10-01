import type { Metadata } from "next"

import { labels } from "@/lib/labels"

import { LoginForm } from "./login-form"

export const metadata: Metadata = {
  title: `${labels.auth.submit} · ${labels.app.name}`,
  robots: { index: false, follow: false },
}

/** Única rota pública. Sem cadastro, sem recuperação de senha. */
export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[360px] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex size-6 items-center justify-center rounded-sm border border-line-strong font-mono text-xs font-medium text-ink"
            >
              P
            </span>
            <h1 className="text-lg font-semibold text-ink">{labels.app.name}</h1>
          </div>
          <p className="text-sm text-ink-secondary">{labels.auth.explanation}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-5">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
