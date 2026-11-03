import { labels } from "@/lib/labels"
import {
  cancelAgreementRecord,
  completeAgreementRecord,
  deleteAgreementRecord,
  transferAgreementRecord,
  updateAgreementRecord,
} from "@/server/agreements"
import { fromResult, handleApi, json, readJson } from "@/server/api-route"
import { getAgreementForApi, resolveMemberForApi } from "@/server/queries/api"

/**
 * C22 — um combinado pela API: GET lê, PATCH altera, DELETE exclui (lógico). As regras são
 * as das telas, pelos mesmos núcleos: texto e prioridade se editam; trocar `memberId` é
 * TRANSFERIR (motivo obrigatório, C4); `status` DONE conclui e CANCELLED cancela (motivo
 * obrigatório); o PRAZO não muda fora da daily (D12, D17) — a API recusa.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const A = labels.api
type Params = { params: Promise<{ id: string }> }

const text = (value: unknown) => (typeof value === "string" ? value : undefined)

export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  return handleApi(request, async (ctx) => {
    const agreement = await getAgreementForApi(ctx, id)
    return agreement ? json(200, agreement) : json(404, { error: A.notFound })
  })
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  return handleApi(request, async (ctx) => {
    const body = await readJson(request)
    if (!body) return json(400, { error: A.invalidJson })
    const current = await getAgreementForApi(ctx, id)
    if (!current) return json(404, { error: A.notFound })
    if ("dueDate" in body || "originalDueDate" in body) return json(422, { error: A.dueDateNotEditable })

    const title = text(body.title)
    const description = text(body.description)
    const priority = text(body.priority)
    // Novo responsável pelo memberId OU pelo memberEmail (basta um dos dois).
    const member = "memberId" in body || "memberEmail" in body ? await resolveMemberForApi(ctx, body.memberId, body.memberEmail) : null
    if (member && !member.ok) return json(422, { error: member.error, fieldErrors: { memberEmail: member.error } })
    const memberId = member?.ok ? member.memberId : undefined
    const status = text(body.status)
    if (status !== undefined && status !== "DONE" && status !== "CANCELLED") return json(422, { error: A.invalidStatus })
    if (title === undefined && description === undefined && priority === undefined && memberId === undefined && status === undefined) {
      return json(422, { error: A.nothingToChange })
    }

    // Na ordem: texto e prioridade → responsável (transferir) → desfecho. Para no primeiro erro.
    if (title !== undefined || description !== undefined || priority !== undefined) {
      const result = await updateAgreementRecord(ctx, {
        id,
        title: title ?? current.title,
        description: description ?? current.description ?? "",
        priority: priority ?? current.priority,
      })
      if (!result.ok) return fromResult(result, () => json(200, null))
    }
    if (memberId !== undefined && memberId !== current.member.id) {
      const result = await transferAgreementRecord(ctx, { id, memberId, reason: text(body.transferReason) ?? "" })
      if (!result.ok) return fromResult(result, () => json(200, null))
    }
    if (status === "DONE") {
      const result = await completeAgreementRecord(ctx, { id, outcome: text(body.outcome) ?? "" })
      if (!result.ok) return fromResult(result, () => json(200, null))
    }
    if (status === "CANCELLED") {
      const result = await cancelAgreementRecord(ctx, { id, reason: text(body.reason) ?? "" })
      if (!result.ok) return fromResult(result, () => json(200, null))
    }
    return json(200, await getAgreementForApi(ctx, id))
  })
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params
  return handleApi(request, async (ctx) => {
    const result = await deleteAgreementRecord(ctx, { id })
    if (!result.ok) return (await getAgreementForApi(ctx, id)) ? fromResult(result, () => json(200, null)) : json(404, { error: A.notFound })
    return json(200, { id, deleted: true })
  })
}
