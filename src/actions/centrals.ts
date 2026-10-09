"use server"

import { requireOwner } from "@/server/access"
import { runAction } from "@/server/action-runner"
import { ensureCentralRecord, importCentralsRecord } from "@/server/centrals"

/**
 * Server Actions de Central (P19): criar pelo nome digitado no combobox
 * (devolve a existente quando o slug já existe) e importar por colagem.
 */

const PATHS: (string | [string, "layout"])[] = [["/settings", "layout"], "/dailies/new", "/priority-validations", "/agreements"]

/**
 * Sem revalidar: a action roda no meio de um formulário (daily, validação) e
 * revalidar a rota atual recarregaria as props dele. O combobox guarda a
 * central nova localmente; as páginas são dinâmicas e leem a lista na próxima visita.
 */
export async function ensureCentral(input: unknown) {
  return runAction("centrals", async () => ensureCentralRecord(await requireOwner(), input), [])
}

export async function importCentrals(input: unknown) {
  return runAction("centrals", async () => importCentralsRecord(await requireOwner(), input), PATHS)
}
