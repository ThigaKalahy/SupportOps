import { StatusPill } from "@/components/ui/status-pill"
import { criterionLabel } from "@/lib/audit/criteria"
import type { EvaluationResponse } from "@/lib/audit/evaluation"
import type { MaskCounts } from "@/lib/audit/mask"
import { formatDateTime } from "@/lib/dates"
import { fill, labels } from "@/lib/labels"
import type { Severity } from "@/lib/severity"
import { cn } from "@/lib/utils"
import type { AuditRunView } from "@/server/audit/queries"

const E = labels.audit.evaluation

const score = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })
const int = new Intl.NumberFormat("pt-BR")
const usd = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 })

const EVIDENCE_SEVERITY: Record<string, Severity> = { POSITIVE: "calm", IMPROVEMENT: "attention", CRITICAL: "overdue" }
const RUN_SEVERITY: Record<string, Severity> = { SUCCESS: "calm", SIMULATED: "neutral", INVALID_RESPONSE: "attention", ERROR: "overdue" }

type Assessment = {
  score: { rawPoints: number; applicableWeight: number; finalScore: number | null }
  verified: boolean[]
  reviewReasons: string[]
  masked: boolean
  maskCounts: MaskCounts
}

type RunWithScores = AuditRunView & { scores: { criterion: string; weight: number; score: number | null; applicable: boolean; justification: string }[] }

export interface AuditFeedbackView {
  id: string
  kind: keyof typeof E.feedbackKinds
  situation: string
  behavior: string
  impact: string
  suggestion: string
  positions: number[]
}

export function maskSummary(masked: boolean, counts: MaskCounts | undefined): string {
  if (!masked) return E.maskOff
  const list = Object.entries(counts ?? {}).map(([kind, n]) => `${kind} ${n}`)
  return list.length ? fill(E.masked, { list: list.join(", ") }) : E.maskedNone
}

const MessageLink = ({ position }: { position: number }) => (
  <a href={`#m${position}`} className="font-mono text-xs text-ink-secondary hover:text-ink hover:underline">
    {fill(E.goTo, { position })}
  </a>
)

/** C23 Fase D — a avaliação vigente: nota com o detalhamento, evidências conferidas e feedback SCI. */
export function AuditEvaluationView({ run, feedback }: { run: RunWithScores; feedback: AuditFeedbackView[] }) {
  const response = run.response as (EvaluationResponse & { assessment?: Assessment }) | null
  if (!response) return null
  const assessment = response.assessment
  const final = assessment?.score.finalScore ?? null

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-2xl text-ink">{final === null ? E.noScore : score.format(final)}</span>
        {assessment && final !== null ? (
          <span className="text-sm text-ink-secondary">{fill(E.raw, { points: score.format(assessment.score.rawPoints), weight: assessment.score.applicableWeight })}</span>
        ) : null}
        <span className="text-sm text-ink-secondary">
          {E.resolution}: {E.resolutions[response.resolution]}
        </span>
      </div>
      <p className="-mt-3 text-xs text-ink-secondary">
        {E.suggestion} {E.policy}
      </p>

      {assessment?.reviewReasons.length ? (
        <div className="rounded-lg border border-attention bg-attention-wash px-3 py-2 text-sm text-ink">
          <p className="font-medium">{E.review}</p>
          <ul className="list-disc pl-5">
            {assessment.reviewReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-ink">{E.summary}</h3>
        <p className="text-sm whitespace-pre-line text-ink">{response.summary}</p>
      </div>

      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        {run.scores.map((s) => (
          <li key={s.criterion} className="flex flex-col gap-1 px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">{criterionLabel(s.criterion)}</span>
              <span className="font-mono text-sm text-ink">{s.applicable && s.score !== null ? `${score.format(s.score)} / ${s.weight}` : E.notApplicable}</span>
            </div>
            <p className="text-sm text-ink-secondary">{s.justification}</p>
          </li>
        ))}
      </ul>

      {response.evidences.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink">{E.evidences}</h3>
          <ul className="flex flex-col gap-2">
            {response.evidences.map((e, i) => {
              const verified = assessment?.verified[i] ?? false
              return (
                <li key={i} className={cn("flex flex-col gap-1 rounded-lg border px-3 py-2", verified ? "border-line bg-surface" : "border-dashed border-line bg-surface-sunken")}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StatusPill severity={EVIDENCE_SEVERITY[e.kind] ?? "neutral"} label={E.evidenceKinds[e.kind]} />
                    {e.criterion ? <span className="text-xs text-ink-secondary">{criterionLabel(e.criterion)}</span> : null}
                    <MessageLink position={e.messagePosition} />
                    <span className={cn("text-xs", verified ? "text-ink-secondary" : "text-attention")}>{verified ? E.verified : E.unverified}</span>
                  </div>
                  <blockquote className="border-l-2 border-line pl-2 text-sm text-ink italic">{e.quote}</blockquote>
                  {e.note ? <p className="text-sm text-ink-secondary">{e.note}</p> : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {response.developmentGuidance.length ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ink">{E.guidance}</h3>
          <ul className="list-disc pl-5 text-sm text-ink">
            {response.developmentGuidance.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink">{E.feedback}</h3>
          <p className="-mt-1 text-xs text-ink-secondary">{E.feedbackHint}</p>
          <ul className="flex flex-col gap-2">
            {feedback.map((f) => (
              <li key={f.id} className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <span className="text-xs font-medium text-ink-secondary">{E.feedbackKinds[f.kind]}</span>
                <p>
                  <span className="text-ink-secondary">{E.situation}: </span>
                  {f.situation}
                </p>
                <p>
                  <span className="text-ink-secondary">{E.behavior}: </span>
                  {f.behavior}
                </p>
                <p>
                  <span className="text-ink-secondary">{E.impact}: </span>
                  {f.impact}
                </p>
                <p>
                  <span className="text-ink-secondary">{E.suggestionLabel}: </span>
                  {f.suggestion}
                </p>
                {f.positions.length ? (
                  <div className="flex flex-wrap gap-x-3">
                    {f.positions.map((p) => (
                      <MessageLink key={p} position={p} />
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {assessment ? <p className="text-xs text-ink-secondary">{maskSummary(assessment.masked, assessment.maskCounts)}</p> : null}
    </div>
  )
}

/** Histórico das execuções (concluídas, simuladas, inválidas e erros), com consumo e custo. */
export function AuditRunList({ runs }: { runs: AuditRunView[] }) {
  return (
    <ul className="flex max-w-4xl flex-col divide-y divide-line rounded-lg border border-line bg-surface text-sm">
      {runs.map((r) => {
        const sim = r.status === "SIMULATED" ? (r.response as { estimatedInputTokens?: number; worstCaseCostUsd?: number | null; masked?: boolean; maskCounts?: MaskCounts } | null) : null
        return (
          <li key={r.id} className="flex flex-col gap-1 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusPill severity={RUN_SEVERITY[r.status] ?? "neutral"} label={E.runStatus[r.status]} />
              <span className="text-xs text-ink-secondary">
                {fill(E.runLine, { date: formatDateTime(r.startedAt), model: r.model, version: r.criteriaVersion, attempt: r.attempt })}
              </span>
            </div>
            {sim ? (
              <p className="text-xs text-ink-secondary">
                {sim.worstCaseCostUsd != null
                  ? fill(E.simulatedLine, { tokens: int.format(sim.estimatedInputTokens ?? 0), cost: usd.format(sim.worstCaseCostUsd) })
                  : fill(E.simulatedNoPrice, { tokens: int.format(sim.estimatedInputTokens ?? 0) })}{" "}
                {maskSummary(sim.masked ?? false, sim.maskCounts)}
              </p>
            ) : (
              <p className="font-mono text-xs text-ink-secondary">
                {fill(E.tokens, {
                  input: int.format(r.inputTokens),
                  cached: int.format(r.cachedTokens),
                  output: int.format(r.outputTokens),
                  reasoning: int.format(r.reasoningTokens),
                  cost: usd.format(r.costUsd),
                  seconds: score.format(r.durationMs / 1000),
                })}
              </p>
            )}
            {r.error ? <p className="text-xs text-overdue">{r.error}</p> : null}
          </li>
        )
      })}
    </ul>
  )
}
