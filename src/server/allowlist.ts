/**
 * ALLOWED_EMAILS: allowlist rígida, verificada ANTES de qualquer verificação de
 * senha (CLAUDE.md). É também o kill switch operacional — tirar um e-mail da
 * variável revoga o acesso imediatamente, porque a allowlist é conferida de
 * novo em toda requisição (middleware e `getCurrentUser`), não só no login.
 *
 * Sem dependências: roda no Edge (middleware), no Node (Server Actions) e nos
 * scripts de CLI. Lido a cada chamada, nunca em cache de módulo.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean)
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return allowedEmails().includes(normalizeEmail(email))
}
