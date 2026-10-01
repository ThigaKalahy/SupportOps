import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

import { loginSchema } from "@/lib/validators/auth"

import { authConfig } from "./auth.config"
import { verifyCredentials } from "./credentials"

/**
 * Configuração COMPLETA do Auth.js, runtime Node: provider Credentials com
 * verificação de senha (bcryptjs) e Prisma. Nunca importar no middleware —
 * o middleware usa src/server/auth.config.ts.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null
        return verifyCredentials(parsed.data.email, parsed.data.password)
      },
    }),
  ],
})
