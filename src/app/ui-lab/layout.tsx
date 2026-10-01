import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { labels } from "@/lib/labels"

export const metadata: Metadata = {
  title: `${labels.uiLab.title} · ${labels.app.name}`,
  robots: { index: false, follow: false },
}

/**
 * /ui-lab existe só em desenvolvimento (CLAUDE.md, segurança): expõe estados de
 * componente e não deve existir em produção.
 */
export default function UiLabLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound()
  return children
}
