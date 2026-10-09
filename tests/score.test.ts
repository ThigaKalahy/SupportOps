/**
 * P17 — arquitetura de score. Cadastro de métricas (chave fixa, em uso não se
 * exclui), definições de score versionadas (pesos somando 100 para ativar,
 * versão ativa travada, uma ativa por nome, versão nova copia a composição),
 * auditoria, e as garantias de D5: nada é calculado, nenhum resultado é
 * gravado, src/server/score.ts só tem tipos e nenhuma tela de pessoa lê
 * métrica ou score.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { after, before, describe, test } from "node:test"

import { activationProblems, isEditable, weightSum } from "../src/lib/score-composition.ts"
import { db, dbIncludingDeleted } from "../src/server/db.ts"
import {
  createScoreDefinitionRecord,
  deleteScoreDefinitionRecord,
  newScoreVersionRecord,
  removeScoreComponentRecord,
  setScoreActiveRecord,
  setScoreComponentRecord,
} from "../src/server/score-definitions.ts"
import { listMetrics } from "../src/server/queries/settings.ts"
import { deleteCatalogItemRecord, saveCatalogItemRecord, setCatalogItemActiveRecord } from "../src/server/settings.ts"
import { seedContexts } from "./support/team-context.ts"

const owner = await dbIncludingDeleted.user.findFirstOrThrow({ where: { role: "OWNER" } })
const { manager: ownerViewer, viewer: viewerOnly } = await seedContexts(owner)
const NAME = "Definição de Teste do Score"
const METRIC_KEY = "teste_metrica_score"

async function cleanup() {
  const defs = await dbIncludingDeleted.scoreDefinition.findMany({ where: { name: NAME }, select: { id: true } })
  const metrics = await dbIncludingDeleted.metricDefinition.findMany({ where: { key: METRIC_KEY }, select: { id: true } })
  const ids = [...defs.map((d) => d.id), ...metrics.map((m) => m.id)]
  await dbIncludingDeleted.scoreDefinition.deleteMany({ where: { name: NAME } })
  await dbIncludingDeleted.metricDefinition.deleteMany({ where: { key: METRIC_KEY } })
  await dbIncludingDeleted.auditLog.deleteMany({ where: { entityId: { in: ids } } })
}

before(cleanup)
after(async () => {
  await cleanup()
  await db.$disconnect()
  await dbIncludingDeleted.$disconnect()
})

const metricByKey = async (key: string) => db.metricDefinition.findFirstOrThrow({ where: { teamId: ownerViewer.teamId, key } })

describe("seed e regras puras", () => {
  test("seed: as nove métricas do P17, sem nenhum resultado e sem score", async () => {
    const keys = (await listMetrics(ownerViewer)).map((m) => m.key).sort()
    for (const key of [
      "backlog",
      "csat",
      "handle_time",
      "recurrence_rate",
      "reopen_rate",
      "return_72h",
      "sla_first_response",
      "sla_resolution",
      "ticket_volume",
    ]) {
      assert.ok(keys.includes(key), key)
    }
    assert.equal(await db.metricResult.count(), 0)
    assert.equal(await db.scoreResult.count(), 0)
    assert.equal(await db.scoreResultComponent.count(), 0)
  })

  test("composição: soma dos pesos (sem erro de ponto flutuante), o que impede ativar, quando a versão trava", () => {
    assert.equal(weightSum([{ weight: 33.3 }, { weight: 33.3 }, { weight: 33.4 }]), 100)
    assert.deepEqual(activationProblems([]), ["noComponents", "weightSum"])
    assert.deepEqual(activationProblems([{ weight: 60 }, { weight: 30 }]), ["weightSum"])
    assert.deepEqual(activationProblems([{ weight: 60 }, { weight: 40 }]), [])
    assert.equal(isEditable({ isActive: false, results: 0 }), true)
    assert.equal(isEditable({ isActive: true, results: 0 }), false)
    assert.equal(isEditable({ isActive: false, results: 3 }), false)
  })
})

describe("/settings/metrics", () => {
  test("chave válida e única; não muda na edição; em uso não se exclui; VIEWER não escreve", async () => {
    const base = { label: "Métrica de teste", key: METRIC_KEY, unit: "%", direction: "LOWER_IS_BETTER", sourceSystem: "helpdesk" }
    assert.equal((await saveCatalogItemRecord(ownerViewer, "metric", { ...base, key: "Chave Inválida" })).ok, false)
    await assert.rejects(saveCatalogItemRecord(viewerOnly, "metric", base), { name: "ForbiddenError" })
    assert.ok((await saveCatalogItemRecord(ownerViewer, "metric", base)).ok)
    const dup = await saveCatalogItemRecord(ownerViewer, "metric", { ...base, label: "Outra" })
    assert.equal(dup.ok, false)

    const created = await metricByKey(METRIC_KEY)
    assert.ok((await saveCatalogItemRecord(ownerViewer, "metric", { ...base, id: created.id, label: "Métrica de teste editada", key: "outra_chave" })).ok)
    const edited = await db.metricDefinition.findFirstOrThrow({ where: { id: created.id } })
    assert.equal(edited.key, METRIC_KEY, "a chave não muda")
    assert.equal(edited.label, "Métrica de teste editada")
    assert.ok(await dbIncludingDeleted.auditLog.findFirst({ where: { action: "settings.metric.update", entityId: created.id } }))
  })
})

describe("/settings/score", () => {
  test("versão 1 em rascunho; ativar exige 100%; ativa trava; versão nova copia; uma ativa por nome; excluir só rascunho", async () => {
    const csat = await metricByKey("csat")
    const sla = await metricByKey("sla_first_response")
    const mine = await metricByKey(METRIC_KEY)

    const created = await createScoreDefinitionRecord(ownerViewer, { name: NAME, notes: "Não é ranking." })
    assert.ok(created.ok && "id" in created)
    const v1 = created.id
    assert.equal((await createScoreDefinitionRecord(ownerViewer, { name: NAME.toUpperCase(), notes: "" })).ok, false, "nome repetido")

    const component = (metricDefinitionId: string, weight: number) => ({ scoreDefinitionId: v1, metricDefinitionId, weight, normalizationMin: 0, normalizationMax: 100 })
    assert.equal((await setScoreComponentRecord(ownerViewer, { ...component(csat.id, 50), normalizationMax: 0 })).ok, false, "faixa invertida")
    assert.ok((await setScoreComponentRecord(ownerViewer, component(csat.id, 50))).ok)
    assert.ok((await setScoreComponentRecord(ownerViewer, component(sla.id, 30))).ok)
    const refused = await setScoreActiveRecord(ownerViewer, { scoreDefinitionId: v1, active: true })
    assert.equal(refused.ok, false, "80% não ativa")
    assert.ok((await setScoreComponentRecord(ownerViewer, component(mine.id, 20))).ok)
    assert.ok((await setScoreActiveRecord(ownerViewer, { scoreDefinitionId: v1, active: true })).ok)

    // Métrica em uso numa composição não se exclui.
    assert.equal((await deleteCatalogItemRecord(ownerViewer, { kind: "metric", id: mine.id })).ok, false)

    // Ativa: travada.
    assert.equal((await setScoreComponentRecord(ownerViewer, component(csat.id, 40))).ok, false)
    assert.equal((await removeScoreComponentRecord(ownerViewer, { scoreDefinitionId: v1, metricDefinitionId: csat.id })).ok, false)
    assert.equal((await deleteScoreDefinitionRecord(ownerViewer, { scoreDefinitionId: v1 })).ok, false)

    // Versão nova: mesma composição, rascunho, número seguinte.
    const next = await newScoreVersionRecord(ownerViewer, { scoreDefinitionId: v1 })
    assert.ok(next.ok && "id" in next)
    const v2 = await db.scoreDefinition.findFirstOrThrow({ where: { id: next.id }, include: { components: true } })
    assert.deepEqual([v2.version, v2.isActive, v2.components.length], [2, false, 3])
    assert.ok((await setScoreComponentRecord(ownerViewer, { ...component(csat.id, 60), scoreDefinitionId: v2.id })).ok)
    assert.ok((await setScoreComponentRecord(ownerViewer, { ...component(mine.id, 10), scoreDefinitionId: v2.id })).ok)
    assert.ok((await setScoreActiveRecord(ownerViewer, { scoreDefinitionId: v2.id, active: true })).ok)
    const actives = await db.scoreDefinition.findMany({ where: { name: NAME, isActive: true } })
    assert.deepEqual(actives.map((a) => a.version), [2], "uma ativa por nome")
    const v1Components = await db.scoreComponent.findMany({ where: { scoreDefinitionId: v1 } })
    assert.equal(v1Components.find((c) => c.metricDefinitionId === csat.id)?.weight, 50, "a versão 1 não foi reescrita")

    // v1 agora inativa e sem resultado: volta a ser rascunho e pode sair.
    assert.ok((await deleteScoreDefinitionRecord(ownerViewer, { scoreDefinitionId: v1 })).ok)
    await assert.rejects(setScoreActiveRecord(viewerOnly, { scoreDefinitionId: v2.id, active: false }), { name: "ForbiddenError" })
    assert.ok((await setScoreActiveRecord(ownerViewer, { scoreDefinitionId: v2.id, active: false })).ok)

    const actions = (await dbIncludingDeleted.auditLog.findMany({ where: { entityId: { in: [v1, v2.id] } }, select: { action: true } })).map((a) => a.action)
    for (const a of ["settings.score.create", "settings.score.component", "settings.score.activate", "settings.score.version", "settings.score.delete", "settings.score.deactivate"]) {
      assert.ok(actions.includes(a), a)
    }

    // Métrica desativada não entra em composição nova.
    assert.ok((await setCatalogItemActiveRecord(ownerViewer, { kind: "metric", id: mine.id, active: false })).ok)
    const v3 = await newScoreVersionRecord(ownerViewer, { scoreDefinitionId: v2.id })
    assert.ok(v3.ok && "id" in v3)
    await db.scoreComponent.deleteMany({ where: { scoreDefinitionId: v3.id, metricDefinitionId: mine.id } })
    assert.equal((await setScoreComponentRecord(ownerViewer, { ...component(mine.id, 10), scoreDefinitionId: v3.id })).ok, false)

    // Nada foi calculado.
    assert.equal(await db.scoreResult.count(), 0)
  })
})

describe("D5: arquitetura apenas", () => {
  test("src/server/score.ts só tem tipos, com o aviso no topo", () => {
    const source = readFileSync("src/server/score.ts", "utf8")
    assert.match(source, /insumo de conversa, não substituto de avaliação/)
    assert.match(source, /nenhum score pode ser exibido sem o breakdown/)
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    assert.ok(!/\b(function|const|let|var|class|return)\b|=>/.test(code), "nenhuma implementação")
  })

  test("nada no código grava resultado de métrica ou score", () => {
    const files = walk("src")
    const writes = files.filter((f) => /\b(metricResult|scoreResult|scoreResultComponent)\.(create|createMany|update|upsert)/.test(readFileSync(f, "utf8")))
    assert.deepEqual(writes, [])
  })

  test("critério de aceite: nenhuma tela de pessoa lê métrica ou score", () => {
    const personScreens = [
      ...walk("src/app/(app)/team"),
      ...walk("src/components/member"),
      ...walk("src/components/timeline"),
      ...walk("src/components/development"),
      ...walk("src/components/records"),
      "src/server/queries/profile.ts",
      "src/server/queries/members.ts",
      "src/server/queries/timeline.ts",
    ]
    const leaks = personScreens.filter((f) => /metricResult|scoreResult|MetricResult|ScoreResult|queries\/score|server\/score|score-composition/.test(readFileSync(f, "utf8")))
    assert.deepEqual(leaks, [])
  })
})

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}
