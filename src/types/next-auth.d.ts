import type { Role } from "@prisma/client"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    role: Role
    organizationId: string
  }

  interface Session {
    user: {
      id: string
      role: Role
      organizationId: string
    } & DefaultSession["user"]
  }
}
