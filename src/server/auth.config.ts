import type { NextAuthConfig } from "next-auth"

import { isAllowedEmail } from "./allowlist"

/**
 * Configuração LEVE do Auth.js: é o que o middleware importa, e o middleware
 * roda no Edge. Aqui não entra Prisma, bcrypt nem provider — importar Prisma
 * no middleware quebra o build na Vercel. O provider Credentials fica em
 * src/server/auth.ts (runtime Node).
 */

const SEVEN_DAYS = 7 * 24 * 60 * 60

export const authConfig = {
  pages: { signIn: "/login" },
  // Credentials exige sessão JWT. Renovada por atividade a cada hora.
  session: { strategy: "jwt", maxAge: SEVEN_DAYS, updateAge: 60 * 60 },
  providers: [],
  callbacks: {
    /**
     * Middleware: tudo exige sessão, exceto /login. A allowlist é conferida de
     * novo a cada requisição — tirar o e-mail do ALLOWED_EMAILS derruba a
     * sessão imediatamente, sem tocar no banco.
     */
    authorized({ auth, request }) {
      const loggedIn = isAllowedEmail(auth?.user?.email)
      if (request.nextUrl.pathname === "/login") {
        return loggedIn ? Response.redirect(new URL("/", request.nextUrl)) : true
      }
      return loggedIn
    },
    /**
     * O token leva só QUEM é (id e organização). O que a pessoa pode ver NÃO vai no
     * token: o time e o nível vêm de TeamAccess, revalidados a cada requisição (D30).
     */
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id
        token.organizationId = user.organizationId
      }
      return token
    },
    session({ session, token }) {
      // O token chega tipado como registro genérico: valida o formato ao copiar.
      if (typeof token.uid === "string") session.user.id = token.uid
      if (typeof token.organizationId === "string") session.user.organizationId = token.organizationId
      return session
    },
  },
} satisfies NextAuthConfig
