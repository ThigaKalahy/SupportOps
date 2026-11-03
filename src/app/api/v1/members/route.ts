import { handleApi, json } from "@/server/api-route"
import { listMembersForApi } from "@/server/queries/api"

/** C22 — pessoas do time da chave (id, nome, e-mail), para escolher o responsável ao criar. */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return handleApi(request, async (ctx) => json(200, { data: await listMembersForApi(ctx) }))
}
