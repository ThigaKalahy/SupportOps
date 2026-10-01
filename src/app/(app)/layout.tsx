import { cookies } from "next/headers"

import { AppShell } from "@/components/shell/app-shell"
import { SIDEBAR_COLLAPSED_VALUE, SIDEBAR_COOKIE } from "@/components/shell/constants"

/**
 * Shell autenticado (a autenticação entra no P5). O estado recolhido da
 * sidebar vem do cookie, lido no servidor para não haver salto na hidratação.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED_VALUE

  return <AppShell defaultCollapsed={collapsed}>{children}</AppShell>
}
