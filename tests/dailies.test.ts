/**
 * P10 — dailies. O texto do WhatsApp no formato pedido; o que entra para
 * revisão (daily anterior + vencidos, sem repetir); e o salvamento numa única
 * transação: Feito (DONE + AGREEMENT_DONE), reagendar (mesmo combinado, prazo
 * original intacto — D12, D17), substituir (antigo CANCELLED, novo com
 * replacesAgreementId), combinados novos com sourceDailyId, uma linha DAILY por
 * pessoa com nota ou revisão e nenhuma para presença simples.
 *
 * Usa os dados do seed (rode `pnpm db:seed` antes). As escritas usam pessoas
 * de teste próprias, apagadas ao final.
 */
import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"

import { db, dbIncludingDeleted } from "../src/server/db.ts"
import { formatDate, isNationalHoliday, nextBusinessDay, todayBusinessDate } from "../src/lib/dates.ts"
import { buildDailyWhatsApp } from "../src/server/whatsapp.ts"
import { getDailyDetail, getDailyForm } from "../src/server/queries/dailies.ts"
import { createMemberRecord } from "../src/server/members.ts"
import { createAgreementRecord } from "../src/server/agreements.ts"
import { createDailyRecord, updateDailyRecord } from "../src/server/dailies.ts"
import { seedContexts } from "./support/team-context.ts"

const NAMES = ["Pessoa de Teste da Daily Um", "Pessoa de Teste da Daily Dois"]
const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const { manager: ownerViewer, viewer: viewerOnly } = await seedContexts(owner)
const today = todayBusinessDate()
const display = (offset: number) => {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + offset)
  return formatDate(d, "business")
}
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

async function cleanup() {
  const members = await dbIncludingDeleted.teamMember.findMany({ where: { fullName: { in: NAMES } }, select: { id: true } })
  const ids = members.map((m) => m.id)
  if (ids.length === 0) return
  const agreements = await dbIncludingDeleted.agreement.findMany({ where: { memberId: { in: ids } }, select: { id: true } })
  const agreementIds = agreements.map((a) => a.id)
  const dailies = await dbIncludingDeleted.daily.findMany({
    where: { participants: { some: { memberId: { in: ids } } } },
    select: { id: true },
  })
  const dailyIds = dailies.map((d) => d.id)
  await dbIncludingDeleted.timelineEvent.deleteMany({ where: { memberId: { in: ids } } })
  await dbIncludingDeleted.agreementCheckin.deleteMany({ where: { agreementId: { in: agreementIds } } })
  await dbIncludingDeleted.agreement.updateMany({ where: { id: { in: agreementIds } }, data: { replacesAgreementId: null } })
  await dbIncludingDeleted.agreement.deleteMany({ where: { id: { in: agreementIds } } })
  await dbIncludingDeleted.daily.deleteMany({ where: { id: { in: dailyIds } } })
  await dbIncludingDeleted.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...agreementIds, ...dailyIds] } } })
  await dbIncludingDeleted.teamMember.deleteMany({ where: { id: { in: ids } } })
}

after(async () => {
  await cleanup()
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

describe("texto para WhatsApp", () => {
  test("formato do exemplo do prompt, com seções e emoji só onde pedido", () => {
    const text = buildDailyWhatsApp({
      date: utc(2026, 10, 1),
      reviewed: [
        { name: "Camila", title: "Documentar fluxo de escalonamento", outcome: "DONE" },
        {
          name: "Diego",
          title: "Revisar chamados reabertos",
          outcome: "PARTIAL",
          blockerText: "aguardando acesso ao painel do cliente",
          newDueDate: utc(2026, 10, 3),
        },
      ],
      created: [
        { name: "Larissa", title: "Finalizar tutorial de instalação", dueDate: utc(2026, 10, 1) },
        { name: "Vinícius", title: "Mapear chamados recorrentes do cliente Nbusiness", dueDate: utc(2026, 10, 3) },
      ],
      blockers: [{ name: "Henrique", text: "sem acesso ao ambiente de homologação" }],
    })
    assert.equal(
      text,
      [
        "*Daily — 01/10/2026*",
        "",
        "*Combinados de ontem*",
        "✅ Camila — Documentar fluxo de escalonamento",
        "⚠️ Diego — Revisar chamados reabertos",
        "_Impeditivo: aguardando acesso ao painel do cliente_",
        "_Novo prazo: 03/10_",
        "",
        "*Combinados de hoje*",
        "- Larissa — Finalizar tutorial de instalação",
        "- Vinícius — Mapear chamados recorrentes do cliente Nbusiness — 03/10",
        "",
        "*Bloqueios*",
        "🔴 Henrique — sem acesso ao ambiente de homologação",
      ].join("\n"),
    )
  })

  test("seção vazia some por completo; sem link wa.me; marcadores do usuário não quebram a formatação", () => {
    const text = buildDailyWhatsApp({
      date: utc(2026, 10, 1),
      reviewed: [],
      created: [{ name: "Larissa", title: "Revisar *macro* de _reembolso_", dueDate: utc(2026, 10, 2) }],
      blockers: [],
    })
    assert.equal(text, "*Daily — 01/10/2026*\n\n*Combinados de hoje*\n- Larissa — Revisar macro de reembolso — 02/10")
    assert.ok(!text.includes("Nenhum") && !text.includes("wa.me") && !text.includes("Bloqueios"))
  })

  test("emoji só existe em src/server/whatsapp.ts", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs")
    const { join, relative, sep } = await import("node:path")
    const root = join(import.meta.dirname, "..", "src")
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]))
    const offenders = walk(root)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /\p{Extended_Pictographic}/u.test(readFileSync(f, "utf8").replace(/[©®™]/g, "")))
      .map((f) => relative(root, f).split(sep).join("/"))
    assert.deepEqual(offenders, ["server/whatsapp.ts"])
  })
})

describe("registro de daily", () => {
  const ids: string[] = []
  let doneId = ""
  let rescheduleId = ""
  let replaceId = ""

  before(async () => {
    await cleanup()
    const seniority = await db.seniority.findFirstOrThrow({ where: { key: "JUNIOR" } })
    for (const [i, fullName] of NAMES.entries()) {
      const created = await createMemberRecord(ownerViewer, {
        fullName,
        preferredName: `Teste Daily ${i + 1}`,
        position: "Analista de suporte",
        seniorityId: seniority.id,
        joinedAt: display(-30),
        status: "ACTIVE",
        email: "",
        responsibilityIds: [],
        competencies: [],
      })
      assert.ok(created.ok)
      ids.push((await db.teamMember.findFirstOrThrow({ where: { fullName } })).id)
    }
    for (const title of ["Combinado que fica feito", "Combinado que vai ser reagendado", "Combinado que vai ser substituído"]) {
      assert.ok(
        (
          await createAgreementRecord(ownerViewer, {
            memberId: ids[0]!,
            title,
            dueDate: display(0),
            description: "",
            priority: "NORMAL",
            origin: "MANAGER",
          })
        ).ok,
      )
    }
    const agreements = await db.agreement.findMany({ where: { memberId: ids[0]! }, orderBy: { title: "asc" } })
    doneId = agreements.find((a) => a.title.includes("feito"))!.id
    rescheduleId = agreements.find((a) => a.title.includes("reagendado"))!.id
    replaceId = agreements.find((a) => a.title.includes("substituído"))!.id
  })

  test("revisão traz os combinados abertos que vencem até hoje, agrupados por pessoa, sem repetir", async () => {
    const form = await getDailyForm(ownerViewer)
    assert.ok(form)
    const group = form.review.find((g) => g.member.id === ids[0])
    assert.ok(group)
    assert.deepEqual(new Set(group.items.map((i) => i.id)), new Set([doneId, rescheduleId, replaceId]))
    const all = form.review.flatMap((g) => g.items.map((i) => i.id))
    assert.equal(new Set(all).size, all.length)
    assert.ok(form.members.some((m) => m.id === ids[1]))
  })

  const base = () => ({
    date: display(0),
    summary: "",
    decisions: "",
    participants: [
      { memberId: ids[0]!, present: true, note: "Fechou a fila de integração", isBlocker: false },
      { memberId: ids[1]!, present: true, note: "", isBlocker: false },
    ],
    newAgreements: [] as { memberId: string; title: string; dueDate: string }[],
  })
  const review = (agreementId: string, patch: Record<string, string> = {}) => ({
    agreementId,
    outcome: "DONE",
    blockerText: "",
    blockerReasonId: "",
    action: "reschedule",
    newDueDate: display(1),
    replacementTitle: "",
    replacementDueDate: display(1),
    ...patch,
  })

  test("VIEWER não registra daily", async () => {
    await assert.rejects(createDailyRecord(viewerOnly, { ...base(), reviews: [] }), { name: "ForbiddenError" })
  })

  test("parcial sem impeditivo e reagendamento para a própria data são recusados, sem gravar nada", async () => {
    const before = await db.daily.count()
    const result = await createDailyRecord(ownerViewer, {
      ...base(),
      reviews: [review(rescheduleId, { outcome: "PARTIAL", newDueDate: display(0) })],
    })
    assert.ok(!result.ok)
    assert.ok(result.fieldErrors?.["reviews.0.blockerText"])
    assert.ok(result.fieldErrors?.["reviews.0.newDueDate"])
    assert.equal(await db.daily.count(), before)
  })

  test("salva tudo numa transação: feito, reagendado, substituído, novos combinados e timeline por pessoa", async () => {
    const reason = await db.blockerReason.findFirstOrThrow({ where: { category: "EXTERNAL" } })
    const originalDue = (await db.agreement.findUniqueOrThrow({ where: { id: rescheduleId } })).originalDueDate
    const result = await createDailyRecord(ownerViewer, {
      ...base(),
      summary: "Fila sob controle",
      reviews: [
        review(doneId),
        review(rescheduleId, { outcome: "PARTIAL", blockerText: "Aguardando o fornecedor", blockerReasonId: reason.id, newDueDate: display(3) }),
        review(replaceId, {
          outcome: "NOT_DONE",
          blockerText: "Escopo mudou",
          action: "replace",
          replacementTitle: "Combinado novo no lugar do antigo",
          replacementDueDate: display(2),
        }),
      ],
      newAgreements: [{ memberId: ids[1]!, title: "Combinado novo da daily", dueDate: display(1) }],
    })
    assert.ok(result.ok, JSON.stringify(result))
    const dailyId = result.ok ? result.id : ""

    const done = await db.agreement.findUniqueOrThrow({ where: { id: doneId } })
    assert.equal(done.status, "DONE")
    assert.equal(done.completedAt?.getTime(), today.getTime())

    const moved = await db.agreement.findUniqueOrThrow({ where: { id: rescheduleId } })
    assert.equal(moved.status, "OPEN", "reagendar não muda status (D12)")
    assert.equal(formatDate(moved.dueDate, "business"), display(3))
    assert.equal(moved.originalDueDate.getTime(), originalDue.getTime(), "prazo original intacto (D17)")

    const old = await db.agreement.findUniqueOrThrow({ where: { id: replaceId } })
    assert.equal(old.status, "CANCELLED")
    const replacement = await db.agreement.findFirstOrThrow({ where: { replacesAgreementId: replaceId } })
    assert.equal(replacement.origin, "DAILY")
    assert.equal(replacement.sourceDailyId, dailyId)
    assert.equal(replacement.originalDueDate.getTime(), replacement.dueDate.getTime())

    const fresh = await db.agreement.findFirstOrThrow({ where: { memberId: ids[1]!, sourceDailyId: dailyId } })
    assert.equal(fresh.origin, "DAILY")

    const checkins = await db.agreementCheckin.findMany({ where: { dailyId }, orderBy: { createdAt: "asc" } })
    assert.deepEqual(
      checkins.map((c) => [c.agreementId, c.outcome, c.newDueDate ? formatDate(c.newDueDate, "business") : null]),
      [
        [doneId, "DONE", null],
        [rescheduleId, "PARTIAL", display(3)],
        [replaceId, "NOT_DONE", null],
      ],
    )
    assert.equal(checkins[1]?.blockerReasonId, reason.id)

    // Uma linha DAILY para quem teve nota ou revisão; nenhuma para presença simples.
    const dailyLines = await db.timelineEvent.findMany({ where: { dailyId } })
    assert.deepEqual(dailyLines.map((l) => l.memberId), [ids[0]])
    assert.equal(dailyLines[0]?.title, "Fechou a fila de integração")
    assert.match(dailyLines[0]?.summary ?? "", /^Revisão de 3 combinados: 1 feito, 1 parcial, 1 não feito$/)
    assert.equal(await db.timelineEvent.count({ where: { agreementId: doneId, type: "AGREEMENT_DONE" } }), 1)
    assert.equal(await db.timelineEvent.count({ where: { agreementId: replacement.id, type: "AGREEMENT" } }), 1)
    assert.equal(await db.timelineEvent.count({ where: { agreementId: fresh.id, type: "AGREEMENT" } }), 1)
    assert.equal(await db.auditLog.count({ where: { action: "daily.create", entityId: dailyId } }), 1)

    const participants = await db.dailyParticipant.findMany({ where: { dailyId } })
    assert.equal(participants.length, 2)

    const detail = await getDailyDetail(ownerViewer, dailyId)
    assert.ok(detail)
    assert.equal(detail.reviewed.length, 3)
    assert.equal(detail.reviewed[2]?.replacement?.id, replacement.id)
    assert.deepEqual(detail.whatsapp.created.map((c) => c.title), ["Combinado novo da daily"], "o substituto não se repete em 'de hoje'")
    const text = buildDailyWhatsApp(detail.whatsapp)
    assert.ok(text.includes("_Substituído por: Combinado novo no lugar do antigo"))
  })

  test("a daily seguinte revisa os combinados criados nesta, qualquer que seja o prazo", async () => {
    const nextDay = nextBusinessDay(today)
    const form = await getDailyForm(ownerViewer, nextDay)
    const items = form!.review.flatMap((g) => g.items)
    const fresh = await db.agreement.findFirstOrThrow({ where: { memberId: ids[1]!, title: "Combinado novo da daily" } })
    const replacement = await db.agreement.findFirstOrThrow({ where: { replacesAgreementId: replaceId } })
    assert.ok(items.some((i) => i.id === fresh.id && i.fromPreviousDaily))
    assert.ok(items.some((i) => i.id === replacement.id && i.fromPreviousDaily))
    assert.ok(!items.some((i) => i.id === doneId), "o feito não volta")
  })

  test("combinado já encerrado em outra tela não é revisado de novo; nada é gravado", async () => {
    const before = await db.daily.count()
    const result = await createDailyRecord(ownerViewer, { ...base(), reviews: [review(doneId)] })
    assert.ok(!result.ok && result.error.startsWith("Um dos combinados revisados já foi encerrado"))
    assert.equal(await db.daily.count(), before)
  })
})

describe("próxima daily: fins de semana e feriados nacionais", () => {
  test("pula Sexta-feira Santa, Tiradentes, Consciência Negra e Natal", () => {
    assert.ok(isNationalHoliday(utc(2026, 4, 3)), "Sexta-feira Santa de 2026")
    assert.ok(isNationalHoliday(utc(2025, 4, 18)), "Sexta-feira Santa de 2025")
    assert.ok(!isNationalHoliday(utc(2026, 2, 17)), "Carnaval é ponto facultativo")
    assert.ok(!isNationalHoliday(utc(2023, 11, 20)), "20/11 só é nacional a partir de 2024")
    assert.equal(nextBusinessDay(utc(2026, 4, 2)).getTime(), utc(2026, 4, 6).getTime())
    assert.equal(nextBusinessDay(utc(2026, 4, 20)).getTime(), utc(2026, 4, 22).getTime())
    assert.equal(nextBusinessDay(utc(2026, 11, 19)).getTime(), utc(2026, 11, 23).getTime())
    assert.equal(nextBusinessDay(utc(2026, 12, 24)).getTime(), utc(2026, 12, 28).getTime())
    assert.equal(nextBusinessDay(utc(2026, 10, 2)).getTime(), utc(2026, 10, 5).getTime())
  })
})

describe("daily retroativa, aviso de mesmo dia e edição", () => {
  let dailyId = ""
  const past = (() => {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - 400)
    return d
  })()
  const testIds = async () =>
    (await db.teamMember.findMany({ where: { fullName: { in: NAMES } }, orderBy: { fullName: "asc" } })).map((m) => m.id)

  test("o formulário de uma data passada usa aquela data e avisa quando já há daily nela", async () => {
    const empty = await getDailyForm(ownerViewer, past)
    assert.ok(empty)
    assert.equal(empty.date.getTime(), past.getTime())
    assert.equal(empty.sameDay.length, 0)

    const ids = await testIds()
    const result = await createDailyRecord(ownerViewer, {
      date: formatDate(past, "business"),
      summary: "Daily que ficou para trás",
      decisions: "",
      reviews: [],
      participants: [
        { memberId: ids[0]!, present: true, note: "Nota original", isBlocker: false },
        { memberId: ids[1]!, present: true, note: "", isBlocker: false },
      ],
      newAgreements: [],
    })
    assert.ok(result.ok)
    dailyId = result.id
    const again = await getDailyForm(ownerViewer, past)
    assert.deepEqual(again!.sameDay.map((d) => d.id), [dailyId])
  })

  test("editar troca resumo, notas e presença, e refaz as linhas DAILY na mesma transação", async () => {
    const ids = await testIds()
    assert.deepEqual((await db.timelineEvent.findMany({ where: { dailyId } })).map((l) => l.memberId), [ids[0]])

    const result = await updateDailyRecord(ownerViewer, {
      id: dailyId,
      summary: "Resumo corrigido",
      decisions: "Decisão nova",
      participants: [
        { memberId: ids[0]!, present: false, note: "", isBlocker: false },
        { memberId: ids[1]!, present: true, note: "Aguardando acesso ao ERP", isBlocker: true },
      ],
    })
    assert.ok(result.ok)
    const daily = await db.daily.findUniqueOrThrow({ where: { id: dailyId }, include: { participants: true } })
    assert.equal(daily.summary, "Resumo corrigido")
    assert.equal(daily.decisions, "Decisão nova")
    const byMember = new Map(daily.participants.map((p) => [p.memberId, p]))
    assert.equal(byMember.get(ids[0]!)?.present, false)
    assert.equal(byMember.get(ids[1]!)?.blocker, "Aguardando acesso ao ERP")
    assert.equal(byMember.get(ids[1]!)?.note, null)

    const lines = await db.timelineEvent.findMany({ where: { dailyId } })
    assert.deepEqual(lines.map((l) => l.memberId), [ids[1]], "quem perdeu a nota perde a linha; quem ganhou passa a ter")
    assert.equal(lines[0]?.title, "Aguardando acesso ao ERP")
    assert.deepEqual(lines[0]?.tags, ["impeditivo"])
    assert.equal(formatDate(lines[0]!.occurredAt), formatDate(past, "business"))
    assert.equal(await db.auditLog.count({ where: { action: "daily.update", entityId: dailyId } }), 1)
  })

  test("editar recusa participante que não estava na daily e recusa VIEWER", async () => {
    const ids = await testIds()
    const other = await db.teamMember.findFirstOrThrow({ where: { id: { notIn: ids } } })
    const input = {
      id: dailyId,
      summary: "",
      decisions: "",
      participants: [
        { memberId: ids[0]!, present: true, note: "", isBlocker: false },
        { memberId: other.id, present: true, note: "Intrusa", isBlocker: false },
      ],
    }
    assert.ok(!(await updateDailyRecord(ownerViewer, input)).ok)
    await assert.rejects(updateDailyRecord(viewerOnly, input), { name: "ForbiddenError" })
    assert.equal((await db.daily.findUniqueOrThrow({ where: { id: dailyId } })).summary, "Resumo corrigido")
  })
})
