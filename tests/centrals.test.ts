/**
 * P19 — Central de atendimento (D20, D23). Regras puras, sem banco: slug como
 * chave de deduplicação ("central alfa" com "Central Alfa" cadastrada não
 * duplica), pré-visualização da importação (nunca sobrescreve nem reativa),
 * texto do WhatsApp com a central, a migration aditiva e os pontos de uso.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, test } from "node:test"

import { centralSlug, centralWhere, CENTRAL_NONE, matchesCentral, previewCentralImport } from "../src/lib/centrals.ts"
import { buildDailyWhatsApp } from "../src/server/whatsapp.ts"

describe("slug (D20)", () => {
  test("mesma central com caixa, acento, espaços e pontuação diferentes", () => {
    for (const name of ["Central Alfa", "central alfa", "Central  Alfa ", " CENTRAL-ALFA", "Central_Alfa!"]) {
      assert.equal(centralSlug(name), "central-alfa", name)
    }
    assert.equal(centralSlug("Central São Paulo"), "central-sao-paulo")
    assert.equal(centralSlug("N1 / Suporte"), "n1-suporte")
    assert.equal(centralSlug(" — ; ! "), "")
  })

  test("busca do combobox sem acento e sem caso", () => {
    assert.ok(matchesCentral("Central São Paulo", "sao pau"))
    assert.ok(matchesCentral("Central Alfa", "CENTRAL"))
    assert.ok(!matchesCentral("Central Alfa", "beta"))
    assert.ok(matchesCentral("Central Alfa", ""))
  })

  test("filtro de listagem: id, sem central ou nada", () => {
    assert.deepEqual(centralWhere(null), {})
    assert.deepEqual(centralWhere(CENTRAL_NONE), { centralId: null })
    assert.deepEqual(centralWhere("abc"), { centralId: "abc" })
  })
})

describe("importação por colagem", () => {
  const existing = [
    { id: "1", name: "Central Alfa", slug: "central-alfa", isActive: true },
    { id: "2", name: "Central Gama", slug: "central-gama", isActive: false },
  ]

  test("novas, existentes pelo slug (ignoradas, inclusive desativada), vazias e inválidas", () => {
    const preview = previewCentralImport(
      ['nome', 'central alfa', '"Central Beta";CB-002', '', 'Central Gama', 'Central Beta', ' — ', 'a;b;c', '  Central   Delta  '].join("\n"),
      existing,
    )
    assert.deepEqual(
      preview.created.map((c) => [c.name, c.slug, c.externalId]),
      [
        ["Central Beta", "central-beta", "CB-002"],
        ["Central Delta", "central-delta", null],
      ],
    )
    assert.deepEqual(
      preview.existing.map((e) => [e.name, e.existingName, e.inactive]),
      [
        ["central alfa", "Central Alfa", false],
        ["Central Gama", "Central Gama", true],
        ["Central Beta", "Central Beta", false],
      ],
    )
    assert.equal(preview.empty, 1)
    assert.deepEqual(
      preview.invalid.map((i) => [i.line, i.reason]),
      [
        [1, "header"],
        [7, "noName"],
        [8, "tooManyFields"],
      ],
    )
  })

  test("CRLF do Excel e nome longo demais", () => {
    const preview = previewCentralImport(`Central Um\r\nCentral Dois\r\n${"x".repeat(81)}`, [])
    assert.deepEqual(preview.created.map((c) => c.name), ["Central Um", "Central Dois"])
    assert.equal(preview.invalid[0]?.reason, "tooLong")
  })
})

describe("WhatsApp com central (P19 + C1)", () => {
  test("central entre o nome e o título; sem central, a linha sai sem ela; prazo igual à daily omitido", () => {
    const date = new Date(Date.UTC(2026, 9, 8))
    const text = buildDailyWhatsApp({
      date,
      reviewed: [],
      created: [
        { name: "Larissa", central: "Central Alfa", title: "Finalizar tutorial de instalação", dueDate: date },
        { name: "Vinícius", central: null, title: "Mapear chamados recorrentes", dueDate: new Date(Date.UTC(2026, 9, 10)) },
      ],
      blockers: [],
    })
    assert.equal(
      text,
      "*Daily — 08/10/2026*\n\n*Combinados de hoje*\n- Larissa — Central Alfa — Finalizar tutorial de instalação\n- Vinícius — Mapear chamados recorrentes — 10/10",
    )
    assert.ok(!text.includes("sem central"))
  })
})

describe("migration aditiva (D23)", () => {
  const sql = readFileSync("prisma/migrations/20261008120000_centrals/migration.sql", "utf8")

  test("só cria tabela, colunas NULLABLE, índices e chaves; nada é apagado, reescrito ou exigido", () => {
    // "ON DELETE SET NULL" / "ON UPDATE CASCADE" das chaves são permitidos; comando que reescreve dado, não.
    assert.ok(!/\bDROP\b|^\s*UPDATE\b|\bDELETE FROM\b|\bTRUNCATE\b|\bRENAME\b|\bSET NOT NULL\b/im.test(sql))
    assert.match(sql, /ALTER TABLE "Agreement" ADD COLUMN\s+"centralId" TEXT;/)
    assert.match(sql, /ALTER TABLE "PriorityValidation" ADD COLUMN\s+"centralId" TEXT;/)
    for (const line of sql.split("\n").filter((l) => /ADD COLUMN/.test(l))) assert.ok(!/NOT NULL/.test(line), line)
    assert.match(sql, /CREATE UNIQUE INDEX "Central_organizationId_slug_key"/)
    assert.match(sql, /"Agreement_centralId_createdAt_idx"/)
    assert.match(sql, /"PriorityValidation_centralId_validatedAt_idx"/)
    assert.match(sql, /ON DELETE SET NULL/)
  })
})

describe("onde o campo aparece", () => {
  test("daily (entre responsável e título), criação rápida e validação usam o CentralCombobox", () => {
    const daily = readFileSync("src/components/dailies/daily-form.tsx", "utf8")
    const member = daily.indexOf("rowMemberRefs.current[row.key] = el")
    const central = daily.indexOf("<CentralCombobox", member)
    const title = daily.indexOf("L.newAgreements.agreementTitle} ${i + 1}", member)
    assert.ok(member > 0 && central > member && title > central, "ordem: responsável → central → título")
    assert.match(readFileSync("src/components/forms/agreement-dialog.tsx", "utf8"), /<CentralCombobox/)
    const form = readFileSync("src/components/priority-validations/validation-form.tsx", "utf8")
    assert.ok(form.indexOf('data-field="memberId"') < form.indexOf("<CentralCombobox"))
    assert.ok(form.indexOf("<CentralCombobox") < form.indexOf('data-field="analystPriorityId"'))
  })

  test("o campo nunca é obrigatório e não acrescenta parada de Tab além do próprio campo", () => {
    const combobox = readFileSync("src/components/ui/CentralCombobox.tsx", "utf8")
    assert.match(combobox, /tabIndex=\{-1\}/)
    assert.ok(!/required/.test(combobox))
    for (const file of ["src/lib/validators/agreement.ts", "src/lib/validators/daily.ts", "src/lib/validators/priority-validation.ts"]) {
      assert.match(readFileSync(file, "utf8"), /centralId: z\.string\(\)\.max\(40\)\.default\(""\)/, file)
    }
  })
})
