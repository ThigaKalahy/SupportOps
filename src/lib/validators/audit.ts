import { z } from "zod"

import { labels } from "../labels.ts"

/**
 * C23 — configuração da Auditoria de Atendimentos. O mesmo schema na tela e na action.
 * Limites de segurança no próprio schema: o piloto não passa de 5 conversas por execução
 * (ampliar exige mudar este limite no código, com validação explícita — documento do módulo,
 * seção 8) e a concorrência não passa de 3.
 */

const v = labels.validation
const C = labels.audit.config

/** Teto de conversas por execução nesta fase (piloto). Mudar aqui é decisão explícita. */
export const AUDIT_MAX_PER_RUN_CAP = 5

const int = (min: number, max: number) => z.coerce.number().int(v.generic).min(min, v.generic).max(max, v.generic)
const usd = (max: number) => z.coerce.number().min(0, v.generic).max(max, v.generic)
const price = z
  .union([z.literal(""), z.coerce.number().min(0, v.generic).max(1000, v.generic)])
  .transform((value) => (value === "" ? null : value))

export const auditConfigSchema = z.object({
  enabled: z.boolean(),
  simulation: z.boolean(),
  model: z
    .string()
    .trim()
    .min(3, v.tooShort)
    .max(60, v.tooLong)
    .regex(/^[a-z0-9][a-z0-9.\-_]*$/, C.modelInvalid),
  maxPerRun: int(1, AUDIT_MAX_PER_RUN_CAP),
  concurrency: int(1, 3),
  requestsPerMinute: int(1, 120),
  tokensPerMinute: int(1000, 2_000_000),
  maxInputTokens: int(1000, 100_000),
  maxOutputTokens: int(500, 16_000),
  monthlyBudgetUsd: usd(10_000),
  batchBudgetUsd: usd(10_000),
  inputPricePerMTok: price,
  cachedInputPricePerMTok: price,
  outputPricePerMTok: price,
  maskPersonalData: z.boolean(),
  retentionDays: int(30, 730),
})

export type AuditConfigInput = z.input<typeof auditConfigSchema>
