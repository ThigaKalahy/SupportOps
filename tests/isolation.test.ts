/**
 * P22 — ISOLAMENTO DURO entre times (D29–D36). Critério de aceite da fase e
 * obrigatório antes de qualquer merge (CLAUDE.md).
 *
 * Duas camadas:
 * 1. Estrutural (sem banco): varre src/server/queries, src/server/*.ts (núcleos
 *    de escrita) e src/actions em busca de leitura/escrita em modelo escopado
 *    cujo `where` não carrega o time; confere que todo SQL cru filtra `teamId`,
 *    que toda Server Action monta o contexto, e que escopo e visibilidade não se
 *    chamam (D29). A lista de exceções é explícita e comentada; a regra nunca é
 *    desligada.
 * 2. Banco: dois times (T1, T2) numa organização própria, cada um com pessoa,
 *    combinado, feedback PRIVATE e SHARED, anotação PRIVATE, observação, daily,
 *    PDI, linhas de timeline e os catálogos/registros dos módulos. Três usuários:
 *    M1 (MANAGER de T1), M2 (MANAGER de T2) e V (VIEWER de T1 e T2). Para CADA
 *    função exportada de src/server/queries (meta-teste garante a cobertura):
 *    nada de T2 com o contexto de T1 — nem id, nem texto, nem contagem —, inclusive
 *    passando ids de T2 de propósito; V não recebe nada PRIVATE. Para CADA núcleo
 *    de escrita (`*Record`), V recebe erro. Contexto de time sem acesso é ERRO,
 *    nunca lista vazia. Módulo desligado em T2 faz query e escrita lançarem.
 *
 * Roda no banco de TESTE (`pnpm test` usa .env.test): cria e apaga só ids com o
 * prefixo `iso_` e a organização `iso-org`.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { after, before, describe, test } from "node:test"

import { parseAgreementFilters } from "../src/lib/agreement-filters.ts"
import { todayBusinessDate } from "../src/lib/dates.ts"
import { parseDevReturnFilters } from "../src/lib/dev-return-filters.ts"
import { MODULE_KEYS, MODULES } from "../src/lib/modules.ts"
import { MEMBER_HOME, routeRequest } from "../src/lib/portal-routing.ts"
import { accountTier } from "../src/server/account-tier.ts"
import { verifyCredentials } from "../src/server/credentials.ts"
import { MemberAccessError, memberContextFor, type MemberContext } from "../src/server/member-scope.ts"
import { hashPassword } from "../src/server/password.ts"
import { deactivateMemberAccount, inviteMember } from "../src/server/provisioning.ts"
import * as memberPortal from "../src/server/queries/member-portal.ts"
import { parseRecordFilters } from "../src/lib/records-filters.ts"
import { parseTimelineFilters } from "../src/lib/timeline-filters.ts"
import { parseValidationFilters } from "../src/lib/validation-filters.ts"
import { parseWatchFilters } from "../src/lib/watch-filters.ts"
import { getAlerts } from "../src/server/alerts.ts"
import { createAgreementRecord, completeAgreementRecord, cancelAgreementRecord, transferAgreementRecord, updateAgreementRecord } from "../src/server/agreements.ts"
import { ensureCentralRecord, importCentralsRecord } from "../src/server/centrals.ts"
import { createDailyRecord, updateDailyRecord } from "../src/server/dailies.ts"
import { db, dbIncludingDeleted } from "../src/server/db.ts"
import { createDevReturnRecord, deleteDevReturnRecord, resolveDevReturnRecord, updateDevReturnRecord } from "../src/server/dev-returns.ts"
import {
  addPlanActionRecord,
  archiveTraitRecord,
  createMentorshipRecord,
  createPlanRecord,
  createTraitRecord,
  endMentorshipRecord,
  reviewPlanRecord,
  setActionStatusRecord,
  setExpectationRecord,
  setPlanStatusRecord,
  updatePlanRecord,
} from "../src/server/development.ts"
import {
  createMemberRecord,
  deactivateMemberRecord,
  reactivateMemberRecord,
  updateManagerSummaryRecord,
  updateMemberRecord,
} from "../src/server/members.ts"
import { createValidationRecord, deleteValidationRecord, updateValidationRecord } from "../src/server/priority-validations.ts"
import * as adherence from "../src/server/queries/adherence.ts"
import * as agreements from "../src/server/queries/agreements.ts"
import * as alertsQ from "../src/server/queries/alerts.ts"
import * as centrals from "../src/server/queries/centrals.ts"
import * as dailies from "../src/server/queries/dailies.ts"
import * as devReturns from "../src/server/queries/dev-returns.ts"
import * as development from "../src/server/queries/development.ts"
import * as members from "../src/server/queries/members.ts"
import * as validations from "../src/server/queries/priority-validations.ts"
import * as profile from "../src/server/queries/profile.ts"
import * as records from "../src/server/queries/records.ts"
import * as score from "../src/server/queries/score.ts"
import * as search from "../src/server/queries/search.ts"
import * as settings from "../src/server/queries/settings.ts"
import * as thresholds from "../src/server/queries/thresholds.ts"
import * as timeline from "../src/server/queries/timeline.ts"
import * as today from "../src/server/queries/today.ts"
import * as teamsQ from "../src/server/queries/teams.ts"
import * as vacations from "../src/server/queries/vacations.ts"
import * as watch from "../src/server/queries/watch.ts"
import {
  createFeedbackRecord,
  createNoteRecord,
  createOneOnOneRecord,
  deleteRecordRecord,
  setRecordVisibilityRecord,
  updateFeedbackRecord,
  updateNoteRecord,
  updateOneOnOneRecord,
} from "../src/server/records.ts"
import { listAccessibleTeams, teamContextFor, type TeamContext } from "../src/server/scope.ts"
import { grantTeamAccessRecord, revokeTeamAccessRecord, setTeamModuleRecord } from "../src/server/teams.ts"
import {
  createScoreDefinitionRecord,
  deleteScoreDefinitionRecord,
  newScoreVersionRecord,
  removeScoreComponentRecord,
  setScoreActiveRecord,
  setScoreComponentRecord,
  updateScoreNotesRecord,
} from "../src/server/score-definitions.ts"
import {
  deleteCatalogItemRecord,
  moveCatalogItemRecord,
  saveCatalogItemRecord,
  setCatalogItemActiveRecord,
  setThresholdRecord,
} from "../src/server/settings.ts"
import { recordTimelineEvents, timelineEventFor } from "../src/server/timeline.ts"
import {
  archiveWatchItemRecord,
  changeWatchHeatRecord,
  createWatchItemRecord,
  resolveWatchItemRecord,
  reviewWatchItemRecord,
  setWatchVisibilityRecord,
  updateWatchItemRecord,
} from "../src/server/watch.ts"
import { cancelVacationRecord, createVacationRecord } from "../src/server/vacations.ts"

const SRC = join(import.meta.dirname, "..", "src")

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [path] : []
  })
}

const rel = (file: string) => relative(SRC, file).split(sep).join("/")

/** Trecho da chamada: do parêntese de abertura ao fechamento correspondente. */
function callBody(source: string, openParenIndex: number): string {
  let depth = 0
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === "(") depth++
    if (source[i] === ")" && --depth === 0) return source.slice(openParenIndex, i + 1)
  }
  return source.slice(openParenIndex)
}

/* ══════════════════════════════ 1. ESTRUTURAL ══════════════════════════════ */

/** Modelos de dado de time (D31): todo `where` sobre eles carrega o time. */
const SCOPED_MODELS = [
  "teamMember", "daily", "seniority", "competency", "competencyExpectation", "responsibility", "blockerReason",
  "central", "ticketUrlPattern", "priorityLevel", "reclassificationReason", "devReturnReason", "metricDefinition",
  "scoreDefinition", "watchItem", "alertThreshold", "agreement", "oneOnOne", "feedback", "note", "timelineEvent",
  "developmentPlan", "memberChange", "mentorshipLink", "memberCompetency", "agreementCheckin", "priorityValidation",
  "devReturn", "memberTrait", "memberResponsibility", "dailyParticipant", "agreementParticipant", "watchReview",
  "developmentAction", "scoreComponent", "metricResult", "scoreResult", "scoreResultComponent",
  // C4
  "agreementTransfer", "memberVacation",
]
const GUARDED_METHODS = ["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy", "update", "updateMany", "delete", "deleteMany"]
const CALL = new RegExp(`\\b(?:db|tx|dbIncludingDeleted)\\.(${SCOPED_MODELS.join("|")})\\.(${GUARDED_METHODS.join("|")})\\(`, "g")

/**
 * Exceções EXPLÍCITAS da varredura, cada uma com o motivo. Chave: "arquivo:modelo.método".
 * A regra nunca é desligada; caso legítimo entra aqui, comentado.
 */
const EXCEPTIONS: Record<string, string> = {
  // timeline.ts: o Tx estrutural recebe `where` montado com `teamId: scope.teamId` na própria linha.
}

/**
 * Identificadores (variáveis e funções) que carregam o time num arquivo: atribuídos
 * de uma expressão com `teamScope(`/`teamId`, ou funções cujo corpo devolve isso.
 */
function scopedIdentifiers(source: string): Set<string> {
  const names = new Set<string>()
  for (const [name, rhs] of assignments(source)) {
    if (/teamScope\(|teamId/.test(rhs)) names.add(name)
  }
  for (const m of source.matchAll(/function\s+(\w+)\s*\(/g)) {
    const start = source.indexOf("{", m.index! + m[0].length)
    let depth = 0
    let end = start
    for (let i = start; i < source.length; i++) {
      if (source[i] === "{") depth++
      if (source[i] === "}" && --depth === 0) {
        end = i
        break
      }
    }
    const body = source.slice(start, end)
    if (/return[\s\S]{0,80}(teamScope\(|teamId)/.test(body)) names.add(m[1]!)
  }
  // Segunda passada: variável montada a partir de outra variável escopada.
  for (const [name, rhs] of assignments(source)) {
    if ([...names].some((n) => new RegExp(`\\.\\.\\.${n}\\b|\\b${n}\\(`).test(rhs))) names.add(name)
  }
  return names
}

/** `const x = <expressão>`: a expressão inteira, inclusive objeto em várias linhas (chaves balanceadas). */
function assignments(source: string): [string, string][] {
  const out: [string, string][] = []
  for (const m of source.matchAll(/(?:const|let)\s+(\w+)\s*(?::[^=\n]+)?=\s*/g)) {
    const start = (m.index ?? 0) + m[0].length
    if (source[start] !== "{") {
      out.push([m[1]!, source.slice(start, source.indexOf("\n", start))])
      continue
    }
    let depth = 0
    for (let i = start; i < source.length; i++) {
      if (source[i] === "{") depth++
      if (source[i] === "}" && --depth === 0) {
        out.push([m[1]!, source.slice(start, i + 1)])
        break
      }
    }
  }
  return out
}

/** Código sem comentários (o que vale é o que roda, não o que se descreve). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

describe("estrutural: escopo de time em toda leitura e escrita (sem banco)", () => {
  const files = sourceFiles(SRC).filter((f) => {
    const r = rel(f)
    return r.startsWith("server/queries/") || r.startsWith("actions/") || /^server\/[^/]+\.ts$/.test(r)
  })

  test("existem arquivos para analisar", () => assert.ok(files.length > 40))

  test("todo where em modelo escopado carrega teamId (teamScope, teamId ou variável escopada)", () => {
    const violations: string[] = []
    for (const file of files) {
      const source = readFileSync(file, "utf8")
      const scoped = scopedIdentifiers(source)
      for (const match of source.matchAll(CALL)) {
        const key = `${rel(file)}:${match[1]}.${match[2]}`
        if (key in EXCEPTIONS) continue
        const body = callBody(source, (match.index ?? 0) + match[0].length - 1)
        const ok =
          body.includes("teamScope(") ||
          body.includes("memberOwnScope(") ||
          /\bteamId\b/.test(body) ||
          [...scoped].some((name) => new RegExp(`(\\.\\.\\.|where:\\s*|\\b)${name}\\b`).test(body))
        if (!ok) violations.push(`${key}: where sem teamId`)
      }
    }
    assert.deepEqual(violations, [])
  })

  test("todo SQL cru em src/server/queries filtra o time (teamSql ou \"teamId\")", () => {
    const violations: string[] = []
    for (const file of files.filter((f) => rel(f).startsWith("server/queries/"))) {
      const source = readFileSync(file, "utf8")
      for (const match of source.matchAll(/\$queryRaw(?:<[^>]*>)?`/g)) {
        const start = (match.index ?? 0) + match[0].length - 1
        const end = source.indexOf("`\n", start + 1)
        const sql = source.slice(start, end > start ? end : undefined)
        if (!/teamSql\(|"teamId"/.test(sql)) violations.push(`${rel(file)}: $queryRaw sem filtro de time`)
      }
      // Resumos montados em Prisma.sql (summarySql): o escopo comum precisa ter o time.
      if (source.includes("summarySql") && !/function scopeSql[\s\S]{0,300}teamSql\(/.test(source)) {
        violations.push(`${rel(file)}: summarySql sem teamSql no escopo comum`)
      }
    }
    assert.deepEqual(violations, [])
  })

  /**
   * Actions que ESTABELECEM o contexto em vez de partir dele. Cada uma com o motivo;
   * a regra continua valendo para todas as outras.
   */
  const ESTABLISHES_CONTEXT: Record<string, string> = {
    "actions/team-selection.ts:selectTeam":
      "escolhe o time ativo (P23): confere o time pedido com teamContextFor (TeamAccess) antes de gravar o cookie",
  }

  test("toda Server Action monta o contexto de time; as de escrita exigem nível MANAGER (ou administração)", () => {
    const violations: string[] = []
    for (const file of files.filter((f) => rel(f).startsWith("actions/") && !rel(f).endsWith("auth.ts"))) {
      const source = readFileSync(file, "utf8")
      for (const m of source.matchAll(/export async function (\w+)\(/g)) {
        const open = source.indexOf("{", m.index! + m[0].length)
        const next = source.indexOf("\nexport ", open)
        const body = source.slice(open, next === -1 ? undefined : next)
        const key = `${rel(file)}:${m[1]}`
        if (key in ESTABLISHES_CONTEXT) {
          if (!body.includes("teamContextFor(")) violations.push(`${key}: estabelece o contexto sem conferir TeamAccess`)
          continue
        }
        if (!/requireTeamContext\(\)|requireWriteContext\(\)|requireAdminContext\(\)/.test(body)) violations.push(`${key} sem contexto de time`)
        if (body.includes("runAction(") && !/requireWriteContext\(\)|requireAdminContext\(\)/.test(body)) {
          violations.push(`${key} escreve sem requireWriteContext/requireAdminContext`)
        }
      }
    }
    assert.deepEqual(violations, [])
  })

  test("nenhuma query nem núcleo obtém o contexto por conta própria (recebe no 1º parâmetro)", () => {
    const violations: string[] = []
    for (const file of files.filter((f) => !rel(f).startsWith("actions/") && !rel(f).endsWith("scope.ts"))) {
      const source = readFileSync(file, "utf8")
      if (/requireTeamContext\(|requireWriteContext\(|requireUser\(|getCurrentUser\(/.test(source) && !/server\/(access|credentials)\.ts$/.test(rel(file))) {
        violations.push(`${rel(file)}: obtém a sessão/contexto sozinho`)
      }
    }
    assert.deepEqual(violations, [])
  })

  test("escopo e visibilidade são gates independentes: arquivos separados que não se chamam (D29)", () => {
    const scope = stripComments(readFileSync(join(SRC, "server", "scope.ts"), "utf8"))
    const visibility = stripComments(readFileSync(join(SRC, "server", "visibility.ts"), "utf8"))
    assert.ok(!/from "\.\/visibility(\.ts)?"/.test(scope), "scope.ts não importa visibility.ts")
    assert.ok(!/visibilityFilter\(|visibilitySql\(/.test(scope))
    assert.ok(!/teamScope\(|teamSql\(|teamContextFor\(/.test(visibility))
    // visibility.ts só usa o TIPO do contexto.
    for (const m of visibility.matchAll(/^import (.*) from "\.\/scope(\.ts)?"/gm)) assert.match(m[1]!, /^type /)
  })

  test("User.role não decide autorização: nenhum código de src/ lê `.role` de usuário", () => {
    const violations: string[] = []
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8")
      for (const m of source.matchAll(/\b(user|ctx|viewer|session\.user)\.role\b/g)) violations.push(`${rel(file)}: ${m[0]}`)
    }
    assert.deepEqual(violations, [])
  })
})

/* ══════════════════════ 1b. ESTRUTURAL: PORTAL DO COLABORADOR (D38, D40) ══════════════════════ */

/** Arquivos do portal: allowlist de imports e nenhum nome de modelo gerencial. */
const PORTAL_FILES = ["server/queries/member-portal.ts", "actions/member-portal.ts"]

/** Modelos que o portal nunca toca (D40) — nem em comentário. */
const PORTAL_FORBIDDEN_MODELS = [
  "Note", "OneOnOne", "Feedback", "WatchItem", "WatchReview", "TimelineEvent", "DevelopmentPlan", "DevelopmentAction",
  "MemberTrait", "MemberChange", "MemberCompetency", "Competency", "CompetencyExpectation", "MentorshipLink",
  "MetricResult", "ScoreResult", "ScoreResultComponent", "PriorityValidation", "DevReturn", "DailyParticipant",
  "AuditLog", "TeamAccess", "User",
]
/** Os mesmos modelos como acessor do Prisma (`db.note`) e as relações que os alcançariam por `select`. */
const PORTAL_FORBIDDEN_ACCESSORS = PORTAL_FORBIDDEN_MODELS.map((m) => m[0]!.toLowerCase() + m.slice(1))
const PORTAL_FORBIDDEN_KEYS = [
  "participants", "traits", "changes", "oneOnOnes", "feedbacks", "notes", "watchItems", "watchItem", "timelineEvents",
  "developmentPlans", "metricResults", "scoreResults", "priorityValidations", "devReturns", "competencies", "mentoring",
  "mentoredBy", "author", "user", "summary", "decisions", "managerSummary", "authorUserId", "replacesAgreementId",
]

describe("estrutural: portal do colaborador isolado (D38) — protege o futuro", () => {
  const present = PORTAL_FILES.filter((f) => {
    try {
      return statSync(join(SRC, f)).isFile()
    } catch {
      return false
    }
  })

  test("o arquivo de leituras do portal existe", () => assert.ok(present.includes("server/queries/member-portal.ts")))

  test("só importa db.ts, member-scope.ts, src/lib e os tipos do Prisma", () => {
    const violations: string[] = []
    for (const file of present) {
      const source = readFileSync(join(SRC, file), "utf8")
      for (const m of source.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
        const spec = (m[1] ?? m[2])!
        if (spec === "@prisma/client") continue
        const target = spec.startsWith("@/")
          ? spec.slice(2)
          : spec.startsWith(".")
            ? relative(SRC, resolve(dirname(join(SRC, file)), spec)).split(sep).join("/")
            : null
        const clean = target?.replace(/\.(ts|tsx)$/, "")
        const ok = clean === "server/db" || clean === "server/member-scope" || (clean?.startsWith("lib/") ?? false)
        if (!ok) violations.push(`${file}: importa "${spec}"`)
      }
    }
    assert.deepEqual(violations, [], "o portal não importa queries, actions, escopo nem timeline do gestor")
  })

  test("não menciona nenhum modelo proibido — nem em comentário", () => {
    const violations: string[] = []
    for (const file of present) {
      const source = readFileSync(join(SRC, file), "utf8")
      for (const name of PORTAL_FORBIDDEN_MODELS) if (new RegExp(`\\b${name}\\b`).test(source)) violations.push(`${file}: ${name}`)
      for (const name of PORTAL_FORBIDDEN_ACCESSORS) if (new RegExp(`\\.${name}\\b`).test(source)) violations.push(`${file}: .${name}`)
      for (const key of PORTAL_FORBIDDEN_KEYS) if (new RegExp(`\\b${key}\\s*:`).test(source)) violations.push(`${file}: ${key}:`)
      if (/\binclude\s*:/.test(source)) violations.push(`${file}: include (use select explícito)`)
      if (/requireMemberContext\(|requireTeamContext\(|getCurrentUser\(/.test(source)) violations.push(`${file}: obtém o contexto sozinho`)
    }
    assert.deepEqual(violations, [])
  })

  test("toda leitura de combinado no portal usa select explícito", () => {
    const source = readFileSync(join(SRC, "server/queries/member-portal.ts"), "utf8")
    for (const m of source.matchAll(/db\.agreement\.(\w+)\(/g)) {
      assert.match(callBody(source, (m.index ?? 0) + m[0].length - 1), /select:\s*\{/, `agreement.${m[1]} sem select`)
    }
  })
})

/* ══════════════════════════════ 2. BANCO ══════════════════════════════ */

const P = "iso_"
const MARK = "Zircônio"
const ORG = `${P}org`
const T1 = `${P}t1`
const T2 = `${P}t2`
const TEAMS = [T1, T2]
const USERS = { m1: `${P}m1`, m2: `${P}m2`, v: `${P}v`, admin: `${P}admin` }
const day = (offset: number) => {
  const d = todayBusinessDate()
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}

interface TeamFixture {
  teamId: string
  tag: "T1" | "T2"
  member: string
  agreement: string
  daily: string
  feedbackPrivate: string
  feedbackShared: string
  notePrivate: string
  watch: string
  plan: string
  central: string
  validation: string
  devReturn: string
  score: string
  /** Todos os ids criados para o time (o detector de vazamento procura todos). */
  ids: string[]
  /** Textos marcadores (o detector procura também por texto). */
  markers: string[]
  /** Marcadores de registros PRIVATE (VIEWER nunca pode receber). */
  privateMarkers: string[]
  events: { feedbackPrivate: string; feedbackShared: string }
}

async function cleanup() {
  const d = dbIncludingDeleted
  const inTeams = { teamId: { in: TEAMS } }
  await d.timelineEvent.deleteMany({ where: inTeams })
  await d.agreementTransfer.deleteMany({ where: inTeams })
  await d.memberVacation.deleteMany({ where: inTeams })
  await d.watchReview.deleteMany({ where: inTeams })
  await d.watchItem.deleteMany({ where: inTeams })
  await d.devReturn.deleteMany({ where: inTeams })
  await d.priorityValidation.deleteMany({ where: inTeams })
  await d.agreementCheckin.deleteMany({ where: inTeams })
  await d.agreementParticipant.deleteMany({ where: inTeams })
  await d.agreement.updateMany({ where: inTeams, data: { replacesAgreementId: null } })
  await d.agreement.deleteMany({ where: inTeams })
  await d.dailyParticipant.deleteMany({ where: inTeams })
  await d.daily.deleteMany({ where: inTeams })
  await d.feedback.deleteMany({ where: inTeams })
  await d.oneOnOne.deleteMany({ where: inTeams })
  await d.note.deleteMany({ where: inTeams })
  await d.developmentAction.deleteMany({ where: inTeams })
  await d.developmentPlan.deleteMany({ where: inTeams })
  await d.mentorshipLink.deleteMany({ where: inTeams })
  await d.memberChange.deleteMany({ where: inTeams })
  await d.memberTrait.deleteMany({ where: inTeams })
  await d.memberResponsibility.deleteMany({ where: inTeams })
  await d.memberCompetency.deleteMany({ where: inTeams })
  await d.teamMember.deleteMany({ where: inTeams })
  await d.scoreComponent.deleteMany({ where: inTeams })
  await d.scoreDefinition.deleteMany({ where: inTeams })
  await d.metricDefinition.deleteMany({ where: inTeams })
  await d.competencyExpectation.deleteMany({ where: inTeams })
  await d.competency.deleteMany({ where: inTeams })
  await d.seniority.deleteMany({ where: inTeams })
  await d.responsibility.deleteMany({ where: inTeams })
  await d.priorityLevel.deleteMany({ where: inTeams })
  await d.reclassificationReason.deleteMany({ where: inTeams })
  await d.devReturnReason.deleteMany({ where: inTeams })
  await d.central.deleteMany({ where: inTeams })
  await d.blockerReason.deleteMany({ where: inTeams })
  await d.ticketUrlPattern.deleteMany({ where: inTeams })
  await d.alertThreshold.deleteMany({ where: inTeams })
  await d.auditLog.deleteMany({ where: { OR: [inTeams, { organizationId: ORG }] } })
  await d.teamModule.deleteMany({ where: inTeams })
  await d.teamAccess.deleteMany({ where: inTeams })
  await d.team.deleteMany({ where: { id: { in: TEAMS } } })
  await d.user.deleteMany({ where: { id: { in: Object.values(USERS) } } })
  await d.organization.deleteMany({ where: { id: ORG } })
}

async function buildTeam(teamId: string, tag: "T1" | "T2", author: string): Promise<TeamFixture> {
  const d = dbIncludingDeleted
  const id = (name: string) => `${P}${name}_${tag}`
  const text = (what: string) => `${what} ${MARK} ${tag}`
  const base = { teamId, organizationId: ORG }
  await d.seniority.create({ data: { ...base, id: id("sen"), key: "JUNIOR", label: "Júnior", order: 1 } })
  await d.teamMember.create({
    data: { teamId, id: id("mem"), fullName: text("Pessoa"), preferredName: text("Pessoa"), position: "Analista", seniorityId: id("sen"), joinedAt: day(-400), avatarSeed: tag },
  })
  const member = id("mem")
  await d.central.create({ data: { ...base, id: id("central"), name: text("Central"), slug: "central-zirconio" } })
  await d.blockerReason.create({ data: { ...base, id: id("br"), label: text("Motivo"), category: "EXTERNAL", order: 1 } })
  await d.ticketUrlPattern.create({ data: { ...base, id: id("tp"), label: text("Padrão"), regex: "/t/(\\d+)", order: 1 } })
  await d.priorityLevel.create({ data: { ...base, id: id("pl_low"), key: "BAIXA", label: text("Baixa"), rank: 1 } })
  await d.priorityLevel.create({ data: { ...base, id: id("pl_high"), key: "ALTA", label: text("Alta"), rank: 2 } })
  await d.reclassificationReason.create({ data: { ...base, id: id("rr"), label: text("Reclassificação"), order: 1 } })
  await d.devReturnReason.create({ data: { ...base, id: id("drr"), label: text("Devolução"), category: "ANALYST", order: 1 } })
  await d.competency.create({ data: { ...base, id: id("cp"), name: text("Competência") } })
  await d.responsibility.create({ data: { ...base, id: id("rs"), name: text("Responsabilidade") } })
  await d.metricDefinition.create({ data: { ...base, id: id("md"), key: "csat", label: text("CSAT"), direction: "HIGHER_IS_BETTER" } })
  await d.scoreDefinition.create({ data: { ...base, id: id("sd"), name: text("Score"), version: 1 } })
  await d.alertThreshold.create({ data: { ...base, key: "dueSoonDays", value: 5 } })

  const agreement = await d.agreement.create({
    // Vencido há 10 dias: vira alerta — se vazar para o outro time, aparece.
    data: { teamId, id: id("ag"), memberId: member, title: text("Combinado"), origin: "MANAGER", originalDueDate: day(-10), dueDate: day(-10), authorUserId: author, centralId: id("central") },
  })
  const daily = await d.daily.create({ data: { teamId, id: id("daily"), date: day(-1), summary: text("Resumo da daily"), authorUserId: author } })
  await d.dailyParticipant.create({ data: { teamId, dailyId: daily.id, memberId: member, present: true, note: text("Nota da daily") } })
  const fbPrivate = await d.feedback.create({
    data: { teamId, id: id("fbp"), memberId: member, date: day(-2), category: "BEHAVIOR", behavior: text("Feedback privado"), visibility: "PRIVATE", authorUserId: author, followUpAt: day(-1) },
  })
  const fbShared = await d.feedback.create({
    data: { teamId, id: id("fbs"), memberId: member, date: day(-3), category: "RECOGNITION", behavior: text("Feedback compartilhado"), visibility: "SHARED", authorUserId: author },
  })
  const note = await d.note.create({
    data: { teamId, id: id("note"), memberId: member, occurredAt: new Date(), title: text("Anotação privada"), body: text("Corpo privado"), visibility: "PRIVATE", authorUserId: author },
  })
  await d.watchItem.create({
    data: {
      ...base, id: id("watch"), title: text("Observação privada"), heat: "HIGH", origin: "MANUAL", visibility: "PRIVATE", memberId: member, agreementId: agreement.id,
      createdByUserId: author, lastReviewedAt: day(-20), heatChangedAt: day(-40),
    },
  })
  await d.developmentPlan.create({
    data: { teamId, id: id("pdi"), memberId: member, currentSituation: text("Situação"), objective: text("Objetivo"), status: "ACTIVE", startedAt: day(-90) },
  })
  await d.priorityValidation.create({
    data: {
      ...base, id: id("pv"), ticketUrl: "https://helpdesk/t/1", ticketRef: "ISO-1", memberId: member, analystPriorityId: id("pl_low"), supervisorPriorityId: id("pl_high"),
      analystRankSnapshot: 1, supervisorRankSnapshot: 2, outcome: "RAISED", reasonId: id("rr"), validatedAt: new Date(), validatedByUserId: author, centralId: id("central"),
    },
  })
  await d.devReturn.create({
    data: { ...base, id: id("dr"), ticketUrl: "https://helpdesk/t/1", ticketRef: "ISO-1", memberId: member, returnedAt: day(-20), reasonId: id("drr"), registeredByUserId: author, priorityValidationId: id("pv") },
  })
  await recordTimelineEvents(d, { teamId }, [
    timelineEventFor.feedback(fbPrivate),
    timelineEventFor.feedback(fbShared),
    timelineEventFor.note(note),
    timelineEventFor.agreementCreated(agreement),
  ])
  const events = await d.timelineEvent.findMany({ where: { teamId }, select: { id: true, feedbackId: true } })
  const ids = [
    member, agreement.id, daily.id, fbPrivate.id, fbShared.id, note.id, id("watch"), id("pdi"), id("central"), id("pv"), id("dr"), id("sd"),
    id("sen"), id("br"), id("tp"), id("pl_low"), id("pl_high"), id("rr"), id("drr"), id("cp"), id("rs"), id("md"), ...events.map((e) => e.id),
  ]
  return {
    teamId, tag, member, agreement: agreement.id, daily: daily.id, feedbackPrivate: fbPrivate.id, feedbackShared: fbShared.id, notePrivate: note.id,
    watch: id("watch"), plan: id("pdi"), central: id("central"), validation: id("pv"), devReturn: id("dr"), score: id("sd"),
    ids,
    markers: [`${MARK} ${tag}`],
    privateMarkers: [text("Feedback privado"), text("Anotação privada"), text("Corpo privado"), text("Observação privada")],
    events: {
      feedbackPrivate: events.find((e) => e.feedbackId === fbPrivate.id)!.id,
      feedbackShared: events.find((e) => e.feedbackId === fbShared.id)!.id,
    },
  }
}

/** Serialização que entende Map e Set (agregados devolvem Map). */
function dump(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v instanceof Map ? [...v.entries()] : v instanceof Set ? [...v] : v))
}

function assertNoLeak(label: string, value: unknown, other: TeamFixture) {
  const text = dump(value) ?? ""
  for (const id of other.ids) assert.ok(!text.includes(id), `${label}: vazou id de ${other.tag} (${id})`)
  for (const marker of other.markers) assert.ok(!text.includes(marker), `${label}: vazou texto de ${other.tag}`)
}

function assertNoPrivate(label: string, value: unknown, own: TeamFixture) {
  const text = dump(value) ?? ""
  for (const marker of own.privateMarkers) assert.ok(!text.includes(marker), `${label}: VIEWER recebeu PRIVATE ("${marker}")`)
  for (const id of [own.feedbackPrivate, own.notePrivate, own.watch, own.events.feedbackPrivate]) {
    assert.ok(!text.includes(id), `${label}: VIEWER recebeu id de registro PRIVATE (${id})`)
  }
}

type Invoke = (ctx: TeamContext, own: TeamFixture, other: TeamFixture) => Promise<unknown>

const from = () => day(-60)
const to = () => day(0)

/**
 * TODA função exportada de src/server/queries com dado de time, chamada com o
 * contexto e — onde aceita id — também com ids do OUTRO time, de propósito.
 */
const QUERIES: Record<string, Invoke> = {
  // adherence.ts
  getAdherence: (c) => adherence.getAdherence(c, null, from(), to()),
  getAdherenceSeries: (c) => adherence.getAdherenceSeries(c, null, 3),
  getAdherenceTrend: (c, own) => adherence.getAdherenceTrend(c, own.member),
  getBlockerBreakdown: (c) => adherence.getBlockerBreakdown(c, null, from(), to()),
  getTeamAdherence: (c) => adherence.getTeamAdherence(c, from(), to()),
  getAgreementTitles: (c, own, other) => adherence.getAgreementTitles(c, [own.agreement, other.agreement]),
  getMemberAdherenceProfile: (c, own) => adherence.getMemberAdherenceProfile(c, own.member),
  // agreements.ts
  listAgreements: (c) => agreements.listAgreements(c, parseAgreementFilters(new URLSearchParams("view=all"))),
  listAgreementMembers: (c) => agreements.listAgreementMembers(c),
  getAgreementDetail: async (c, own, other) => [await agreements.getAgreementDetail(c, own.agreement), await agreements.getAgreementDetail(c, other.agreement)],
  // alerts.ts
  getAlertFacts: async (c) => alertsQ.getAlertFacts(c, todayBusinessDate(), await thresholds.getThresholds(c)),
  // centrals.ts
  listActiveCentrals: (c) => centrals.listActiveCentrals(c),
  listCentralsForFilter: (c) => centrals.listCentralsForFilter(c),
  volumeByCentral: (c) => centrals.volumeByCentral(c, from(), to()),
  centralsInDailies: (c) => centrals.centralsInDailies(c, from(), to()),
  centralByMember: (c) => centrals.centralByMember(c, from(), to()),
  priorityDisputeByCentral: (c) => centrals.priorityDisputeByCentral(c, from(), to()),
  centralMetrics: (c) => centrals.centralMetrics(c, from(), to()),
  // dailies.ts
  teamFor: (c) => dailies.teamFor(c),
  getDailyForm: (c) => dailies.getDailyForm(c),
  getDailyDetail: async (c, own, other) => [await dailies.getDailyDetail(c, own.daily), await dailies.getDailyDetail(c, other.daily)],
  listDailies: (c) => dailies.listDailies(c),
  // dev-returns.ts
  getDevReturnFormData: (c) => devReturns.getDevReturnFormData(c),
  getTicketContext: (c) => devReturns.getTicketContext(c, "ISO-1"),
  getDevReturns: (c) => devReturns.getDevReturns(c, null, from(), to()),
  getDevReturnSeries: (c) => devReturns.getDevReturnSeries(c, null, 3),
  getReasonBreakdown: (c) => devReturns.getReasonBreakdown(c, null, from(), to()),
  getTeamDevReturns: (c) => devReturns.getTeamDevReturns(c, from(), to()),
  getReturnOverlap: (c) => devReturns.getReturnOverlap(c, from(), to()),
  listDevReturns: (c) => devReturns.listDevReturns(c, parseDevReturnFilters({ period: "custom", from: "01-01-2000", to: "31-12-2099" })),
  getMemberDevReturnProfile: (c, own) => devReturns.getMemberDevReturnProfile(c, own.member),
  // development.ts
  getMemberDevelopment: async (c, own, other) => [await development.getMemberDevelopment(c, own.member), await development.getMemberDevelopment(c, other.member)],
  getDevelopmentOverview: (c) => development.getDevelopmentOverview(c),
  getReadinessRows: (c) => development.getReadinessRows(c),
  getExpectationMatrix: (c) => development.getExpectationMatrix(c),
  // members.ts
  listTeamMembers: (c) => members.listTeamMembers(c),
  getMemberFormCatalogs: (c) => members.getMemberFormCatalogs(c),
  getMemberForEdit: async (c, own, other) => [await members.getMemberForEdit(c, own.member), await members.getMemberForEdit(c, other.member)],
  listMembersForEdit: (c, own, other) => members.listMembersForEdit(c, [own.member, other.member]),
  // priority-validations.ts
  getValidationFormData: (c) => validations.getValidationFormData(c),
  listValidations: (c) => validations.listValidations(c, parseValidationFilters({ period: "custom", from: "01-01-2000", to: "31-12-2099" })),
  summaryByPeriod: (c) => validations.summaryByPeriod(c, from(), to()),
  summaryByMember: (c) => validations.summaryByMember(c, from(), to()),
  summaryByReason: (c) => validations.summaryByReason(c, from(), to()),
  summaryByPriorityTransition: (c) => validations.summaryByPriorityTransition(c, from(), to()),
  memberValidationSummary: (c, own) => validations.memberValidationSummary(c, own.member),
  // profile.ts
  getMemberProfile: async (c, own, other) => [await profile.getMemberProfile(c, own.member), await profile.getMemberProfile(c, other.member)],
  getMemberOverview: async (c, own, other) => [await profile.getMemberOverview(c, own.member), await profile.getMemberOverview(c, other.member)],
  // records.ts
  getMemberTimeline: async (c, own, other) => [await records.getMemberTimeline(c, own.member), await records.getMemberTimeline(c, other.member)],
  searchRecords: (c) => records.searchRecords(c, MARK, 100),
  countRecordsByMember: (c) => records.countRecordsByMember(c),
  listOneOnOnes: async (c, own, other) => [await records.listOneOnOnes(c, own.member), await records.listOneOnOnes(c, other.member)],
  listFeedbacks: async (c, own, other) => [await records.listFeedbacks(c, own.member), await records.listFeedbacks(c, other.member)],
  listNotes: async (c, own, other) => [await records.listNotes(c, own.member), await records.listNotes(c, other.member)],
  findToggleableSource: async (c, own, other) => [
    await records.findToggleableSource(c, own.events.feedbackShared),
    await records.findToggleableSource(c, other.events.feedbackShared),
  ],
  findEditableRecord: async (c, own, other) => [
    await records.findEditableRecord(c, "feedback", own.feedbackShared),
    await records.findEditableRecord(c, "feedback", other.feedbackShared),
    await records.findEditableRecord(c, "note", other.notePrivate),
  ],
  listRecords: (c) => records.listRecords(c, parseRecordFilters({ period: "all" })),
  getOneOnOneContext: async (c, own, other) => [await records.getOneOnOneContext(c, own.member), await records.getOneOnOneContext(c, other.member)],
  // score.ts
  listScoreDefinitions: (c) => score.listScoreDefinitions(c),
  getScoreDefinition: async (c, own, other) => [await score.getScoreDefinition(c, own.score), await score.getScoreDefinition(c, other.score)],
  // search.ts
  searchAll: (c) => search.searchAll(c, MARK, { limit: 50 }),
  recentAgreements: (c) => search.recentAgreements(c, 50),
  // settings.ts
  catalogUsage: (c, own, other) => settings.catalogUsage(c, "central", [own.central, other.central]),
  listPriorityLevels: (c) => settings.listPriorityLevels(c),
  listReclassificationReasons: (c) => settings.listReclassificationReasons(c),
  listBlockerReasons: (c) => settings.listBlockerReasons(c),
  listTicketPatterns: (c) => settings.listTicketPatterns(c),
  listCompetencies: (c) => settings.listCompetencies(c),
  listMetrics: (c) => settings.listMetrics(c),
  listCentralSettings: (c) => settings.listCentralSettings(c),
  listDevReturnReasons: (c) => settings.listDevReturnReasons(c),
  // thresholds.ts
  getThresholds: (c) => thresholds.getThresholds(c),
  listThresholdSettings: (c) => thresholds.listThresholdSettings(c),
  // timeline.ts
  getTimelinePage: async (c, own, other) => [
    await timeline.getTimelinePage(c, own.member, parseTimelineFilters(new URLSearchParams())),
    await timeline.getTimelinePage(c, other.member, parseTimelineFilters(new URLSearchParams())),
  ],
  // today.ts
  getTodayPanel: (c) => today.getTodayPanel(c, todayBusinessDate()),
  // watch.ts
  findWatchForWrite: async (c, own, other) => [await watch.findWatchForWrite(c, own.watch), await watch.findWatchForWrite(c, other.watch)],
  findActiveWatchForLink: async (c, own, other) => [
    await watch.findActiveWatchForLink(c, { agreementId: own.agreement }),
    await watch.findActiveWatchForLink(c, { agreementId: other.agreement }),
  ],
  resolveWatchLinks: async (c, own, other) => [
    await watch.resolveWatchLinks(c, { memberId: own.member, centralId: "", agreementId: "", dailyId: "", priorityValidationId: "", devReturnId: "", oneOnOneId: "", feedbackId: "" }),
    await watch.resolveWatchLinks(c, { memberId: other.member, centralId: "", agreementId: other.agreement, dailyId: "", priorityValidationId: "", devReturnId: "", oneOnOneId: "", feedbackId: "" }),
  ],
  listWatchItems: async (c) => watch.listWatchItems(c, parseWatchFilters({ tab: "all" }), await thresholds.getThresholds(c)),
  getWatchItem: async (c, own, other) => {
    const t = await thresholds.getThresholds(c)
    return [await watch.getWatchItem(c, own.watch, t), await watch.getWatchItem(c, other.watch, t)]
  },
  activeWatchByLink: (c, own, other) => watch.activeWatchByLink(c, "agreementId", [own.agreement, other.agreement]),
  memberWatchItems: async (c, own, other) => {
    const t = await thresholds.getThresholds(c)
    return [await watch.memberWatchItems(c, own.member, t), await watch.memberWatchItems(c, other.member, t)]
  },
  watchFilterOptions: (c) => watch.watchFilterOptions(c),
  activeWatchForReport: async (c) => watch.activeWatchForReport(c, await thresholds.getThresholds(c)),
  // vacations.ts (C4) — inclusive pedindo a pessoa do outro time.
  listMemberVacations: async (c, own, other) => [...(await vacations.listMemberVacations(c, own.member)), ...(await vacations.listMemberVacations(c, other.member))],
}

/** Exportações de src/server/queries que NÃO leem dado de time (puras). Cada uma com o motivo. */
const PURE_QUERY_EXPORTS: Record<string, string> = {
  summarize: "conta resultados recebidos em memória; não lê o banco",
}

/**
 * Exportações de src/server/queries que olham VÁRIOS times de propósito, só para
 * `isPlatformAdmin`, e devolvem dado de plataforma (nome, módulos, acesso), nunca
 * registro de time. Cobertas pelo teste "administração de times" abaixo.
 */
const PLATFORM_QUERY_EXPORTS: Record<string, string> = {
  listTeamsForAdmin: "/settings/team (P23): times, módulos e acessos da organização, mais a contagem de pessoas",
}

/** Todo núcleo de escrita (`*Record`), chamado por um VIEWER. */
const WRITES: Record<string, (ctx: TeamContext, own: TeamFixture) => Promise<unknown>> = {
  createAgreementRecord: (c, o) => createAgreementRecord(c, { memberId: o.member, title: "x", dueDate: "01/01/2030" }),
  completeAgreementRecord: (c, o) => completeAgreementRecord(c, { id: o.agreement, outcome: "" }),
  updateAgreementRecord: (c, o) => updateAgreementRecord(c, { id: o.agreement, title: "x" }),
  cancelAgreementRecord: (c, o) => cancelAgreementRecord(c, { id: o.agreement, reason: "x" }),
  transferAgreementRecord: (c, o) => transferAgreementRecord(c, { id: o.agreement, memberId: o.member, reason: "férias" }),
  updateWatchItemRecord: (c, o) => updateWatchItemRecord(c, { id: o.watch, title: "x" }),
  createVacationRecord: (c, o) => createVacationRecord(c, { memberId: o.member, startDate: "01/01/2030", endDate: "05/01/2030" }),
  cancelVacationRecord: (c) => cancelVacationRecord(c, { id: "qualquer" }),
  ensureCentralRecord: (c) => ensureCentralRecord(c, { name: "x" }),
  importCentralsRecord: (c) => importCentralsRecord(c, { text: "x" }),
  createDailyRecord: (c) => createDailyRecord(c, {}),
  updateDailyRecord: (c, o) => updateDailyRecord(c, { id: o.daily }),
  createDevReturnRecord: (c) => createDevReturnRecord(c, {}),
  updateDevReturnRecord: (c, o) => updateDevReturnRecord(c, { id: o.devReturn }),
  resolveDevReturnRecord: (c, o) => resolveDevReturnRecord(c, { id: o.devReturn }),
  deleteDevReturnRecord: (c, o) => deleteDevReturnRecord(c, { id: o.devReturn }),
  createPlanRecord: (c) => createPlanRecord(c, {}),
  reviewPlanRecord: (c, o) => reviewPlanRecord(c, { planId: o.plan, note: "x" }),
  setPlanStatusRecord: (c, o) => setPlanStatusRecord(c, { planId: o.plan, status: "PAUSED" }),
  setActionStatusRecord: (c) => setActionStatusRecord(c, {}),
  createTraitRecord: (c) => createTraitRecord(c, {}),
  archiveTraitRecord: (c) => archiveTraitRecord(c, {}),
  setExpectationRecord: (c) => setExpectationRecord(c, {}),
  updatePlanRecord: (c, o) => updatePlanRecord(c, { planId: o.plan }),
  addPlanActionRecord: (c, o) => addPlanActionRecord(c, { planId: o.plan }),
  createMentorshipRecord: (c) => createMentorshipRecord(c, {}),
  endMentorshipRecord: (c) => endMentorshipRecord(c, {}),
  createMemberRecord: (c) => createMemberRecord(c, {}),
  updateMemberRecord: (c, o) => updateMemberRecord(c, { id: o.member }),
  deactivateMemberRecord: (c, o) => deactivateMemberRecord(c, { id: o.member, reason: "x" }),
  reactivateMemberRecord: (c, o) => reactivateMemberRecord(c, { id: o.member, reason: "x" }),
  updateManagerSummaryRecord: (c, o) => updateManagerSummaryRecord(c, { id: o.member, summary: "x" }),
  createValidationRecord: (c) => createValidationRecord(c, {}),
  updateValidationRecord: (c, o) => updateValidationRecord(c, { id: o.validation }),
  deleteValidationRecord: (c, o) => deleteValidationRecord(c, { id: o.validation }),
  createOneOnOneRecord: (c, o) => createOneOnOneRecord(c, { memberId: o.member }),
  createFeedbackRecord: (c, o) => createFeedbackRecord(c, { memberId: o.member }),
  createNoteRecord: (c, o) => createNoteRecord(c, { memberId: o.member }),
  setRecordVisibilityRecord: (c, o) => setRecordVisibilityRecord(c, { eventId: o.events.feedbackShared, visibility: "PRIVATE" }),
  updateOneOnOneRecord: (c) => updateOneOnOneRecord(c, "x", {}),
  updateFeedbackRecord: (c, o) => updateFeedbackRecord(c, o.feedbackShared, {}),
  updateNoteRecord: (c, o) => updateNoteRecord(c, o.notePrivate, {}),
  deleteRecordRecord: (c, o) => deleteRecordRecord(c, { kind: "feedback", id: o.feedbackShared }),
  createScoreDefinitionRecord: (c) => createScoreDefinitionRecord(c, { name: "x" }),
  newScoreVersionRecord: (c, o) => newScoreVersionRecord(c, { scoreDefinitionId: o.score }),
  updateScoreNotesRecord: (c, o) => updateScoreNotesRecord(c, { scoreDefinitionId: o.score, notes: "x" }),
  setScoreComponentRecord: (c, o) => setScoreComponentRecord(c, { scoreDefinitionId: o.score }),
  removeScoreComponentRecord: (c, o) => removeScoreComponentRecord(c, { scoreDefinitionId: o.score }),
  setScoreActiveRecord: (c, o) => setScoreActiveRecord(c, { scoreDefinitionId: o.score, active: true }),
  deleteScoreDefinitionRecord: (c, o) => deleteScoreDefinitionRecord(c, { scoreDefinitionId: o.score }),
  saveCatalogItemRecord: (c) => saveCatalogItemRecord(c, "blockerReason", { label: "x", category: "EXTERNAL" }),
  moveCatalogItemRecord: (c, o) => moveCatalogItemRecord(c, { kind: "blockerReason", id: o.central, direction: "up" }),
  setCatalogItemActiveRecord: (c, o) => setCatalogItemActiveRecord(c, { kind: "central", id: o.central, active: false }),
  deleteCatalogItemRecord: (c, o) => deleteCatalogItemRecord(c, { kind: "central", id: o.central }),
  setThresholdRecord: (c) => setThresholdRecord(c, { key: "dueSoonDays", value: 6 }),
  createWatchItemRecord: (c, o) => createWatchItemRecord(c, { title: "x", heat: "LOW", origin: "MANUAL", memberId: o.member }),
  reviewWatchItemRecord: (c, o) => reviewWatchItemRecord(c, { id: o.watch, note: "revisada" }),
  changeWatchHeatRecord: (c, o) => changeWatchHeatRecord(c, { id: o.watch, direction: "down" }),
  resolveWatchItemRecord: (c, o) => resolveWatchItemRecord(c, { id: o.watch, note: "resolvida" }),
  archiveWatchItemRecord: (c, o) => archiveWatchItemRecord(c, { id: o.watch }),
  setWatchVisibilityRecord: (c, o) => setWatchVisibilityRecord(c, { id: o.watch, visibility: "SHARED" }),
  // Administração (P23): o VIEWER também não é administrador da plataforma.
  setTeamModuleRecord: (c) => setTeamModuleRecord(c, { teamId: T1, moduleKey: MODULES.CENTRALS, enabled: false }),
  grantTeamAccessRecord: (c) => grantTeamAccessRecord(c, { teamId: T1, userId: USERS.m2, level: "VIEWER" }),
  revokeTeamAccessRecord: (c) => revokeTeamAccessRecord(c, { teamId: T1, userId: USERS.m1 }),
}

describe("banco: dois times isolados (T1, T2) — critério de aceite do P22", async () => {
  let t1: TeamFixture
  let t2: TeamFixture
  let m1: TeamContext
  let m2: TeamContext
  let v1: TeamContext

  before(async () => {
    await cleanup()
    const d = dbIncludingDeleted
    await d.organization.create({ data: { id: ORG, name: "Isolamento (teste)", slug: "iso-org" } })
    for (const [key, uid] of Object.entries(USERS)) {
      await d.user.create({
        data: { id: uid, email: `${uid}@teste.local`, name: `Usuário ${key}`, role: key === "v" ? "VIEWER" : "MANAGER", isPlatformAdmin: key === "admin", organizationId: ORG },
      })
    }
    for (const [teamId, slug] of [[T1, "iso-t1"], [T2, "iso-t2"]] as const) {
      await d.team.create({ data: { id: teamId, organizationId: ORG, name: slug, slug, managerUserId: USERS.m1 } })
      await d.teamModule.createMany({ data: MODULE_KEYS.map((moduleKey) => ({ teamId, moduleKey })) })
    }
    await d.teamAccess.createMany({
      data: [
        { userId: USERS.m1, teamId: T1, level: "MANAGER" },
        { userId: USERS.m2, teamId: T2, level: "MANAGER" },
        { userId: USERS.v, teamId: T1, level: "VIEWER" },
        { userId: USERS.v, teamId: T2, level: "VIEWER" },
      ],
    })
    t1 = await buildTeam(T1, "T1", USERS.m1)
    t2 = await buildTeam(T2, "T2", USERS.m2)
    m1 = await teamContextFor(USERS.m1, T1)
    m2 = await teamContextFor(USERS.m2, T2)
    v1 = await teamContextFor(USERS.v, T1)
  })

  after(async () => {
    await cleanup()
    await db.$disconnect()
    await dbIncludingDeleted.$disconnect()
  })

  test("meta: toda função exportada de src/server/queries está na tabela (ou é pura, com motivo)", () => {
    const exported = sourceFiles(join(SRC, "server", "queries")).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]!),
    )
    const missing = exported.filter((name) => !(name in QUERIES) && !(name in PURE_QUERY_EXPORTS) && !(name in PLATFORM_QUERY_EXPORTS))
    assert.deepEqual(missing, [], "função de query sem cobertura de isolamento")
  })

  test("meta: todo núcleo de escrita (*Record) está na tabela de escrita", () => {
    const exported = sourceFiles(join(SRC, "server"))
      .filter((f) => /^server\/[^/]+\.ts$/.test(rel(f)))
      .flatMap((file) => [...readFileSync(file, "utf8").matchAll(/^export async function (\w+Record)\(/gm)].map((m) => m[1]!))
    assert.deepEqual(exported.filter((name) => !(name in WRITES)), [])
  })

  test("1. M1 em T1 não recebe NADA de T2 — em nenhuma função, campo, agregado ou contagem", async () => {
    for (const [name, run] of Object.entries(QUERIES)) assertNoLeak(name, await run(m1, t1, t2), t2)
    // E o simétrico: M2 em T2 não recebe nada de T1.
    for (const [name, run] of Object.entries(QUERIES)) assertNoLeak(`${name} (T2)`, await run(m2, t2, t1), t1)
  })

  test("1b. contagens e agregados são só do time (não basta não mostrar o id)", async () => {
    const list = await agreements.listAgreements(m1, parseAgreementFilters(new URLSearchParams("view=all")))
    assert.equal(list.counts.all, 1)
    const counts = await records.countRecordsByMember(m1)
    assert.deepEqual([...counts.keys()], [t1.member])
    assert.equal(counts.get(t1.member), await dbIncludingDeleted.timelineEvent.count({ where: { teamId: T1 } }))
    assert.equal((await today.getTodayPanel(m1, todayBusinessDate())).total, 1)
    assert.equal((await validations.summaryByPeriod(m1, from(), to())).total, 1)
    assert.equal((await devReturns.getTicketContext(m1, "ISO-1")).previousReturns, 1)
    assert.equal((await settings.catalogUsage(m1, "central", [t1.central, t2.central])).has(t2.central), false)
  })

  test("1c. escrita com contexto de T1 apontando registro de T2 não toca T2", async () => {
    const before = await dbIncludingDeleted.agreement.findUniqueOrThrow({ where: { id: t2.agreement } })
    const results = [
      await completeAgreementRecord(m1, { id: t2.agreement, outcome: "" }),
      await cancelAgreementRecord(m1, { id: t2.agreement, reason: "tentativa" }),
      await updateAgreementRecord(m1, { id: t2.agreement, title: "invadido", description: "", priority: "HIGH" }),
      // Com nota válida: a recusa tem que vir do escopo, não da validação.
      await reviewWatchItemRecord(m1, { id: t2.watch, note: "tentativa de outro time" }),
      await setRecordVisibilityRecord(m1, { eventId: t2.events.feedbackPrivate, visibility: "SHARED" }),
      await deleteRecordRecord(m1, { kind: "feedback", id: t2.feedbackShared }),
      await resolveDevReturnRecord(m1, { id: t2.devReturn, resolvedAt: "01/01/2026", resolutionNote: "" }),
      await deleteValidationRecord(m1, { id: t2.validation }),
      // C7: combinado do próprio time ligado a observação do outro.
      await createAgreementRecord(m1, { memberId: t1.member, title: "invasão por observação", dueDate: "01/01/2030", priority: "NORMAL", origin: "MANAGER", watchItemId: t2.watch }),
    ]
    assert.ok(results.every((r) => !(r as { ok: boolean }).ok), "toda escrita cruzada é recusada")
    const after = await dbIncludingDeleted.agreement.findUniqueOrThrow({ where: { id: t2.agreement } })
    assert.deepEqual(after, before)
    const watchT2 = await dbIncludingDeleted.watchItem.findUniqueOrThrow({ where: { id: t2.watch } })
    assert.equal(watchT2.reviewCount, 0)
    assert.equal((await dbIncludingDeleted.feedback.findUniqueOrThrow({ where: { id: t2.feedbackPrivate } })).visibility, "PRIVATE")
    assert.equal((await dbIncludingDeleted.feedback.findUniqueOrThrow({ where: { id: t2.feedbackShared } })).deletedAt, null)
    assert.equal((await dbIncludingDeleted.priorityValidation.findUniqueOrThrow({ where: { id: t2.validation } })).deletedAt, null)
    assert.equal((await dbIncludingDeleted.devReturn.findUniqueOrThrow({ where: { id: t2.devReturn } })).resolvedAt, null)
  })

  test("2. M1 montando contexto de T2 recebe ERRO, não lista vazia", async () => {
    await assert.rejects(teamContextFor(USERS.m1, T2), { name: "TeamAccessError" })
    // Administrador de plataforma sem TeamAccess também não vê time nenhum.
    await assert.rejects(teamContextFor(USERS.admin, T1), { name: "TeamAccessError" })
    // Acesso revogado deixa de valer na hora (a linha fica: é registro).
    await dbIncludingDeleted.teamAccess.update({ where: { userId_teamId: { userId: USERS.v, teamId: T2 } }, data: { revokedAt: new Date() } })
    await assert.rejects(teamContextFor(USERS.v, T2), { name: "TeamAccessError" })
    assert.equal(await dbIncludingDeleted.teamAccess.count({ where: { userId: USERS.v, teamId: T2 } }), 1)
    await dbIncludingDeleted.teamAccess.update({ where: { userId_teamId: { userId: USERS.v, teamId: T2 } }, data: { revokedAt: null } })
    // Time desativado: ninguém entra.
    await dbIncludingDeleted.team.update({ where: { id: T2 }, data: { isActive: false } })
    await assert.rejects(teamContextFor(USERS.m2, T2), { name: "TeamAccessError" })
    await dbIncludingDeleted.team.update({ where: { id: T2 }, data: { isActive: true } })
  })

  test("3. V em T1 não recebe nenhum registro PRIVATE de T1 (nem nada de T2)", async () => {
    for (const [name, run] of Object.entries(QUERIES)) {
      const result = await run(v1, t1, t2)
      assertNoPrivate(name, result, t1)
      assertNoLeak(name, result, t2)
    }
    // E o MANAGER vê os privados do próprio time (a regra não está só escondendo tudo).
    const own = await records.listFeedbacks(m1, t1.member)
    assert.ok(own.some((f) => f.visibility === "PRIVATE"))
  })

  test("4. V tentando qualquer escrita recebe erro", async () => {
    for (const [name, run] of Object.entries(WRITES)) {
      await assert.rejects(run(v1, t1), { name: "ForbiddenError" }, `${name} aceitou escrita de VIEWER`)
    }
  })

  test("5. busca global com contexto de T1 não retorna nada de T2, com termo que casa nos dois", async () => {
    const results = await search.searchAll(m1, MARK, { limit: 50 })
    assert.ok(results.groups.length > 0, "o termo precisa casar em T1 (senão o teste não prova nada)")
    assertNoLeak("searchAll", results, t2)
    const t2Results = await search.searchAll(m2, MARK, { limit: 50 })
    assert.ok(t2Results.groups.length > 0)
    assertNoLeak("searchAll (T2)", t2Results, t1)
  })

  test("6. getAlerts com contexto de T1 não conta nada de T2", async () => {
    const result = await getAlerts(m1)
    assertNoLeak("getAlerts", result, t2)
    assert.ok(result.alerts.some((a) => a.member?.id === t1.member), "T1 tem alerta (combinado vencido)")
    assert.equal(result.watch?.active, 1)
    assert.equal(result.watch?.high, 1)
  })

  test("7. módulo desligado em T2: query e escrita lançam para M2; o dado continua no banco", async () => {
    await dbIncludingDeleted.teamModule.updateMany({ where: { teamId: T2 }, data: { isEnabled: false } })
    try {
      const ctx = await teamContextFor(USERS.m2, T2)
      assert.equal(ctx.modules.size, 0)
      await assert.rejects(devReturns.listDevReturns(ctx, parseDevReturnFilters({})), { name: "ModuleDisabledError" })
      await assert.rejects(createDevReturnRecord(ctx, {}), { name: "ModuleDisabledError" })
      await assert.rejects(validations.listValidations(ctx, parseValidationFilters({})), { name: "ModuleDisabledError" })
      await assert.rejects(createValidationRecord(ctx, {}), { name: "ModuleDisabledError" })
      await assert.rejects(centrals.listActiveCentrals(ctx), { name: "ModuleDisabledError" })
      await assert.rejects(ensureCentralRecord(ctx, { name: "Nova" }), { name: "ModuleDisabledError" })
      await assert.rejects(saveCatalogItemRecord(ctx, "devReturnReason", { label: "x", category: "ANALYST", requiresDetail: false }), { name: "ForbiddenError" })
      // Sem o módulo, os alertas dele não existem; o core continua.
      const result = await getAlerts(ctx)
      assert.ok(!result.alerts.some((a) => a.kind === "devReturnUnresolved"))
      // Desligar não apaga dado (D32).
      assert.equal(await dbIncludingDeleted.devReturn.count({ where: { teamId: T2 } }), 1)
      // T1 segue com tudo ligado.
      assert.ok((await devReturns.listDevReturns(m1, parseDevReturnFilters({}))).rows.length >= 0)
    } finally {
      await dbIncludingDeleted.teamModule.updateMany({ where: { teamId: T2 }, data: { isEnabled: true } })
    }
  })

  test("escrita de M1 grava teamId do contexto, nunca do registro pai", async () => {
    const result = await createWatchItemRecord(m1, { title: `Nova ${MARK} T1`, heat: "LOW", origin: "MANUAL", context: "", memberId: t1.member })
    assert.ok(result.ok)
    const created = await dbIncludingDeleted.watchItem.findUniqueOrThrow({ where: { id: (result as { id: string }).id } })
    assert.equal(created.teamId, T1)
    assert.equal(await dbIncludingDeleted.auditLog.count({ where: { entityId: created.id, teamId: T1 } }), 1)
  })

  test("P23 — seleção: cada um lista só os times com acesso, com nível e contagem", async () => {
    const asV = await listAccessibleTeams(USERS.v)
    assert.deepEqual(asV.map((t) => [t.id, t.level, t.members]), [[T1, "VIEWER", 1], [T2, "VIEWER", 1]])
    const asM1 = await listAccessibleTeams(USERS.m1)
    assert.deepEqual(asM1.map((t) => t.id), [T1])
    // Administração da plataforma não é acesso a time.
    assert.deepEqual(await listAccessibleTeams(USERS.admin), [])
  })

  test("P23 — administração de times: só isPlatformAdmin; módulo e acesso auditados; revogar não apaga", async () => {
    const admin: TeamContext = { ...m1, userId: USERS.admin, isPlatformAdmin: true }
    // MANAGER de time não administra a plataforma.
    await assert.rejects(teamsQ.listTeamsForAdmin(m1), { name: "ForbiddenError" })
    await assert.rejects(setTeamModuleRecord(m1, { teamId: T2, moduleKey: MODULES.CENTRALS, enabled: false }), { name: "ForbiddenError" })
    await assert.rejects(grantTeamAccessRecord(m1, { teamId: T2, userId: USERS.m1, level: "MANAGER" }), { name: "ForbiddenError" })

    // O administrador vê os dois times — só dado de plataforma, nenhum registro de time.
    const data = await teamsQ.listTeamsForAdmin(admin)
    assert.deepEqual(data.teams.map((t) => t.id), [T1, T2])
    assertNoLeak("listTeamsForAdmin", data, t1)
    assertNoLeak("listTeamsForAdmin", data, t2)

    // Módulo: desligar não apaga dado; auditoria com o time ALVO.
    assert.ok((await setTeamModuleRecord(admin, { teamId: T2, moduleKey: MODULES.CENTRALS, enabled: false })).ok)
    assert.equal((await teamContextFor(USERS.m2, T2)).modules.has(MODULES.CENTRALS), false)
    assert.equal(await dbIncludingDeleted.central.count({ where: { teamId: T2 } }), 1)
    assert.equal(await dbIncludingDeleted.auditLog.count({ where: { action: "team.module.disable", teamId: T2, userId: USERS.admin } }), 1)
    assert.ok((await setTeamModuleRecord(admin, { teamId: T2, moduleKey: MODULES.CENTRALS, enabled: true })).ok)

    // Acesso: conceder dá contexto; revogar tira, e a linha fica com revokedAt.
    await assert.rejects(teamContextFor(USERS.m1, T2), { name: "TeamAccessError" })
    assert.ok((await grantTeamAccessRecord(admin, { teamId: T2, userId: USERS.m1, level: "VIEWER" })).ok)
    assert.equal((await teamContextFor(USERS.m1, T2)).level, "VIEWER")
    assert.ok((await grantTeamAccessRecord(admin, { teamId: T2, userId: USERS.m1, level: "MANAGER" })).ok)
    assert.equal((await teamContextFor(USERS.m1, T2)).level, "MANAGER")
    assert.ok((await revokeTeamAccessRecord(admin, { teamId: T2, userId: USERS.m1 })).ok)
    await assert.rejects(teamContextFor(USERS.m1, T2), { name: "TeamAccessError" })
    const row = await dbIncludingDeleted.teamAccess.findUniqueOrThrow({ where: { userId_teamId: { userId: USERS.m1, teamId: T2 } } })
    assert.ok(row.revokedAt, "revogar preenche revokedAt e não apaga")
    assert.deepEqual(
      (await dbIncludingDeleted.auditLog.findMany({ where: { entity: "TeamAccess", teamId: T2 }, orderBy: { at: "asc" }, select: { action: true } })).map((a) => a.action),
      ["team.access.grant", "team.access.level", "team.access.revoke"],
    )
    // Ninguém revoga o próprio acesso; time de outra organização não existe para o admin.
    assert.equal((await revokeTeamAccessRecord(admin, { teamId: T1, userId: USERS.admin })).ok, false)
    assert.equal((await setTeamModuleRecord(admin, { teamId: "seed_team", moduleKey: MODULES.CENTRALS, enabled: false })).ok, false)
    await dbIncludingDeleted.teamAccess.delete({ where: { id: row.id } })
  })

  test("o módulo PRIORITY_VALIDATION existe na lista de módulos válidos (sanidade)", () => {
    assert.ok(MODULE_KEYS.includes(MODULES.PRIORITY_VALIDATION))
  })
})

/* ══════════════════════ 3. BANCO: PORTAL DO COLABORADOR (P25) ══════════════════════ */

const MP = "isom_"
const MP_ORG = `${MP}org`
const MP_T1 = `${MP}t1`
const MP_T2 = `${MP}t2`
const MP_TEAMS = [MP_T1, MP_T2]
const MP_USERS = { mgr: `${MP}mgr`, a1: `${MP}a1`, a2: `${MP}a2`, a3: `${MP}a3` }
const MP_MARK = "Berílio"
const MP_PASSWORD = "senha-do-portal-123"
const INVITED_EMAIL = `${MP}a4@teste.local`

async function cleanupPortal() {
  const d = dbIncludingDeleted
  const inTeams = { teamId: { in: MP_TEAMS } }
  await d.agreementCheckin.deleteMany({ where: inTeams })
  await d.agreementSelfReport.deleteMany({ where: inTeams })
  await d.memberProposal.deleteMany({ where: inTeams })
  await d.timelineEvent.deleteMany({ where: inTeams })
  await d.watchItem.deleteMany({ where: inTeams })
  await d.feedback.deleteMany({ where: inTeams })
  await d.note.deleteMany({ where: inTeams })
  await d.oneOnOne.deleteMany({ where: inTeams })
  await d.developmentPlan.deleteMany({ where: inTeams })
  await d.memberTrait.deleteMany({ where: inTeams })
  await d.agreement.updateMany({ where: inTeams, data: { replacesAgreementId: null } })
  await d.agreement.deleteMany({ where: inTeams })
  await d.dailyParticipant.deleteMany({ where: inTeams })
  await d.daily.deleteMany({ where: inTeams })
  await d.teamMember.deleteMany({ where: inTeams })
  await d.seniority.deleteMany({ where: inTeams })
  await d.auditLog.deleteMany({ where: { OR: [inTeams, { organizationId: MP_ORG }] } })
  await d.teamAccess.deleteMany({ where: inTeams })
  await d.team.deleteMany({ where: { id: { in: MP_TEAMS } } })
  await d.user.deleteMany({ where: { OR: [{ id: { in: Object.values(MP_USERS) } }, { email: INVITED_EMAIL }] } })
  await d.organization.deleteMany({ where: { id: MP_ORG } })
}

describe("banco: portal do colaborador (P25) — critério de aceite", async () => {
  const d = dbIncludingDeleted
  const id = (name: string) => `${MP}${name}`
  const text = (what: string, who: string) => `${what} ${MP_MARK} ${who}`
  /** Tudo o que A1 NÃO pode receber: de A2, de T2 e o registro gerencial sobre ele mesmo. */
  const forbiddenIds: string[] = []
  const forbiddenText: string[] = []
  let a1: MemberContext

  before(async () => {
    await cleanupPortal()
    await d.organization.create({ data: { id: MP_ORG, name: "Portal (teste)", slug: "isom-org" } })
    const passwordHash = await hashPassword(MP_PASSWORD)
    for (const [key, uid] of Object.entries(MP_USERS)) {
      await d.user.create({ data: { id: uid, email: `${uid}@teste.local`, name: `Conta ${key}`, role: "VIEWER", organizationId: MP_ORG, passwordHash } })
    }
    for (const [teamId, slug] of [[MP_T1, "isom-t1"], [MP_T2, "isom-t2"]] as const) {
      await d.team.create({ data: { id: teamId, organizationId: MP_ORG, name: slug, slug, managerUserId: MP_USERS.mgr } })
      await d.seniority.create({ data: { teamId, organizationId: MP_ORG, id: `${teamId}_sen`, key: "JUNIOR", label: "Júnior", order: 1 } })
    }
    await d.teamAccess.createMany({
      data: [
        { userId: MP_USERS.mgr, teamId: MP_T1, level: "MANAGER" },
        { userId: MP_USERS.a1, teamId: MP_T1, level: "MEMBER" },
        { userId: MP_USERS.a2, teamId: MP_T1, level: "MEMBER" },
        { userId: MP_USERS.a3, teamId: MP_T2, level: "MEMBER" },
      ],
    })
    const person = (pid: string, teamId: string, userId: string | null, who: string) =>
      d.teamMember.create({
        data: { id: pid, teamId, userId, fullName: text("Pessoa", who), preferredName: text("Pessoa", who), position: "Analista", seniorityId: `${teamId}_sen`, joinedAt: day(-300), avatarSeed: who },
      })
    await person(id("p_a1"), MP_T1, MP_USERS.a1, "A1")
    await person(id("p_a2"), MP_T1, MP_USERS.a2, "A2")
    await person(id("p_a3"), MP_T2, MP_USERS.a3, "A3")
    await person(id("p_a4"), MP_T1, null, "A4")

    const agreement = (aid: string, teamId: string, memberId: string, who: string, extra: object = {}) =>
      d.agreement.create({
        data: { id: aid, teamId, memberId, title: text("Combinado", who), origin: "MANAGER", originalDueDate: day(-3), dueDate: day(-3), authorUserId: MP_USERS.mgr, ...extra },
      })
    // A1: aberto (com anotação do gestor que nunca pode sair), revisado na daily, encerrado.
    await agreement(id("ag_a1_open"), MP_T1, id("p_a1"), "A1", { managerNote: "SEGREDO-DO-GESTOR" })
    await agreement(id("ag_a1_reviewed"), MP_T1, id("p_a1"), "A1")
    await agreement(id("ag_a1_done"), MP_T1, id("p_a1"), "A1", { status: "DONE", completedAt: day(-5), outcome: "Entregue" })
    await agreement(id("ag_a2"), MP_T1, id("p_a2"), "A2")
    await agreement(id("ag_a3"), MP_T2, id("p_a3"), "A3")
    forbiddenIds.push(id("ag_a2"), id("ag_a3"), id("p_a2"), id("p_a3"))
    forbiddenText.push(text("Combinado", "A2"), text("Combinado", "A3"), "SEGREDO-DO-GESTOR")

    // Daily CLOSED de ontem no T1: revisão de A1 (Parcial, relatou Feito) e de A2; resumo e decisões que nunca saem.
    await d.daily.create({ data: { id: id("daily_t1"), teamId: MP_T1, date: day(-1), summary: "RESUMO-SECRETO", decisions: "DECISAO-SECRETA", authorUserId: MP_USERS.mgr } })
    await d.daily.create({ data: { id: id("daily_t2"), teamId: MP_T2, date: day(-1), summary: "RESUMO-T2", authorUserId: MP_USERS.mgr } })
    forbiddenText.push("RESUMO-SECRETO", "DECISAO-SECRETA", "RESUMO-T2")
    forbiddenIds.push(id("daily_t2"))
    await d.agreementCheckin.create({
      data: { teamId: MP_T1, agreementId: id("ag_a1_reviewed"), dailyId: id("daily_t1"), outcome: "PARTIAL", blockerText: text("Impeditivo", "A1"), newDueDate: day(1), authorUserId: MP_USERS.mgr },
    })
    await d.agreementCheckin.create({
      data: { id: id("ck_a2"), teamId: MP_T1, agreementId: id("ag_a2"), dailyId: id("daily_t1"), outcome: "NOT_DONE", blockerText: text("Impeditivo", "A2"), authorUserId: MP_USERS.mgr },
    })
    forbiddenIds.push(id("ck_a2"))
    forbiddenText.push(text("Impeditivo", "A2"))
    await d.agreementSelfReport.create({ data: { teamId: MP_T1, memberId: id("p_a1"), agreementId: id("ag_a1_reviewed"), outcome: "DONE", dailyId: id("daily_t1") } })
    await d.agreementSelfReport.create({ data: { teamId: MP_T1, memberId: id("p_a1"), agreementId: id("ag_a1_open"), outcome: "PARTIAL", blockerText: text("Relato", "A1") } })
    await d.memberProposal.create({ data: { teamId: MP_T1, memberId: id("p_a1"), title: text("Proposta", "A1"), dailyId: id("daily_t1"), status: "DISCARDED", managerNote: "Resposta à proposta" } })
    await d.memberProposal.create({ data: { id: id("prop_a2"), teamId: MP_T1, memberId: id("p_a2"), title: text("Proposta", "A2"), dailyId: id("daily_t1") } })
    forbiddenIds.push(id("prop_a2"))
    forbiddenText.push(text("Proposta", "A2"))

    // Registro gerencial SOBRE A1 — inclusive o compartilhado (D40).
    const fbp = await d.feedback.create({ data: { id: id("fb_priv"), teamId: MP_T1, memberId: id("p_a1"), date: day(-2), category: "BEHAVIOR", behavior: text("Feedback privado", "A1"), visibility: "PRIVATE", authorUserId: MP_USERS.mgr } })
    const fbs = await d.feedback.create({ data: { id: id("fb_shared"), teamId: MP_T1, memberId: id("p_a1"), date: day(-2), category: "RECOGNITION", behavior: text("Feedback compartilhado", "A1"), visibility: "SHARED", authorUserId: MP_USERS.mgr } })
    const note = await d.note.create({ data: { id: id("note"), teamId: MP_T1, memberId: id("p_a1"), occurredAt: new Date(), title: text("Anotação", "A1"), body: text("Corpo da anotação", "A1"), visibility: "PRIVATE", authorUserId: MP_USERS.mgr } })
    await d.oneOnOne.create({ data: { id: id("ooo"), teamId: MP_T1, memberId: id("p_a1"), date: day(-4), topics: text("Assuntos do 1:1", "A1"), authorUserId: MP_USERS.mgr } })
    await d.watchItem.create({
      data: { id: id("watch"), teamId: MP_T1, organizationId: MP_ORG, title: text("Observação", "A1"), heat: "HIGH", origin: "MANUAL", visibility: "SHARED", memberId: id("p_a1"), createdByUserId: MP_USERS.mgr, lastReviewedAt: day(-1), heatChangedAt: day(-1) },
    })
    await d.developmentPlan.create({ data: { id: id("pdi"), teamId: MP_T1, memberId: id("p_a1"), currentSituation: text("Situação do PDI", "A1"), objective: text("Objetivo do PDI", "A1"), status: "ACTIVE", startedAt: day(-30) } })
    await d.memberTrait.create({ data: { id: id("trait"), teamId: MP_T1, memberId: id("p_a1"), kind: "DEVELOPMENT", text: text("Ponto a desenvolver", "A1"), observedAt: day(-10) } })
    await recordTimelineEvents(d, { teamId: MP_T1 }, [timelineEventFor.feedback(fbp), timelineEventFor.feedback(fbs), timelineEventFor.note(note)])
    const events = await d.timelineEvent.findMany({ where: { teamId: MP_T1 }, select: { id: true } })
    forbiddenIds.push(id("fb_priv"), id("fb_shared"), id("note"), id("ooo"), id("watch"), id("pdi"), id("trait"), ...events.map((e) => e.id))
    forbiddenText.push(
      text("Feedback privado", "A1"), text("Feedback compartilhado", "A1"), text("Anotação", "A1"), text("Corpo da anotação", "A1"),
      text("Assuntos do 1:1", "A1"), text("Observação", "A1"), text("Situação do PDI", "A1"), text("Objetivo do PDI", "A1"), text("Ponto a desenvolver", "A1"),
    )

    a1 = await memberContextFor(MP_USERS.a1, MP_T1)
  })

  after(async () => {
    await cleanupPortal()
    await db.$disconnect()
    await dbIncludingDeleted.$disconnect()
  })

  /** Toda função exportada de member-portal.ts, chamada com o contexto de A1. */
  const MEMBER_QUERIES: Record<string, (c: MemberContext) => Promise<unknown>> = {
    getMyOpenAgreements: (c) => memberPortal.getMyOpenAgreements(c),
    getMyLastDailyRecord: (c) => memberPortal.getMyLastDailyRecord(c),
    getMyAgreementHistory: (c) => memberPortal.getMyAgreementHistory(c, 50),
  }

  test("meta: toda função exportada do portal está na tabela", () => {
    const source = readFileSync(join(SRC, "server/queries/member-portal.ts"), "utf8")
    const exported = [...source.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]!)
    assert.deepEqual(exported.filter((name) => !(name in MEMBER_QUERIES)), [])
  })

  test("1–5. A1 recebe só o que é dele: nada de A2, de T2, de registro gerencial, de managerNote, de resumo ou decisões", async () => {
    for (const [name, run] of Object.entries(MEMBER_QUERIES)) {
      const out = dump(await run(a1)) ?? ""
      for (const fid of forbiddenIds) assert.ok(!out.includes(fid), `${name}: vazou ${fid}`)
      for (const t of forbiddenText) assert.ok(!out.includes(t), `${name}: vazou "${t}"`)
      assert.ok(!/"managerNote"\s*:/.test(out), `${name}: chave managerNote`)
      assert.ok(!/"(summary|decisions)"\s*:/.test(out), `${name}: chave summary/decisions`)
    }
  })

  test("A1 vê os próprios combinados, o relato pendente e a última daily com relato × registro", async () => {
    const open = await memberPortal.getMyOpenAgreements(a1)
    assert.deepEqual(open.map((a) => a.id).sort(), [id("ag_a1_open"), id("ag_a1_reviewed")].sort())
    assert.equal(open.find((a) => a.id === id("ag_a1_open"))?.pendingReport?.outcome, "PARTIAL")
    const last = await memberPortal.getMyLastDailyRecord(a1)
    assert.equal(last?.daily.id, id("daily_t1"))
    assert.deepEqual(last?.reviewed.map((r) => [r.agreementId, r.outcome, r.reportedOutcome]), [[id("ag_a1_reviewed"), "PARTIAL", "DONE"]])
    assert.equal(last?.proposals[0]?.reply, "Resposta à proposta")
    const history = await memberPortal.getMyAgreementHistory(a1)
    assert.deepEqual(history.map((a) => a.id), [id("ag_a1_done")])
  })

  test("6. A1 com a pessoa desativada recebe erro", async () => {
    await d.teamMember.update({ where: { id: id("p_a1") }, data: { status: "INACTIVE" } })
    await assert.rejects(memberContextFor(MP_USERS.a1, MP_T1), { name: "MemberAccessError" })
    await d.teamMember.update({ where: { id: id("p_a1") }, data: { status: "ACTIVE", deletedAt: new Date() } })
    await assert.rejects(memberContextFor(MP_USERS.a1, MP_T1), { name: "MemberAccessError" })
    await d.teamMember.update({ where: { id: id("p_a1") }, data: { deletedAt: null } })
  })

  test("7. A1 com a conta inativa recebe erro (e não entra pelo login)", async () => {
    await d.user.update({ where: { id: MP_USERS.a1 }, data: { isActive: false } })
    await assert.rejects(memberContextFor(MP_USERS.a1, MP_T1), { name: "MemberAccessError" })
    assert.equal(await verifyCredentials(`${MP_USERS.a1}@teste.local`, MP_PASSWORD), null)
    await d.user.update({ where: { id: MP_USERS.a1 }, data: { isActive: true } })
  })

  test("8. A1 nas rotas do gestor é mandado para /me, e as queries do gestor lançam com o contexto dele", async () => {
    for (const pathname of ["/", "/team", "/agreements", "/dailies/new", "/watch", "/settings"]) {
      assert.deepEqual(routeRequest({ pathname, loggedIn: true, memberOnly: true }), { kind: "redirect", to: MEMBER_HOME })
    }
    await assert.rejects(teamContextFor(MP_USERS.a1, MP_T1), { name: "TeamAccessError" })
    const asManager = a1 as unknown as TeamContext
    await assert.rejects(agreements.listAgreements(asManager, parseAgreementFilters(new URLSearchParams("view=all"))), { name: "ForbiddenError" })
    await assert.rejects(records.listRecords(asManager, parseRecordFilters({ period: "all" })), { name: "ForbiddenError" })
    await assert.rejects(timeline.getTimelinePage(asManager, id("p_a1"), parseTimelineFilters(new URLSearchParams()), null), { name: "ForbiddenError" })
  })

  test("9. o gestor em /me volta para a home dele (o portal só entra com a superfície do colaborador)", async () => {
    assert.deepEqual(routeRequest({ pathname: "/me", loggedIn: true, memberOnly: false }), { kind: "redirect", to: "/" })
    assert.deepEqual(routeRequest({ pathname: "/me", loggedIn: true, memberOnly: false, surface: "member" }), { kind: "allow" })
    await assert.rejects(memberContextFor(MP_USERS.mgr, MP_T1), { name: "MemberAccessError" })
  })

  test("10. A1 montando o contexto do T2 recebe ERRO, não lista vazia", async () => {
    await assert.rejects(memberContextFor(MP_USERS.a1, MP_T2), (error: unknown) => error instanceof MemberAccessError && error.reason === "no-access")
  })

  test("allowlist em dois níveis: só colaborador entra fora da lista; gestor fora da lista não", async () => {
    assert.equal(await accountTier(MP_USERS.a1, false), "member")
    assert.equal(await accountTier(MP_USERS.mgr, false), "privileged")
    const member = await verifyCredentials(`${MP_USERS.a1}@teste.local`, MP_PASSWORD)
    assert.equal(member?.memberOnly, true)
    assert.equal(await verifyCredentials(`${MP_USERS.mgr}@teste.local`, MP_PASSWORD), null)
  })

  test("member:invite liga o login à pessoa; member:deactivate tira o acesso sem apagar nada", async () => {
    const actor = { organizationId: MP_ORG, adminUserId: MP_USERS.mgr }
    const invited = await inviteMember({ teamId: MP_T1, memberId: id("p_a4"), email: INVITED_EMAIL }, actor)
    assert.ok(invited.password, "senha gerada e devolvida uma vez")
    const user = await d.user.findUniqueOrThrow({ where: { email: INVITED_EMAIL }, select: { id: true, passwordHash: true } })
    assert.ok(user.passwordHash && user.passwordHash !== invited.password, "só o hash é gravado")
    const ctx = await memberContextFor(user.id, MP_T1)
    assert.equal(ctx.memberId, id("p_a4"))
    await assert.rejects(inviteMember({ teamId: MP_T1, memberId: id("p_a4"), email: INVITED_EMAIL }, actor), /já tem login/)

    const off = await deactivateMemberAccount(INVITED_EMAIL, actor)
    assert.equal(off.revoked, 1)
    await assert.rejects(memberContextFor(user.id, MP_T1), { name: "MemberAccessError" })
    const access = await d.teamAccess.findUniqueOrThrow({ where: { userId_teamId: { userId: user.id, teamId: MP_T1 } } })
    assert.ok(access.revokedAt, "revogar preenche revokedAt e não apaga a linha")
    assert.equal((await d.teamMember.findUniqueOrThrow({ where: { id: id("p_a4") } })).userId, user.id, "a pessoa não muda")
    await d.teamMember.update({ where: { id: id("p_a4") }, data: { userId: null } })
  })
})
