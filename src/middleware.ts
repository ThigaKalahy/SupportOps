import NextAuth from "next-auth"

import { authConfig } from "@/server/auth.config"

/**
 * Protege todas as rotas, exceto /login (decidido em authConfig.authorized).
 * Importa SÓ a configuração leve: Prisma e bcrypt não rodam no Edge.
 */
export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  // /api/auth precisa ficar acessível para o próprio Auth.js (CSRF, callback, sessão).
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}
