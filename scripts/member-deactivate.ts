/**
 * pnpm member:deactivate — tira o acesso de uma conta ao portal (P25): `User.isActive`
 * falso e os TeamAccess MEMBER revogados (`revokedAt`). Não apaga nada e não mexe na
 * pessoa do time. Desativar a pessoa no cadastro também já bloqueia o portal.
 */
import { defaultOrganizationId } from "../src/server/audit.ts"
import { db } from "../src/server/db.ts"
import { deactivateMemberAccount, ProvisioningError, resolveAdmin } from "../src/server/provisioning.ts"

import { ask, fail } from "./cli.ts"

async function main() {
  const [email = ""] = await ask(["E-mail da conta: "])
  if (!email.trim()) fail("informe o e-mail.")
  const organizationId = await defaultOrganizationId()
  const actor = { organizationId, adminUserId: await resolveAdmin(organizationId, process.env.ADMIN_EMAIL) }
  const result = await deactivateMemberAccount(email, actor)
  console.log(`\nConta ${result.email} desativada. Acessos de colaborador revogados: ${result.revoked}. Nada foi apagado.`)
}

main()
  .catch((error: unknown) => fail(error instanceof ProvisioningError || error instanceof Error ? error.message : String(error)))
  .finally(() => db.$disconnect())
