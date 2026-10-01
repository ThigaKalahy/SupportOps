"use server"

import { AuthError } from "next-auth"

import { labels } from "@/lib/labels"
import { loginSchema } from "@/lib/validators/auth"
import { getCurrentUser } from "@/server/access"
import { writeAudit } from "@/server/audit"
import { signIn, signOut } from "@/server/auth"

export interface LoginState {
  error: string | null
}

/**
 * Login por e-mail + senha. Qualquer falha devolve o mesmo texto genérico
 * (e-mail inexistente, senha errada, conta bloqueada, fora da allowlist).
 * A auditoria de cada tentativa acontece em src/server/credentials.ts.
 */
export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") })
  if (!parsed.success) return { error: labels.auth.invalidCredentials }

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/" })
  } catch (error) {
    // O redirect de sucesso é lançado como exceção do Next e precisa subir.
    if (error instanceof AuthError) return { error: labels.auth.invalidCredentials }
    throw error
  }
  return { error: null }
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser()
  if (user) {
    await writeAudit(
      { action: "auth.logout", entity: "User", entityId: user.id },
      { organizationId: user.organizationId, userId: user.id },
    )
  }
  await signOut({ redirectTo: "/login" })
}
