import { handleApi, json } from "@/server/api-route"
import { listCentralsForApi } from "@/server/queries/api"

/** C22 — centrais ativas do time da chave (vazio sem o módulo de centrais). */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return handleApi(request, async (ctx) => json(200, { data: await listCentralsForApi(ctx) }))
}
