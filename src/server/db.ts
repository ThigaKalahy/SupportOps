import { PrismaClient, type Prisma } from "@prisma/client"

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

function createClients() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })
  return { base, filtered: withSoftDelete(base) }
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
