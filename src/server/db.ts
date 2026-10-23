import { PrismaClient, type Prisma } from "@prisma/client"

import { onBusinessDay } from "../lib/dates.ts"

/**
 * Cliente Prisma do Prontuário.
 *
 * - `db`: cliente padrão. Leituras dos models com soft delete escondem
 *   automaticamente os registros com `deletedAt` preenchido.
 * - `dbIncludingDeleted`: cliente sem o filtro. Uso explícito e raro —
 *   auditoria, restauração, histórico de quem saiu do time.
 *
 * Só importar no servidor (Server Components, Server Actions, src/server/).
 */

/** Models com `deletedAt` (D10: só onde há valor histórico). */
const SOFT_DELETE_MODELS: ReadonlySet<Prisma.ModelName> = new Set<Prisma.ModelName>([
  "TeamMember",
  "Agreement",
  "OneOnOne",
  "Feedback",
  "Note",
  "PriorityValidation",
  "DevelopmentPlan",
  "DevReturn",
  "WatchItem",
])

const READ_OPERATIONS: ReadonlySet<string> = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
])

/**
 * Acrescenta `deletedAt: null` ao `where` das leituras de topo.
 *
 * Para ler registros apagados de propósito, informe `deletedAt` no próprio
 * `where` (ex.: `{ deletedAt: { not: null } }`) — o filtro automático então
 * não é aplicado.
 *
 * Limite conhecido: relações carregadas por `include`/`select` aninhado NÃO
 * são filtradas pela extensão. Nesses casos, filtre explicitamente:
 * `include: { agreements: { where: { deletedAt: null } } }`.
 */
function withSoftDelete(base: PrismaClient) {
  return base.$extends({
    name: "soft-delete",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model as Prisma.ModelName) || !READ_OPERATIONS.has(operation)) {
            return query(args)
          }
          const current = (args ?? {}) as { where?: Record<string, unknown> }
          if (current.where && "deletedAt" in current.where) return query(args)
          return query({ ...current, where: { ...current.where, deletedAt: null } } as typeof args)
        },
      },
    },
  })
}

/**
 * C20 (decisão do usuário em 23/10/2026): prazo nunca cai em sábado, domingo ou feriado
 * nacional — passa para o próximo dia útil. Aplicado aqui, na gravação, para valer em TODA
 * escrita de prazo (daily, reagendamento, combinado rápido, "Todos do time", 1:1, feedback,
 * portal, scrum master, relato com prazo sugerido), sem depender de cada formulário.
 */
const BUSINESS_DATE_FIELDS: Partial<Record<Prisma.ModelName, readonly string[]>> = {
  Agreement: ["dueDate", "originalDueDate"],
  AgreementCheckin: ["newDueDate"],
  AgreementSelfReport: ["suggestedDueDate"],
  MemberProposal: ["suggestedDueDate"],
}
const WRITE_OPERATIONS: ReadonlySet<string> = new Set(["create", "createMany", "update", "updateMany", "upsert"])

function roundDates(data: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(data)) return data.map((row) => roundDates(row, fields))
  if (!data || typeof data !== "object") return data
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) }
  for (const field of fields) if (out[field] instanceof Date) out[field] = onBusinessDay(out[field] as Date)
  return out
}

function withBusinessDueDates<T extends { $extends: PrismaClient["$extends"] }>(client: T) {
  return client.$extends({
    name: "business-due-dates",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const fields = BUSINESS_DATE_FIELDS[model as Prisma.ModelName]
          if (!fields || !WRITE_OPERATIONS.has(operation)) return query(args)
          const current = { ...(args as Record<string, unknown>) }
          if ("data" in current) current.data = roundDates(current.data, fields)
          if ("create" in current) current.create = roundDates(current.create, fields)
          if ("update" in current) current.update = roundDates(current.update, fields)
          return query(current as typeof args)
        },
      },
    },
  })
}

/**
 * Contador de consultas SQL, ligado só com PRISMA_COUNT_QUERIES=1 (usado nos
 * testes para provar "uma única query, sem N+1"). Desligado, não custa nada.
 */
export const queryCounter = { count: 0 }

function createClients() {
  const levels: Prisma.LogLevel[] = process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  const countQueries = process.env.PRISMA_COUNT_QUERIES === "1"
  const base = new PrismaClient({
    log: countQueries ? [...levels, { emit: "event", level: "query" } as const] : levels,
  })
  if (countQueries) {
    ;(base as unknown as { $on(event: "query", cb: () => void): void }).$on("query", () => {
      queryCounter.count += 1
    })
  }
  return { base, filtered: withBusinessDueDates(withSoftDelete(base)) }
}

type Clients = ReturnType<typeof createClients>

// Em desenvolvimento o hot reload recria módulos; o singleton em globalThis
// evita abrir uma conexão nova a cada recarga.
const globalForPrisma = globalThis as unknown as { prontuarioPrisma?: Clients }

const clients = globalForPrisma.prontuarioPrisma ?? createClients()

if (process.env.NODE_ENV !== "production") globalForPrisma.prontuarioPrisma = clients

export const db = clients.filtered
export const dbIncludingDeleted = clients.base

export type Db = typeof db
