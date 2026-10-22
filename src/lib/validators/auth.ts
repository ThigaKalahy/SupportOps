import { z } from "zod"

import { labels } from "../labels.ts"

/** Login. Mesmo schema no formulário e no provider Credentials. */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
})

export type LoginInput = z.infer<typeof loginSchema>

const A = labels.account

/** C18: troca da própria senha. A atual é conferida no servidor; a nova tem 8+ caracteres. */
export const changePasswordSchema = z
  .object({
    current: z.string().min(1, A.wrongCurrent).max(200),
    next: z.string().min(8, A.tooShort).max(200),
    confirm: z.string().max(200),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: A.mismatch })
  .refine((v) => v.next !== v.current, { path: ["next"], message: A.same })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
