/**
 * C23 Fase D — leitura PURA da resposta da Responses API da OpenAI e classificação dos erros.
 * Sem rede: o cliente (`src/server/audit/openai.ts`) faz a chamada e entrega o corpo aqui.
 * Nada daqui loga conteúdo — só devolve o texto e o consumo para quem chamou.
 */

export interface OpenAiUsage {
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  reasoningTokens: number
}

export type OpenAiErrorKind =
  /** Chave inválida ou sem permissão: para tudo, não adianta tentar de novo. */
  | "auth"
  /** Sem saldo/cota na conta: para tudo. */
  | "quota"
  /** Limite por minuto da OpenAI: tenta de novo depois. */
  | "rate_limit"
  /** Erro passageiro (5xx, rede, tempo esgotado): tenta de novo com espera. */
  | "transient"
  /** Pedido recusado (modelo inexistente, parâmetro não aceito): para tudo, é configuração. */
  | "request"

export type ParsedOpenAiResponse =
  | { ok: true; text: string; usage: OpenAiUsage; incomplete: string | null; refusal: string | null }
  | { ok: false; kind: OpenAiErrorKind; message: string; usage: OpenAiUsage }

const ZERO: OpenAiUsage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 }

const int = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0)

export function usageOf(body: unknown): OpenAiUsage {
  const usage = (body as { usage?: Record<string, unknown> } | null)?.usage
  if (!usage || typeof usage !== "object") return { ...ZERO }
  const inputDetails = usage.input_tokens_details as Record<string, unknown> | undefined
  const outputDetails = usage.output_tokens_details as Record<string, unknown> | undefined
  return {
    inputTokens: int(usage.input_tokens),
    cachedTokens: int(inputDetails?.cached_tokens),
    outputTokens: int(usage.output_tokens),
    reasoningTokens: int(outputDetails?.reasoning_tokens),
  }
}

/** Classifica um erro HTTP da OpenAI pelo status e pelo código do corpo. */
export function classifyHttpError(status: number, body: unknown): { kind: OpenAiErrorKind; message: string } {
  const error = (body as { error?: { code?: unknown; type?: unknown; message?: unknown } } | null)?.error
  const code = typeof error?.code === "string" ? error.code : typeof error?.type === "string" ? error.type : ""
  // A mensagem da OpenAI não contém a conversa; mesmo assim, só o começo.
  const detail = typeof error?.message === "string" ? error.message.slice(0, 200) : ""
  const message = `HTTP ${status}${code ? ` (${code})` : ""}${detail ? `: ${detail}` : ""}`
  if (status === 401 || status === 403) return { kind: "auth", message }
  if (status === 429) return { kind: code === "insufficient_quota" ? "quota" : "rate_limit", message }
  if (status === 408 || status >= 500) return { kind: "transient", message }
  return { kind: "request", message }
}

/** Extrai o texto da resposta (output_text das mensagens), a recusa e se ficou incompleta. */
export function parseResponsesBody(body: unknown): ParsedOpenAiResponse {
  const usage = usageOf(body)
  if (!body || typeof body !== "object") return { ok: false, kind: "transient", message: "resposta vazia", usage }
  const b = body as { status?: unknown; incomplete_details?: { reason?: unknown } | null; output?: unknown; error?: { message?: unknown } | null }
  if (b.status === "failed") {
    return { ok: false, kind: "transient", message: typeof b.error?.message === "string" ? b.error.message.slice(0, 200) : "falha na OpenAI", usage }
  }
  const parts: string[] = []
  let refusal: string | null = null
  for (const item of Array.isArray(b.output) ? b.output : []) {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message") continue
    for (const content of Array.isArray((item as { content?: unknown }).content) ? ((item as { content: unknown[] }).content) : []) {
      const c = content as { type?: unknown; text?: unknown; refusal?: unknown }
      if (c.type === "output_text" && typeof c.text === "string") parts.push(c.text)
      if (c.type === "refusal" && typeof c.refusal === "string") refusal = c.refusal.slice(0, 300)
    }
  }
  const incomplete = b.status === "incomplete" ? (typeof b.incomplete_details?.reason === "string" ? b.incomplete_details.reason : "incompleta") : null
  return { ok: true, text: parts.join(""), usage, incomplete, refusal }
}
