import type { NextAuthConfig } from "next-auth"

import { routeRequest, SURFACE_COOKIE } from "../lib/portal-routing"

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
     * sessão imediatamente, sem tocar no banco. Conta só de colaborador (P25)
     * dispensa a lista; o servidor confere `isActive`, TeamAccess e a pessoa ativa.
     * Também roteia entre o portal (/me) e as telas do gestor — conveniência; cada
     * rota revalida no servidor (src/lib/portal-routing.ts).
     */
    authorized({ auth, request }) {
      const memberOnly = auth?.user?.memberOnly === true
      const loggedIn = Boolean(auth?.user?.email) && (memberOnly || isAllowedEmail(auth?.user?.email))
      const decision = routeRequest({
        pathname: request.nextUrl.pathname,
        loggedIn,
        memberOnly,
        surface: request.cookies.get(SURFACE_COOKIE)?.value,
      })
      if (decision.kind === "allow") return true
      if (decision.kind === "login") return false
      return Response.redirect(new URL(decision.to, request.nextUrl))
    },
    /**
     * O token leva só QUEM é (id e organização). O que a pessoa pode ver NÃO vai no
     * token: o time e o nível vêm de TeamAccess, revalidados a cada requisição (D30).
     */
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id
        token.organizationId = user.organizationId
        token.memberOnly = user.memberOnly === true
      }
      return token
    },
    session({ session, token }) {
      // O token chega tipado como registro genérico: valida o formato ao copiar.
      if (typeof token.uid === "string") session.user.id = token.uid
      if (typeof token.organizationId === "string") session.user.organizationId = token.organizationId
      session.user.memberOnly = token.memberOnly === true
      return session
    },
  },
} satisfies NextAuthConfig
