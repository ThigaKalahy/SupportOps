import { cookies } from "next/headers"

import { AppShell } from "@/components/shell/app-shell"
import { SIDEBAR_COLLAPSED_VALUE, SIDEBAR_COOKIE } from "@/components/shell/constants"
import { requireUser } from "@/server/access"

/**
 * Shell autenticado. O middleware já barra quem não tem sessão; requireUser()
 * é a segunda barreira e entrega o usuário ao shell. O estado recolhido da
 * sidebar vem do cookie, lido no servidor para não haver salto na hidratação.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const cookieStore = await cookies()
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED_VALUE

  return (
    <AppShell defaultCollapsed={collapsed} user={{ name: user.name, email: user.email, role: user.role }}>
      {children}
    </AppShell>
  )
}
