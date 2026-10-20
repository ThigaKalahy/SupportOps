/**
 * pnpm member:invite — dá a pessoas do time o acesso ao portal do colaborador (P25).
 *
 * Pergunta o time, lista as pessoas ATIVAS ainda sem login e deixa escolher uma,
 * várias ou todas. Para cada uma: e-mail (sugere o do cadastro), conta nova com
 * senha aleatória mostrada UMA vez (só o hash é gravado), TeamAccess MEMBER e a
 * ligação `TeamMember.userId`. Tudo auditado. Não exige ALLOWED_EMAILS: conta só de
 * colaborador dispensa a lista (allowlist em dois níveis) — nenhum deploy por pessoa.
 */
import { defaultOrganizationId } from "../src/server/audit.ts"
import { db } from "../src/server/db.ts"
import { inviteMember, listInvitableMembers, ProvisioningError, resolveAdmin, type MemberInviteResult } from "../src/server/provisioning.ts"

import { ask, fail } from "./cli.ts"

function pickIndexes(raw: string, total: number): number[] {
  const text = raw.trim().toLowerCase()
  if (text === "todos" || text === "todas") return [...Array(total).keys()]
  const picked = new Set<number>()
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/)
    const [from, to] = range ? [Number(range[1]), Number(range[2])] : [Number(part), Number(part)]
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > total || from > to) fail(`escolha inválida: "${part}".`)
    for (let n = from; n <= to; n++) picked.add(n - 1)
  }
  if (!picked.size) fail("nenhuma pessoa escolhida.")
  return [...picked].sort((a, b) => a - b)
}

async function main() {
  const organizationId = await defaultOrganizationId()
  const actor = { organizationId, adminUserId: await resolveAdmin(organizationId, process.env.ADMIN_EMAIL) }

  const [teamSlug = ""] = await ask(["Time (slug): "])
  const { team, members } = await listInvitableMembers(teamSlug, organizationId)
  if (!members.length) {
    console.log(`\nNinguém ativo em ${team.name} está sem login.`)
    return
  }
  console.log(`\nPessoas ativas de ${team.name} sem login:`)
  members.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${m.preferredName} (${m.fullName})${m.email ? ` — ${m.email}` : ""}`))

  const [selection = ""] = await ask(["\nQuem recebe acesso? (números separados por vírgula, faixa 1-3, ou todos): "])
  const chosen = pickIndexes(selection, members.length).map((i) => members[i]!)

  const emails = await ask(chosen.map((m) => `E-mail de ${m.preferredName}${m.email ? ` [Enter = ${m.email}]` : ""}: `))
  const results: MemberInviteResult[] = []
  const failures: string[] = []
  for (const [i, member] of chosen.entries()) {
    const email = emails[i]?.trim() || member.email || ""
    if (!email) {
      failures.push(`${member.preferredName}: sem e-mail`)
      continue
    }
    try {
      results.push(await inviteMember({ teamId: team.id, memberId: member.id, email }, actor))
    } catch (error) {
      failures.push(`${member.preferredName}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const line = "─".repeat(56)
  console.log(`\n${line}\n  Acesso ao portal — ${team.name}\n${line}`)
  for (const r of results) {
    console.log(r.password ? `${r.name}\t${r.email}\t${r.password}` : `${r.name}\t${r.email}\t(conta já existia: mesma senha)`)
  }
  console.log(line)
  if (results.some((r) => r.password)) {
    console.log("  As senhas aparecem só agora. Entregue a cada pessoa por canal privado;")
    console.log("  não existe recuperação por e-mail — só `pnpm user:password`.")
    console.log("  Não precisa mexer no ALLOWED_EMAILS: conta só de colaborador dispensa a lista.")
  }
  if (failures.length) console.log(`\n  Não concedido:\n${failures.map((f) => `   - ${f}`).join("\n")}`)
  console.log(`${line}\n`)
}

main()
  .catch((error: unknown) => fail(error instanceof ProvisioningError || error instanceof Error ? error.message : String(error)))
  .finally(() => db.$disconnect())
