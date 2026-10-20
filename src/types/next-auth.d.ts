import type { DefaultSession } from "next-auth"

/** A sessão diz QUEM é. O escopo (time e nível) vem de TeamAccess a cada requisição (P22, D30). */
declare module "next-auth" {
  interface User {
    organizationId: string
    /** P25: conta só de colaborador — o middleware a manda para o portal. */
    memberOnly?: boolean
  }

  interface Session {
    user: {
      id: string
      organizationId: string
      memberOnly?: boolean
    } & DefaultSession["user"]
  }
}
