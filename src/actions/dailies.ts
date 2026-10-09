"use server"

import { buildDailyPdf, dailyPdfFilename } from "@/lib/daily-report"
import { labels } from "@/lib/labels"
import { requireOwner, requireUser } from "@/server/access"
import { writeAudit } from "@/server/audit"
import { getDailyDetail } from "@/server/queries/dailies"
import { getThresholds } from "@/server/queries/thresholds"
import { activeWatchForReport } from "@/server/queries/watch"
import type { ActionResult } from "@/lib/validators/fields"
import { memberIdOf, runAction } from "@/server/action-runner"
import { createDailyRecord, updateDailyRecord, type DailyResult } from "@/server/dailies"

/**
 * Server Action da daily: requireOwner → núcleo em src/server/dailies.ts
 * (zod + uma transação com daily, participantes, checkins, combinados,
 * timeline e auditoria) → revalidate.
 */
export async function createDaily(input: unknown): Promise<DailyResult> {
  return runAction("dailies", async () => createDailyRecord(await requireOwner(), input), [
    "/dailies",
    "/agreements",
    ["/team", "layout"],
  ])
}

/** Edição de daily salva: resumo, decisões, presença e notas. */
export async function updateDaily(input: unknown): Promise<ActionResult> {
  const id = memberIdOf(input, "id")
  return runAction("dailies", async () => updateDailyRecord(await requireOwner(), input), [
    "/dailies",
    `/dailies/${id}`,
    ["/team", "layout"],
  ])
}

export type DailyPdfResult = { ok: true; filename: string; base64: string } | { ok: false; error: string }

/**
 * PDF da daily (leitura): gerado no servidor com as observações ativas que
 * quem pede pode ler. Não muda nada, mas a exportação é auditada — o arquivo
 * pode conter observação privada e sai do sistema.
 */
export async function exportDailyPdf(dailyId: unknown): Promise<DailyPdfResult> {
  const user = await requireUser()
  const id = typeof dailyId === "string" ? dailyId : ""
  const daily = id ? await getDailyDetail(user, id) : null
  if (!daily) return { ok: false, error: labels.dailies.pdf.failed }
  const watch = await activeWatchForReport(user, await getThresholds(user))
  const bytes = buildDailyPdf(daily, watch)
  await writeAudit(
    {
      action: "daily.export.pdf",
      entity: "Daily",
      entityId: daily.id,
      after: { watchItems: watch.length, privateWatchItems: watch.filter((w) => w.visibility === "PRIVATE").length },
    },
    { organizationId: user.organizationId, userId: user.id },
  )
  return { ok: true, filename: dailyPdfFilename(daily.date), base64: Buffer.from(bytes).toString("base64") }
}
