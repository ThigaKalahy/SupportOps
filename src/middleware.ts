import NextAuth from "next-auth"

import { authConfig } from "@/server/auth.config"

/**
 * Protege todas as rotas, exceto /login (decidido em authConfig.authorized).
 * Importa SÓ a configuração leve: Prisma e bcrypt não rodam no Edge.
 */
export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  // /api/auth precisa ficar acessível para o próprio Auth.js (CSRF, callback, sessão).
  // /api/v1 (C22) é a API de combinados: autentica pela chave do time, na própria rota (sem sessão).
  // Manifest e ícones são públicos: o navegador os busca sem cookie ao instalar o atalho.
  matcher: ["/((?!api/auth|api/v1|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|apple-icon.png|icons/).*)"],
}
