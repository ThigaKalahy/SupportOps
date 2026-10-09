import { dbIncludingDeleted } from "../../src/server/db.ts"
import { teamContextFor, type TeamContext } from "../../src/server/scope.ts"

/**
 * Contextos de time dos testes que leem o banco com os dados do seed (P22): o
 * OWNER do seed no time dele (TeamAccess MANAGER, conferido por `teamContextFor`,
 * como em produção) e um VIEWER sintético do MESMO time — sem linha no banco, só
 * para exercitar a regra de visibilidade (D34).
 */
export async function seedContexts(owner: { id: string }): Promise<{ manager: TeamContext; viewer: TeamContext }> {
  const access = await dbIncludingDeleted.teamAccess.findFirstOrThrow({
    where: { userId: owner.id, revokedAt: null, level: "MANAGER" },
    orderBy: { grantedAt: "asc" },
    select: { teamId: true },
  })
  const manager = await teamContextFor(owner.id, access.teamId)
  return { manager, viewer: { ...manager, userId: "teste-viewer", level: "VIEWER" } }
}
