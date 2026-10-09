import type { DefaultSession } from "next-auth"

/** A sessão diz QUEM é. O escopo (time e nível) vem de TeamAccess a cada requisição (P22, D30). */
declare module "next-auth" {
  interface User {
    organizationId: string
  }

  interface Session {
    user: {
      id: string
      organizationId: string
    } & DefaultSession["user"]
  }
}
