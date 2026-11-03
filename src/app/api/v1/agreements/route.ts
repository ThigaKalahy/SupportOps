import type { AgreementStatus } from "@prisma/client"

import { formatDate, todayBusinessDate } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import { ALL_MEMBERS } from "@/lib/validators/agreement"
import { createAgreementRecord } from "@/server/agreements"
import { fromResult, handleApi, isoToDisplay, json, readJson } from "@/server/api-route"
import { getAgreementForApi, listAgreementsForApi, resolveMemberForApi } from "@/server/queries/api"

/**
 * C22 — API de combinados (exceção à D8): GET lista, POST cria. Autenticação pela chave do
 * time (`Authorization: Bearer mo_…`); a chave age em nome do dono. Documentação em docs/api.md.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATUSES: readonly AgreementStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]
const A = labels.api

export async function GET(request: Request) {
  return handleApi(request, async (ctx) => {
    const params = new URL(request.url).searchParams
    const status = params.get("status")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) ?? []
    if (status.some((s) => !STATUSES.includes(s as AgreementStatus))) return json(400, { error: fill(A.invalidQuery, { name: "status" }) })
    const limit = Number(params.get("limit") ?? 100)
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return json(400, { error: fill(A.invalidQuery, { name: "limit" }) })
    const since = params.get("updatedSince")
    const updatedSince = since ? new Date(since) : undefined
    if (updatedSince && Number.isNaN(updatedSince.getTime())) return json(400, { error: fill(A.invalidQuery, { name: "updatedSince" }) })
    // A pessoa pelo memberId OU pelo memberEmail.
    const member = await resolveMemberForApi(ctx, params.get("memberId"), params.get("memberEmail"))
    if (!member.ok) return json(404, { error: member.error })
    const result = await listAgreementsForApi(ctx, {
      status: status as AgreementStatus[],
      memberId: member.memberId,
      updatedSince,
      limit,
      cursor: params.get("cursor") ?? undefined,
    })
    return json(200, result)
  })
}

export async function POST(request: Request) {
  return handleApi(request, async (ctx) => {
    const body = await readJson(request)
    if (!body) return json(400, { error: A.invalidJson })
    if (body.memberId === ALL_MEMBERS) return json(422, { error: A.allMembersNotAllowed })
    // A pessoa pelo memberId OU pelo memberEmail (basta um dos dois).
    const member = await resolveMemberForApi(ctx, body.memberId, body.memberEmail)
    if (!member.ok) return json(422, { error: member.error, fieldErrors: { memberEmail: member.error } })
    const result = await createAgreementRecord(ctx, {
      memberId: member.memberId ?? "",
      title: typeof body.title === "string" ? body.title : "",
      // Sem prazo, hoje (D28); sábado, domingo e feriado vão para o próximo dia útil (C20).
      dueDate: body.dueDate === undefined || body.dueDate === null ? formatDate(todayBusinessDate(), "business") : isoToDisplay(body.dueDate),
      description: typeof body.description === "string" ? body.description : "",
      priority: typeof body.priority === "string" ? body.priority : "NORMAL",
      origin: "API",
      centralId: typeof body.centralId === "string" ? body.centralId : "",
    })
    if (!result.ok) return fromResult(result, () => json(201, null))
    return json(201, await getAgreementForApi(ctx, result.ids[0]!))
  })
}
