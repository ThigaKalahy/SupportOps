/**
 * pnpm audit:grant — concede ou revoga o acesso à Auditoria de Atendimentos (C23, D47).
 *
 * É o ÚNICO meio de dar acesso ao módulo: pelo id da conta (achada pelo e-mail exato),
 * nunca pelo nome. Exige que a conta seja GESTOR ativo no time. Revogar preenche
 * `revokedAt` (nunca apaga). Tudo auditado. Ligar o módulo é outro passo, em
 * Configurações › Times e acessos — e sozinho não dá acesso a ninguém.
 */
import { defaultOrganizationId, writeAudit } from "../src/server/audit.ts"
import { db } from "../src/server/db.ts"
import { resolveAdmin } from "../src/server/provisioning.ts"

import { ask, fail } from "./cli.ts"

async function main() {
  const organizationId = await defaultOrganizationId()
  const adminUserId = await resolveAdmin(organizationId, process.env.ADMIN_EMAIL)
  const [slug = "", rawEmail = "", rawAction = ""] = await ask(["Time (slug): ", "E-mail da conta: ", "Conceder ou revogar? [c/r] "])
  const email = rawEmail.trim().toLowerCase()
  const revoke = rawAction.trim().toLowerCase().startsWith("r")

  const team = await db.team.findFirst({ where: { slug: slug.trim(), organizationId }, select: { id: true, name: true } })
  if (!team) fail(`time "${slug}" não encontrado.`)
  const user = await db.user.findFirst({ where: { email, organizationId }, select: { id: true, name: true, isActive: true } })
  if (!user) fail(`nenhuma conta com o e-mail ${email}.`)

  if (revoke) {
    const done = await db.$transaction(async (tx) => {
      const row = await tx.auditAccess.updateMany({ where: { teamId: team!.id, userId: user!.id, revokedAt: null }, data: { revokedAt: new Date() } })
      if (row.count) {
        await writeAudit(
          { action: "attendanceAudit.access.revoke", entity: "AuditAccess", entityId: user!.id, after: { teamId: team!.id } },
          { organizationId, teamId: team!.id, userId: adminUserId, tx },
        )
      }
      return row.count
    })
    console.log(done ? `\nAcesso revogado: ${user!.name} em ${team!.name}.` : `\n${user!.name} não tinha acesso em ${team!.name}.`)
    return
  }

  const manager = await db.teamAccess.findFirst({ where: { teamId: team!.id, userId: user!.id, level: "MANAGER", revokedAt: null }, select: { id: true } })
  if (!user!.isActive || !manager) fail("a conta precisa estar ativa e ser GESTOR (MANAGER) neste time.")

  await db.$transaction(async (tx) => {
    await tx.auditAccess.upsert({
      where: { teamId_userId: { teamId: team!.id, userId: user!.id } },
      create: { teamId: team!.id, userId: user!.id, grantedByUserId: adminUserId },
      update: { revokedAt: null, grantedAt: new Date(), grantedByUserId: adminUserId },
    })
    await writeAudit(
      { action: "attendanceAudit.access.grant", entity: "AuditAccess", entityId: user!.id, after: { teamId: team!.id } },
      { organizationId, teamId: team!.id, userId: adminUserId, tx },
    )
  })
  console.log(`\nAcesso concedido: ${user!.name} (id ${user!.id}) em ${team!.name}.`)
  console.log("Lembrete: o módulo \"Auditoria de atendimentos\" precisa estar ligado no time (Configurações › Times e acessos).")
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
