import { labels } from "../../lib/labels.ts"
import { classifyHttpError, parseResponsesBody, type ParsedOpenAiResponse } from "../../lib/audit/openai-response.ts"
import type { AuditContext } from "./access.ts"

/**
 * C23 Fase D — o ÚNICO ponto que fala com a OpenAI (Responses API, por `fetch`, sem SDK — nenhuma
 * dependência nova). Modelo, limites e preços vêm da configuração do módulo; trocar
 * `gpt-5.4-nano` por `gpt-5.4-mini` é só mudar o campo "Modelo", sem reescrever nada.
 *
 * A chave vem SÓ de `process.env.OPENAI_API_KEY` (painel da Vercel): nunca no código, no banco,
 * no log ou na tela. Sem a chave, nada sai daqui. `store: false`: a OpenAI não guarda a resposta
 * para reuso. Recebe o `AuditContext` para que só o módulo, com as três travas, consiga chamar.
 */

const ENDPOINT = "https://api.openai.com/v1/responses"
/** Tempo máximo de uma chamada (a função da tela tem 60 s; sobra para gravar). */
const TIMEOUT_MS = 38_000
/** Esforço de raciocínio: baixo — a tarefa é leitura e classificação, e raciocínio é cobrado como saída. */
const REASONING_EFFORT = "low"

export interface OpenAiCall {
  model: string
  instructions: string
  input: string
  maxOutputTokens: number
  schemaName: string
  schema: Record<string, unknown>
}

export type OpenAiResult = ParsedOpenAiResponse & { durationMs: number }

export function openAiKeyConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

export async function callOpenAi(ctx: AuditContext, call: OpenAiCall): Promise<OpenAiResult> {
  void ctx // só o contexto da auditoria chega aqui (três travas); o pedido não leva dado do time além da conversa
  const started = Date.now()
  const key = process.env.OPENAI_API_KEY?.trim()
  const zero = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 }
  if (!key) return { ok: false, kind: "auth", message: labels.audit.run.keyMissing, usage: zero, durationMs: 0 }
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: call.model,
        instructions: call.instructions,
        input: [{ role: "user", content: call.input }],
        max_output_tokens: call.maxOutputTokens,
        reasoning: { effort: REASONING_EFFORT },
        text: { format: { type: "json_schema", name: call.schemaName, strict: true, schema: call.schema } },
        store: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    const body: unknown = await response.json().catch(() => null)
    const durationMs = Date.now() - started
    if (!response.ok) {
      const error = classifyHttpError(response.status, body)
      return { ok: false, ...error, usage: zero, durationMs }
    }
    return { ...parseResponsesBody(body), durationMs }
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
    return { ok: false, kind: "transient", message: timeout ? labels.audit.run.timeout : labels.audit.run.network, usage: zero, durationMs: Date.now() - started }
  }
}
