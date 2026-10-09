import { Prisma } from "@prisma/client"
import { z } from "zod"

import { CENTRAL_NAME_MAX, centralSlug, cleanCentralName, previewCentralImport } from "../lib/centrals.ts"
import { fill, labels } from "../lib/labels.ts"
import type { ActionResult } from "../lib/validators/fields.ts"

import { MODULES } from "../lib/modules.ts"

import { auditOf, writeAudit } from "./audit.ts"
import { db } from "./db.ts"
import { hasModule, requireManager, requireModule, teamScope, type TeamContext } from "./scope.ts"

/**
 * Escrita de Central fora do CRUD de /settings (P19, D20): a criação no próprio
 * formulário (combobox) e a importação por colagem. O CRUD (editar, desativar,
 * excluir sem uso) é o catálogo genérico de src/server/settings.ts.
 *
 * Dedupe sempre pelo slug: digitar "central alfa" com "Central Alfa" cadastrada
 * devolve a existente, nunca cria outra. Desativada não é reativada aqui.
 * Módulo CENTRALS (D32): com ele desligado, nada daqui escreve.
 */

const C = labels.centrals
const MAX_IMPORT_LINES = 2000

export type EnsureCentralResult =
  | { ok: true; id: string; name: string; existed: boolean }
  | Extract<ActionResult, { ok: false }>

const ensureSchema = z.object({ name: z.string().max(CENTRAL_NAME_MAX * 2) })

/** Central pelo nome digitado: a existente (mesmo slug) ou uma nova, criada e auditada. */
export async function ensureCentralRecord(ctx: TeamContext, input: unknown): Promise<EnsureCentralResult> {
  requireManager(ctx)
  requireModule(ctx, MODULES.CENTRALS)
  const parsed = ensureSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  const name = cleanCentralName(parsed.data.name)
  const slug = centralSlug(name)
  if (!slug) return { ok: false, error: labels.settings.validation.labelRequired }
  if (name.length > CENTRAL_NAME_MAX) return { ok: false, error: labels.validation.tooLong }

  const existing = await db.central.findUnique({ where: { teamId_slug: { teamId: ctx.teamId, slug } } })
  if (existing) {
    if (!existing.isActive) return { ok: false, error: fill(C.inactive, { name: existing.name }) }
    return { ok: true, id: existing.id, name: existing.name, existed: true }
  }

  try {
    const created = await db.$transaction(async (tx) => {
      const central = await tx.central.create({ data: { ...teamScope(ctx), organizationId: ctx.organizationId, name, slug } })
      await writeAudit(
        { action: "settings.central.create", entity: "Central", entityId: central.id, after: { name, slug, via: "form" } },
        auditOf(ctx, tx),
      )
      return central
    })
    return { ok: true, id: created.id, name: created.name, existed: false }
  } catch (error) {
    // Outra aba criou a mesma central no meio do caminho: usa a que ficou.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await db.central.findUnique({ where: { teamId_slug: { teamId: ctx.teamId, slug } } })
      if (winner) return { ok: true, id: winner.id, name: winner.name, existed: true }
    }
    throw error
  }
}

const importSchema = z.object({ text: z.string().max(200_000) })

/**
 * Importação por colagem: recalcula a pré-visualização contra o banco e cria
 * só as novas, numa transação, com uma entrada de auditoria com a contagem.
 * Nunca sobrescreve nem reativa.
 */
export async function importCentralsRecord(ctx: TeamContext, input: unknown): Promise<{ ok: true; created: number } | Extract<ActionResult, { ok: false }>> {
  requireManager(ctx)
  requireModule(ctx, MODULES.CENTRALS)
  const parsed = importSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: labels.validation.generic }
  if (parsed.data.text.split(/\r?\n/).length > MAX_IMPORT_LINES) return { ok: false, error: C.import.tooLarge }

  const existing = await db.central.findMany({
    where: teamScope(ctx),
    select: { id: true, name: true, slug: true, isActive: true },
  })
  const preview = previewCentralImport(parsed.data.text, existing)
  if (preview.created.length === 0) return { ok: false, error: C.import.nothing }

  await db.$transaction(async (tx) => {
    // skipDuplicates: se outra aba criou alguma no meio do caminho, ela é ignorada em vez de derrubar o lote.
    const result = await tx.central.createMany({
      data: preview.created.map((c) => ({ ...teamScope(ctx), organizationId: ctx.organizationId, name: c.name, slug: c.slug, externalId: c.externalId })),
      skipDuplicates: true,
    })
    await writeAudit(
      {
        action: "settings.central.import",
        entity: "Central",
        after: {
          created: result.count,
          ignoredExisting: preview.existing.length,
          empty: preview.empty,
          invalid: preview.invalid.length,
          names: preview.created.map((c) => c.name),
        },
      },
      auditOf(ctx, tx),
    )
  })
  return { ok: true, created: preview.created.length }
}

/**
 * Confere a central escolhida num formulário: precisa ser do time e estar ativa,
 * e o módulo CENTRALS precisa estar ligado. Vazio vira null (campo opcional).
 * Devolve undefined quando o id não serve — a action recusa com erro de campo.
 */
export async function resolveCentralId(ctx: TeamContext, centralId: string | null | undefined): Promise<string | null | undefined> {
  if (!centralId) return null
  if (!hasModule(ctx, MODULES.CENTRALS)) return undefined
  const central = await db.central.findFirst({
    where: { ...teamScope(ctx), id: centralId, isActive: true, deletedAt: null },
    select: { id: true },
  })
  return central ? central.id : undefined
}
