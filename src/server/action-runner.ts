import { revalidatePath } from "next/cache"

import { labels } from "@/lib/labels"
import type { ActionResult } from "@/lib/validators/fields"

import { ForbiddenError } from "./access"

/**
 * Casca comum das Server Actions de formulário: executa o núcleo, revalida as
 * rotas afetadas quando dá certo e transforma falha inesperada em erro
 * genérico em pt-BR (o detalhe vai para o log do servidor, nunca para a tela).
 *
 * `paths`: rota simples ou [rota, "layout"] para revalidar a rota e as filhas
 * (ex.: o perfil e todas as abas dele).
 */
export async function runAction<R extends ActionResult | { ok: true; id: string }>(
  scope: string,
  write: () => Promise<R>,
  paths: (string | [string, "layout"])[],
): Promise<R | Extract<ActionResult, { ok: false }>> {
  try {
    const result = await write()
    if (result.ok) {
      for (const path of paths) {
        if (typeof path === "string") revalidatePath(path)
        else revalidatePath(path[0], path[1])
      }
    }
    return result
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message }
    console.error(`[${scope}] falha ao salvar`, error)
    return { ok: false, error: labels.validation.generic }
  }
}

/** Id da pessoa no input (para revalidar o perfil), sem confiar no formato. */
export function memberIdOf(input: unknown, key = "memberId"): string {
  if (typeof input !== "object" || input === null || !(key in input)) return ""
  const value = (input as Record<string, unknown>)[key]
  return typeof value === "string" ? value : ""
}
