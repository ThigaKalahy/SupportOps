import { authenticateApiKey } from "./api-keys.ts"
import { writeAudit } from "./audit.ts"
import { ScopeError, type TeamContext } from "./scope.ts"

/**
 * C22 — casca das rotas da API de combinados (src/app/api/v1/). Toda rota passa por aqui:
 * autentica a chave (o contexto é o do DONO da chave, conferido a cada chamada), roda o
 * núcleo, responde JSON e grava `api.request` na auditoria (método, caminho, status e a
 * chave — nunca o corpo nem a chave). Escopo e nível são os das telas: os núcleos recebem
 * o `TeamContext` e fazem as mesmas conferências (requireManager, teamScope, módulos).
 */

export type ApiResponse = { status: number; body: unknown }

export function json(status: number, body: unknown): ApiResponse {
  return { status, body }
}

/** Resultado de um núcleo de escrita → resposta HTTP. Validação 422; não encontrado 404. */
export function fromResult(result: { ok: boolean; error?: string; fieldErrors?: Record<string, string> }, success: () => ApiResponse): ApiResponse {
  if (result.ok) return success()
  if (result.fieldErrors && Object.keys(result.fieldErrors).length) return json(422, { error: result.error, fieldErrors: result.fieldErrors })
  return json(422, { error: result.error })
}

export async function handleApi(request: Request, run: (ctx: TeamContext) => Promise<ApiResponse>): Promise<Response> {
  const auth = await authenticateApiKey(request.headers.get("authorization"))
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  let response: ApiResponse
  try {
    response = await run(auth.ctx)
  } catch (error) {
    // Nível sem escrita (VIEWER), módulo desligado: a mensagem é pt-BR e vai na resposta.
    if (error instanceof ScopeError) response = json(403, { error: error.message })
    else {
      console.error("[api] falha", error)
      response = json(500, { error: "Erro interno." })
    }
  }
  const url = new URL(request.url)
  await writeAudit(
    { action: "api.request", entity: "ApiKey", entityId: auth.keyId, after: { method: request.method, path: url.pathname, status: response.status } },
    { organizationId: auth.ctx.organizationId, teamId: auth.ctx.teamId, userId: auth.ctx.userId },
  )
  return Response.json(response.body, { status: response.status })
}

/** Corpo JSON da requisição, ou null quando não é JSON válido. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** "AAAA-MM-DD" (formato da API) → "DD/MM/AAAA" (formato dos schemas). Inválido devolve o texto como veio, e o schema recusa. */
export function isoToDisplay(value: unknown): string {
  if (typeof value !== "string") return ""
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value
}
