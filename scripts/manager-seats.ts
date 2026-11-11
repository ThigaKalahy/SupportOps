/**
 * pnpm team:manager-seats — C25: cria (ou reativa/desativa) o lugar de gestor de cada time,
 * para os gestores receberem combinados. Idempotente; cada mudança é auditada. Novas
 * concessões de acesso já sincronizam sozinhas — este comando é para os acessos que já
 * existiam antes do C25 (ou para conferir).
 */
import { defaultOrganizationId } from "../src/server/audit.ts"
import { db } from "../src/server/db.ts"
import { syncManagerSeats } from "../src/server/manager-seats.ts"
import { resolveAdmin } from "../src/server/provisioning.ts"

import { fail } from "./cli.ts"

async function main() {
  const organizationId = await defaultOrganizationId()
  const actor = { organizationId, userId: await resolveAdmin(organizationId, process.env.ADMIN_EMAIL) }
  const teams = await db.team.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
  for (const team of teams) {
    const r = await db.$transaction((tx) => syncManagerSeats(tx, team.id, actor))
    console.log(`${team.name}: ${r.created} criado(s), ${r.reactivated} reativado(s), ${r.deactivated} desativado(s)`)
  }
}

main()
  .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
  .finally(() => db.$disconnect())
