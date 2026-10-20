import { db } from "./db.ts"

/**
 * Allowlist em dois níveis (P25): assimetria deliberada.
 *
 * - "privileged": `isPlatformAdmin` ou nível MANAGER/VIEWER em algum time ativo. Só
 *   entra com o e-mail em ALLOWED_EMAILS — a fricção de deploy é desejada.
 * - "member": o único nível é MEMBER. Dispensa ALLOWED_EMAILS; depende de
 *   `User.isActive`, TeamAccess válido e da pessoa ativa ligada à conta (essa última
 *   conferida a cada requisição pelo contexto do portal). Serão dezenas de pessoas:
 *   exigir deploy por contratação tornaria o sistema impraticável.
 * - "none": sem acesso válido a time nenhum.
 */
export type AccountTier = "privileged" | "member" | "none"

export async function accountTier(userId: string, isPlatformAdmin: boolean): Promise<AccountTier> {
  if (isPlatformAdmin) return "privileged"
  const levels = await db.teamAccess.findMany({
    where: { userId, revokedAt: null, team: { isActive: true } },
    select: { level: true },
  })
  if (levels.some((a) => a.level !== "MEMBER")) return "privileged"
  return levels.length ? "member" : "none"
}
