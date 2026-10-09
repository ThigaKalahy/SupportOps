/**
 * pnpm team:create — abre um time novo (P24, D33). Interativo. Pergunta nome,
 * slug, e-mail e nome do gestor e os módulos opcionais (padrão: nenhum).
 *
 * Numa transação: o time, a conta do gestor (reaproveitada se o e-mail já existe),
 * o acesso MANAGER dele, VIEWER para quem já é VIEWER em todos os outros times
 * ativos, os módulos escolhidos e só o mínimo para funcionar (senioridades, os nove
 * motivos de impeditivo e as cadências de observação). Nenhuma pessoa, competência,
 * responsabilidade ou dado de demonstração.
 *
 * O administrador é o único `isPlatformAdmin` da organização (ou ADMIN_EMAIL).
 * ALLOWED_EMAILS é variável de ambiente: o script imprime a linha pronta, não a edita.
 */
import { allowedEmails, isAllowedEmail } from "../src/server/allowlist.ts"
import { defaultOrganizationId } from "../src/server/audit.ts"
import { db } from "../src/server/db.ts"
import { createTeam, parseModuleList, ProvisioningError, resolveAdmin } from "../src/server/provisioning.ts"
import { MODULE_KEYS } from "../src/lib/modules.ts"

import { ask, fail, printPasswordOnce } from "./cli.ts"

async function main() {
  const [name = "", slug = "", managerEmail = "", managerName = "", rawModules = ""] = await ask([
    "Nome do time: ",
    "Slug (minúsculas e hífens, ex.: treinamento): ",
    "E-mail do gestor: ",
    "Nome do gestor (Enter se a conta já existe): ",
    `Módulos opcionais, separados por vírgula (${MODULE_KEYS.join(", ")}; Enter = nenhum): `,
  ])

  const organizationId = await defaultOrganizationId()
  const adminUserId = await resolveAdmin(organizationId, process.env.ADMIN_EMAIL)
  const result = await createTeam(
    { name, slug, managerEmail, managerName, modules: parseModuleList(rawModules) },
    { organizationId, adminUserId },
  )

  console.log(`\nTime criado: ${name.trim()} (${slug.trim().toLowerCase()}).`)
  console.log(`  Módulos opcionais: ${result.modules.length ? result.modules.join(", ") : "nenhum"}`)
  console.log(`  Leitura automática (VIEWER em todos os times): ${result.viewers.length ? result.viewers.map((v) => v.email).join(", ") : "ninguém"}`)
  console.log("  Semeado: senioridades Júnior/Pleno/Sênior, 9 motivos de impeditivo, cadências de observação 2/7/21/30.")

  const email = managerEmail.trim().toLowerCase()
  if (result.managerPassword) printPasswordOnce(email, result.managerPassword)
  else console.log(`\nO gestor ${email} já tinha conta: usa a senha atual.`)

  if (!isAllowedEmail(email)) {
    console.log("Acrescente o e-mail do gestor ao ALLOWED_EMAILS (Vercel → Settings → Environment Variables) e no .env.local:")
    console.log(`  ALLOWED_EMAILS=${[...allowedEmails(), email].join(",")}\n`)
  }
}

main()
  .catch((error: unknown) => fail(error instanceof ProvisioningError || error instanceof Error ? error.message : String(error)))
  .finally(() => db.$disconnect())
