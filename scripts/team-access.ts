/**
 * pnpm team:access — concede ou revoga acesso a um time, por e-mail e slug (P24).
 * Conceder com outro nível muda o nível; revogar preenche `revokedAt` e nunca
 * apaga a linha. Tudo auditado. O administrador é o único `isPlatformAdmin`
 * da organização (ou ADMIN_EMAIL).
 */
import { defaultOrganizationId } from "../src/server/audit.ts"
import { db } from "../src/server/db.ts"
import { grantAccess, ProvisioningError, resolveAdmin, revokeAccess } from "../src/server/provisioning.ts"

import { ask, fail } from "./cli.ts"

async function main() {
  const [rawAction = "", email = "", teamSlug = "", rawLevel = ""] = await ask([
    "Ação (conceder | revogar): ",
    "E-mail do usuário: ",
    "Time (slug): ",
    "Nível ao conceder (MANAGER = gestor | VIEWER = leitura; Enter ao revogar): ",
  ])
  const action = rawAction.trim().toLowerCase()
  if (action !== "conceder" && action !== "revogar") fail("ação deve ser conceder ou revogar.")

  const organizationId = await defaultOrganizationId()
  const actor = { organizationId, adminUserId: await resolveAdmin(organizationId, process.env.ADMIN_EMAIL) }

  if (action === "revogar") {
    const result = await revokeAccess({ email, teamSlug }, actor)
    console.log(result === "revoked" ? "\nAcesso revogado (a linha fica, com a data da revogação)." : "\nEste usuário não tinha acesso ativo a este time.")
    return
  }
  const level = rawLevel.trim().toUpperCase()
  if (level !== "MANAGER" && level !== "VIEWER") fail("nível deve ser MANAGER ou VIEWER.")
  const result = await grantAccess({ email, teamSlug, level }, actor)
  console.log(
    result === "granted" ? `\nAcesso concedido (${level}).` : result === "changed" ? `\nNível alterado para ${level}.` : "\nNada mudou: o acesso já era este.",
  )
}

main()
  .catch((error: unknown) => fail(error instanceof ProvisioningError || error instanceof Error ? error.message : String(error)))
  .finally(() => db.$disconnect())
