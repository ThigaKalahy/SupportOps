/**
 * P11 — validação de prioridade. Regras puras (resultado, extração do ID),
 * escrita (snapshots D14, motivo e "Outro" no zod e no banco, sem timeline
 * D15, auditoria, VIEWER), reordenar níveis sem mudar o histórico, edição e
 * exclusão lógica, os quatro resumos (com o plano de execução sobre o índice
 * do schema), o bloco do perfil e o CRUD de /settings.
 *
 * Usa os dados do seed (rode `pnpm db:seed` antes). Tudo o que o teste grava
 * é apagado ao final e a ordem dos níveis é restaurada.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { Prisma } from "@prisma/client"

import { db, dbIncludingDeleted } from "../src/server/db.ts"
import { todayBusinessDate } from "../src/lib/dates.ts"
import { computeOutcome, extractTicketRef, matchPattern } from "../src/lib/priority-validation.ts"
import { parseValidationFilters, periodRange } from "../src/lib/validation-filters.ts"
import {
  createValidationRecord,
  deleteValidationRecord,
  updateValidationRecord,
} from "../src/server/priority-validations.ts"
import {
  listValidations,
  memberValidationSummary,
  summaryByMember,
  summaryByPeriod,
  summaryByPriorityTransition,
  summaryByReason,
  summarySql,
} from "../src/server/queries/priority-validations.ts"
import {
  deleteCatalogItemRecord,
  moveCatalogItemRecord,
  saveCatalogItemRecord,
  setCatalogItemActiveRecord,
} from "../src/server/settings.ts"
import { seedContexts } from "./support/team-context.ts"

const REF = "TESTE-P11-"
const LABEL = "Teste P11"
const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const { manager: ownerViewer, viewer: viewerOnly } = await seedContexts(owner)
const org = owner.organizationId
const today = todayBusinessDate()
const originalLevels = await db.priorityLevel.findMany({ where: { organizationId: org }, select: { id: true, rank: true } })

const level = async (key: string) => db.priorityLevel.findFirstOrThrow({ where: { organizationId: org, key } })
const reasonByLabel = async (label: string) => db.reclassificationReason.findFirstOrThrow({ where: { organizationId: org, label } })
// Registros do teste no Otávio (taxa alta de propósito no seed); o Rafael fica intacto para a checagem de taxa.
const member = await db.teamMember.findFirstOrThrow({ where: { preferredName: "Otávio" } })

async function cleanup() {
  const validations = await dbIncludingDeleted.priorityValidation.findMany({ where: { ticketRef: { startsWith: REF } }, select: { id: true } })
  const ids = validations.map((v) => v.id)
  await dbIncludingDeleted.auditLog.deleteMany({ where: { entityId: { in: ids } } })
  await dbIncludingDeleted.priorityValidation.deleteMany({ where: { id: { in: ids } } })
  for (const model of ["priorityLevel", "reclassificationReason", "blockerReason", "ticketUrlPattern"] as const) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (dbIncludingDeleted as any)[model]
    const items: { id: string }[] = await delegate.findMany({ where: { organizationId: org, label: { startsWith: LABEL } }, select: { id: true } })
    await dbIncludingDeleted.auditLog.deleteMany({ where: { entityId: { in: items.map((i) => i.id) } } })
    await delegate.deleteMany({ where: { id: { in: items.map((i) => i.id) } } })
  }
  await dbIncludingDeleted.auditLog.deleteMany({ where: { action: { startsWith: "settings." }, entityId: { in: originalLevels.map((l) => l.id) } } })
  for (const l of originalLevels) await dbIncludingDeleted.priorityLevel.update({ where: { id: l.id }, data: { rank: l.rank, isActive: true } })
}

before(cleanup)
after(async () => {
  await cleanup()
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

const input = (patch: Record<string, unknown>) => ({
  ticketUrl: "",
  ticketRef: "",
  memberId: member.id,
  analystPriorityId: "",
  supervisorPriorityId: "",
  returned: false,
  reasonId: "",
  reasonOther: "",
  note: "",
  ...patch,
})

describe("regras puras", () => {
  test("resultado: elevada, rebaixada, mantida, devolvida sobrepõe; sem as duas prioridades, nada", () => {
    assert.equal(computeOutcome({ analystRank: 2, supervisorRank: 3, returned: false }), "RAISED")
    assert.equal(computeOutcome({ analystRank: 3, supervisorRank: 2, returned: false }), "LOWERED")
    assert.equal(computeOutcome({ analystRank: 2, supervisorRank: 2, returned: false }), "MAINTAINED")
    assert.equal(computeOutcome({ analystRank: 2, supervisorRank: 3, returned: true }), "RETURNED")
    assert.equal(computeOutcome({ analystRank: 2, supervisorRank: null, returned: false }), null)
  })

  test("extração do ID: padrões em ordem, captura mais longa, regex inválida ignorada", () => {
    const generic = { id: "g", regex: "(\\d+)", captureGroup: 1 }
    const specific = { id: "s", regex: "/tickets/(\\d+)", captureGroup: 1 }
    const broken = { id: "b", regex: "([", captureGroup: 1 }
    const url = "https://helpdesk.exemplo.com.br/v2/a/tickets/48213?aba=3"
    assert.deepEqual(extractTicketRef(url, [broken, specific, generic]), { ref: "48213", patternId: "s" })
    assert.equal(matchPattern(url, generic), "48213", "fica com a mais longa, não com o 2 de /v2/")
    assert.equal(extractTicketRef("https://exemplo.com/sem-numero", [generic]), null)
    assert.equal(extractTicketRef("   ", [generic]), null)
  })

  test("filtros de período: padrão hoje; intervalo invertido é corrigido; inválido volta para hoje", () => {
    assert.equal(parseValidationFilters({}).period, "today")
    const custom = parseValidationFilters({ period: "custom", from: "10-09-2026", to: "01-09-2026" })
    assert.equal(custom.from?.toISOString().slice(0, 10), "2026-09-01")
    assert.equal(parseValidationFilters({ period: "custom", from: "99-99-2026" }).period, "today")
    const week = periodRange({ period: "7d", from: null, to: null }, today)
    assert.equal((week.to.getTime() - week.from.getTime()) / 86_400_000, 6)
  })
})

describe("registro de validação", () => {
  test("mantida: grava ranks do momento, resultado e auditoria; motivo enviado é descartado; nenhuma linha na timeline (D15)", async () => {
    const [media, timelineBefore] = await Promise.all([level("MEDIA"), db.timelineEvent.count()])
    const anyReason = await reasonByLabel("Impacto superestimado")
    const result = await createValidationRecord(
      ownerViewer,
      input({
        ticketUrl: "https://helpdesk.exemplo.com.br/a/tickets/1",
        ticketRef: `${REF}1`,
        analystPriorityId: media.id,
        supervisorPriorityId: media.id,
        reasonId: anyReason.id,
      }),
    )
    assert.ok(result.ok)
    const row = await db.priorityValidation.findUniqueOrThrow({ where: { id: result.id } })
    assert.equal(row.outcome, "MAINTAINED")
    assert.equal(row.analystRankSnapshot, media.rank)
    assert.equal(row.supervisorRankSnapshot, media.rank)
    assert.equal(row.reasonId, null)
    assert.equal(row.validatedByUserId, owner.id)
    assert.ok(Math.abs(row.validatedAt.getTime() - Date.now()) < 60_000)
    assert.equal(await db.timelineEvent.count(), timelineBefore)
    assert.equal(await db.auditLog.count({ where: { action: "priorityValidation.create", entityId: row.id } }), 1)
  })

  test("alterada sem motivo é recusada; com motivo 'Outro', o texto é obrigatório no zod E no banco", async () => {
    const [baixa, alta, outro] = await Promise.all([level("BAIXA"), level("ALTA"), reasonByLabel("Outro")])
    assert.equal(outro.requiresDetail, true)
    const base = input({ ticketUrl: "x", ticketRef: `${REF}2`, analystPriorityId: baixa.id, supervisorPriorityId: alta.id })
    const noReason = await createValidationRecord(ownerViewer, base)
    assert.ok(!noReason.ok && noReason.fieldErrors?.reasonId)
    const noDetail = await createValidationRecord(ownerViewer, { ...base, reasonId: outro.id })
    assert.ok(!noDetail.ok && noDetail.fieldErrors?.reasonOther)

    // Direto no banco, sem passar pelo zod: o trigger recusa.
    await assert.rejects(
      db.priorityValidation.create({
        data: {
          organizationId: org,
          teamId: ownerViewer.teamId,
          ticketUrl: "x",
          ticketRef: `${REF}banco`,
          memberId: member.id,
          analystPriorityId: baixa.id,
          supervisorPriorityId: alta.id,
          analystRankSnapshot: baixa.rank,
          supervisorRankSnapshot: alta.rank,
          outcome: "RAISED",
          reasonId: outro.id,
          validatedAt: new Date(),
          validatedByUserId: owner.id,
        },
      }),
      /reasonOther/,
    )

    const ok = await createValidationRecord(ownerViewer, { ...base, reasonId: outro.id, reasonOther: "Cliente VIP do contrato novo" })
    assert.ok(ok.ok)
    const row = await db.priorityValidation.findUniqueOrThrow({ where: { id: ok.id } })
    assert.deepEqual([row.outcome, row.reasonOther], ["RAISED", "Cliente VIP do contrato novo"])
  })

  test("devolver dispensa a prioridade validada e exige motivo; ID vazio é extraído no servidor", async () => {
    const [critica, evidencia] = await Promise.all([level("CRITICA"), reasonByLabel("Evidência insuficiente")])
    const result = await createValidationRecord(
      ownerViewer,
      input({
        ticketUrl: "https://helpdesk.exemplo.com.br/a/tickets/778899",
        ticketRef: "",
        analystPriorityId: critica.id,
        supervisorPriorityId: critica.id,
        returned: true,
        reasonId: evidencia.id,
      }),
    )
    assert.ok(result.ok)
    assert.equal(result.ticketRef, "778899")
    const row = await db.priorityValidation.findUniqueOrThrow({ where: { id: result.id } })
    assert.deepEqual([row.outcome, row.supervisorPriorityId, row.supervisorRankSnapshot], ["RETURNED", null, null])
    await db.priorityValidation.update({ where: { id: row.id }, data: { ticketRef: `${REF}778899` } })
  })

  test("VIEWER não registra; responsável inativo é recusado", async () => {
    const media = await level("MEDIA")
    const body = input({ ticketUrl: "x", ticketRef: `${REF}v`, analystPriorityId: media.id, supervisorPriorityId: media.id })
    await assert.rejects(createValidationRecord(viewerOnly, body), { name: "ForbiddenError" })
    const inactive = await db.teamMember.findFirst({ where: { status: "INACTIVE" } })
    if (inactive) assert.ok(!(await createValidationRecord(ownerViewer, { ...body, memberId: inactive.id })).ok)
  })
})

describe("D14: reordenar níveis não muda o histórico", () => {
  test("rebaixar 'Alta' para baixo de 'Média' não muda nenhum resultado nem snapshot gravado", async () => {
    const snapshotBefore = await db.priorityValidation.findMany({
      select: { id: true, outcome: true, analystRankSnapshot: true, supervisorRankSnapshot: true },
      orderBy: { id: "asc" },
    })
    const from = new Date(today)
    from.setUTCDate(from.getUTCDate() - 120)
    const transitionsBefore = await summaryByPriorityTransition(ownerViewer, from, today)
    const periodBefore = await summaryByPeriod(ownerViewer, from, today)

    const alta = await level("ALTA")
    assert.ok((await moveCatalogItemRecord(ownerViewer, { kind: "priorityLevel", id: alta.id, direction: "down" })).ok)
    const [altaNow, mediaNow] = await Promise.all([level("ALTA"), level("MEDIA")])
    assert.ok(altaNow.rank < mediaNow.rank, "a ordem mudou de fato")

    const snapshotAfter = await db.priorityValidation.findMany({
      select: { id: true, outcome: true, analystRankSnapshot: true, supervisorRankSnapshot: true },
      orderBy: { id: "asc" },
    })
    assert.deepEqual(snapshotAfter, snapshotBefore)
    assert.deepEqual(await summaryByPriorityTransition(ownerViewer, from, today), transitionsBefore)
    assert.deepEqual(await summaryByPeriod(ownerViewer, from, today), periodBefore)

    // Validação nova usa a escala nova: Média → Alta agora é rebaixar.
    const evidencia = await reasonByLabel("Evidência insuficiente")
    const fresh = await createValidationRecord(
      ownerViewer,
      input({ ticketUrl: "x", ticketRef: `${REF}novo`, analystPriorityId: mediaNow.id, supervisorPriorityId: altaNow.id, reasonId: evidencia.id }),
    )
    assert.ok(fresh.ok)
    assert.equal((await db.priorityValidation.findUniqueOrThrow({ where: { id: fresh.id } })).outcome, "LOWERED")
    assert.ok(await db.auditLog.count({ where: { action: "settings.priorityLevel.move", entityId: alta.id } }))
  })

  test("editar só a observação preserva resultado e ranks gravados, mesmo com a escala mudada", async () => {
    // "Mantida" gravada com Média=2: depois da reordenação continua Mantida.
    const old = await db.priorityValidation.findFirstOrThrow({ where: { ticketRef: `${REF}1` } })
    const result = await updateValidationRecord(
      ownerViewer,
      input({
        id: old.id,
        ticketUrl: old.ticketUrl,
        ticketRef: old.ticketRef,
        analystPriorityId: old.analystPriorityId,
        supervisorPriorityId: old.supervisorPriorityId,
        note: "Observação corrigida",
      }),
    )
    assert.ok(result.ok)
    const after = await db.priorityValidation.findUniqueOrThrow({ where: { id: old.id } })
    assert.deepEqual(
      [after.outcome, after.analystRankSnapshot, after.supervisorRankSnapshot, after.note, after.validatedAt.getTime()],
      [old.outcome, old.analystRankSnapshot, old.supervisorRankSnapshot, "Observação corrigida", old.validatedAt.getTime()],
    )
    assert.equal(await db.auditLog.count({ where: { action: "priorityValidation.update", entityId: old.id } }), 1)
  })

  test("trocar a prioridade na edição grava os ranks atuais", async () => {
    const old = await db.priorityValidation.findFirstOrThrow({ where: { ticketRef: `${REF}1` } })
    const [critica, motivo] = await Promise.all([level("CRITICA"), reasonByLabel("Impacto subestimado")])
    const result = await updateValidationRecord(
      ownerViewer,
      input({
        id: old.id,
        ticketUrl: old.ticketUrl,
        ticketRef: old.ticketRef,
        analystPriorityId: old.analystPriorityId,
        supervisorPriorityId: critica.id,
        reasonId: motivo.id,
      }),
    )
    assert.ok(result.ok)
    const after = await db.priorityValidation.findUniqueOrThrow({ where: { id: old.id } })
    assert.deepEqual([after.outcome, after.supervisorRankSnapshot, after.reasonId], ["RAISED", critica.rank, motivo.id])
  })
})

describe("lista, exclusão e resumos", () => {
  test("hoje: as validações do teste aparecem, mais recente primeiro; excluída some da lista e dos resumos", async () => {
    const list = await listValidations(ownerViewer, parseValidationFilters({}), today)
    const mine = list.rows.filter((r) => r.ticketRef.startsWith(REF))
    assert.ok(mine.length >= 4)
    const times = list.rows.map((r) => r.validatedAt.getTime())
    assert.deepEqual(times, [...times].sort((a, b) => b - a))
    assert.equal(list.summary.total, list.rows.length)
    assert.equal(list.summary.changed, list.summary.raised + list.summary.lowered + list.summary.returned)

    const target = mine[0]!
    assert.ok((await deleteValidationRecord(ownerViewer, { id: target.id })).ok)
    const again = await listValidations(ownerViewer, parseValidationFilters({}), today)
    assert.ok(!again.rows.some((r) => r.id === target.id))
    assert.equal((await summaryByPeriod(ownerViewer, today, today)).total, again.rows.length)
    assert.ok((await dbIncludingDeleted.priorityValidation.findUniqueOrThrow({ where: { id: target.id } })).deletedAt)
    await assert.rejects(deleteValidationRecord(viewerOnly, { id: mine[1]!.id }), { name: "ForbiddenError" })
  })

  test("resumos de 90 dias batem com a contagem direta; por pessoa em ordem de nome, com total; motivos do mais ao menos usado", async () => {
    const from = new Date(today)
    from.setUTCDate(from.getUTCDate() - 89)
    const period = await summaryByPeriod(ownerViewer, from, today)
    const rows = await listValidations(ownerViewer, { period: "custom", from, to: today, memberId: null, outcome: null, reasonId: null, central: null }, today)
    assert.equal(period.total, rows.rows.length)
    assert.ok(period.total > 100, "o seed tem ~180 validações em 90 dias")
    assert.equal(period.changeRate, Math.round((period.changed / period.total) * 100))

    const byMember = await summaryByMember(ownerViewer, from, today)
    const names = byMember.map((m) => m.preferredName)
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), "ordem por nome, nunca por taxa (D7)")
    assert.equal(byMember.reduce((s, m) => s + m.total, 0), period.total)
    const otavio = byMember.find((m) => m.preferredName === "Otávio")!
    const rafael = byMember.find((m) => m.preferredName === "Rafael")!
    assert.ok(otavio.changeRate! >= 40 && rafael.changeRate! <= 20, `${otavio.changeRate} / ${rafael.changeRate}`)

    const byReason = await summaryByReason(ownerViewer, from, today)
    const counts = byReason.map((r) => r.count)
    assert.deepEqual(counts, [...counts].sort((a, b) => b - a))
    assert.equal(counts.reduce((s, c) => s + c, 0), period.changed, "todo alterado tem motivo")

    const matrix = await summaryByPriorityTransition(ownerViewer, from, today)
    assert.equal(matrix.reduce((s, t) => s + t.count, 0), period.total)
    assert.ok(matrix.every((t) => (t.to === null) === (t.outcome === "RETURNED")))
  })

  test("os quatro resumos filtram o período pelo índice (teamId, validatedAt), sem mudar o schema", async () => {
    const from = new Date(today)
    from.setUTCDate(from.getUTCDate() - 29)
    for (const [name, build] of Object.entries(summarySql)) {
      const plan = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL enable_seqscan = off`
        // Com ~200 linhas, o planejador às vezes prefere o índice do motivo para um merge join
        // (custo, não falta de índice): o que se verifica aqui é que o período usa o índice.
        await tx.$executeRaw`SET LOCAL enable_mergejoin = off`
        return tx.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`EXPLAIN ${build(ownerViewer, from, today)}`)
      })
      const text = plan.map((p) => p["QUERY PLAN"]).join("\n")
      assert.match(text, /PriorityValidation_teamId_validatedAt_idx/, `${name}:\n${text}`)
    }
  })

  test("bloco do perfil: 90 dias, taxa com o total e motivo mais frequente (Otávio: Impacto superestimado)", async () => {
    const otavio = await db.teamMember.findFirstOrThrow({ where: { preferredName: "Otávio" } })
    const block = await memberValidationSummary(ownerViewer, otavio.id, today)
    assert.equal(block.days, 90)
    assert.ok(block.summary.total > 0)
    assert.equal(block.summary.changeRate, Math.round((block.summary.changed / block.summary.total) * 100))
    assert.equal(block.topReason?.label, "Impacto superestimado")
    // VIEWER lê o mesmo (validação não é registro privado).
    assert.deepEqual(await memberValidationSummary(viewerOnly, otavio.id, today), block)
  })
})

describe("/settings: catálogos", () => {
  test("nível novo entra no fim; nome repetido é recusado; em uso não se exclui; sem uso, sim", async () => {
    assert.ok((await saveCatalogItemRecord(ownerViewer, "priorityLevel", { label: `${LABEL} Mínima` })).ok)
    const levels = await db.priorityLevel.findMany({ where: { organizationId: org }, orderBy: { rank: "desc" } })
    assert.equal(levels.at(-1)?.label, `${LABEL} Mínima`)
    assert.equal(levels.at(-1)?.rank, 1)
    assert.equal(levels.at(-1)?.key, "TESTE_P11_MINIMA")
    assert.deepEqual(levels.map((l) => l.rank), levels.map((_, i) => levels.length - i))

    const dup = await saveCatalogItemRecord(ownerViewer, "priorityLevel", { label: `${LABEL} minima` })
    assert.ok(!dup.ok && dup.fieldErrors?.label)

    const media = await level("MEDIA")
    const inUse = await deleteCatalogItemRecord(ownerViewer, { kind: "priorityLevel", id: media.id })
    assert.ok(!inUse.ok && inUse.error.startsWith("Em uso por"))
    const minima = levels.at(-1)!
    assert.ok((await deleteCatalogItemRecord(ownerViewer, { kind: "priorityLevel", id: minima.id })).ok)
    assert.equal(await db.priorityLevel.count({ where: { id: minima.id } }), 0)
    assert.equal(await db.auditLog.count({ where: { action: "settings.priorityLevel.delete", entityId: minima.id } }), 1)
  })

  test("motivo de reclassificação que exige texto; motivo de impeditivo com categoria; desativar some do formulário", async () => {
    assert.ok((await saveCatalogItemRecord(ownerViewer, "reclassificationReason", { label: `${LABEL} genérico`, requiresDetail: true })).ok)
    const reason = await db.reclassificationReason.findFirstOrThrow({ where: { label: `${LABEL} genérico` } })
    assert.equal(reason.requiresDetail, true)
    assert.ok((await saveCatalogItemRecord(ownerViewer, "blockerReason", { label: `${LABEL} fornecedor`, category: "EXTERNAL" })).ok)
    const blocker = await db.blockerReason.findFirstOrThrow({ where: { label: `${LABEL} fornecedor` } })
    assert.equal(blocker.category, "EXTERNAL")
    assert.ok((await saveCatalogItemRecord(ownerViewer, "blockerReason", { id: blocker.id, label: `${LABEL} fornecedor`, category: "CAPACITY" })).ok)
    assert.equal((await db.blockerReason.findUniqueOrThrow({ where: { id: blocker.id } })).category, "CAPACITY")

    assert.ok((await setCatalogItemActiveRecord(ownerViewer, { kind: "reclassificationReason", id: reason.id, active: false })).ok)
    const { getValidationFormData } = await import("../src/server/queries/priority-validations.ts")
    assert.ok(!(await getValidationFormData(ownerViewer)).reasons.some((r) => r.id === reason.id))
  })

  test("padrão de URL: regex inválida e grupo inexistente são recusados; o válido extrai", async () => {
    const bad = await saveCatalogItemRecord(ownerViewer, "ticketPattern", { label: `${LABEL} quebrado`, regex: "([", captureGroup: 1 })
    assert.ok(!bad.ok && bad.fieldErrors?.regex)
    const noGroup = await saveCatalogItemRecord(ownerViewer, "ticketPattern", { label: `${LABEL} sem grupo`, regex: "tickets/\\d+", captureGroup: 1 })
    assert.ok(!noGroup.ok && noGroup.fieldErrors?.captureGroup)
    assert.ok((await saveCatalogItemRecord(ownerViewer, "ticketPattern", { label: `${LABEL} tickets`, regex: "/tickets/(\\d+)", captureGroup: 1 })).ok)
    const pattern = await db.ticketUrlPattern.findFirstOrThrow({ where: { label: `${LABEL} tickets` } })
    assert.equal(matchPattern("https://h.exemplo.com/v2/tickets/31337", pattern), "31337")
  })

  test("VIEWER não altera configurações", async () => {
    await assert.rejects(saveCatalogItemRecord(viewerOnly, "priorityLevel", { label: `${LABEL} intruso` }), { name: "ForbiddenError" })
    const media = await level("MEDIA")
    await assert.rejects(moveCatalogItemRecord(viewerOnly, { kind: "priorityLevel", id: media.id, direction: "up" }), { name: "ForbiddenError" })
  })
})
