"use client"

import * as React from "react"
import { useForm } from "react-hook-form"

import { createAgreement } from "@/actions/agreements"
import { Button } from "@/components/ui/button"
import { WatchButton } from "@/components/watch/watch-button"
import { CentralCombobox, type CentralOption } from "@/components/ui/CentralCombobox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatDate, maskDateInput, todayBusinessDate } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import {
  AGREEMENT_ORIGINS,
  AGREEMENT_PRIORITIES,
  createAgreementSchema,
  type CreateAgreementInput,
} from "@/lib/validators/agreement"

import { applyFieldErrors, DisclosureToggle, FormError, zodResolver } from "./form-kit"
import type { RecordTarget } from "./note-dialog"

const L = labels.forms.agreement
const FIELDS = ["memberId", "title", "dueDate", "description", "priority", "origin", "centralId"] as const

/**
 * Criação rápida de combinado. Obrigatórios: título, responsável e prazo.
 * Aberto do perfil, o responsável já vem preenchido; de qualquer outro lugar
 * (atalho C, /agreements), escolhe-se no select — que aceita digitar a
 * inicial do nome. Enter salva; Ctrl/⌘+Enter salva e reabre em branco, para
 * lançar vários seguidos. Origem pré-preenchida pelo contexto.
 * Ordem do teclado: título → responsável → central (opcional) → prazo → Enter. O prazo nasce com
 * hoje (D28) e continua editável e obrigatório.
 */
export function AgreementDialog({
  open,
  onOpenChange,
  member,
  members = [],
  centrals = [],
  origin = "MANAGER",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Responsável fixo (perfil). Sem ele, o dialog oferece `members`. */
  member?: RecordTarget
  members?: { id: string; preferredName: string }[]
  /** Centrais ativas (P19). */
  /** Centrais ativas (P19); null com o módulo de centrais desligado no time (D32). */
  centrals?: CentralOption[] | null
  origin?: CreateAgreementInput["origin"]
}) {
  const defaults = React.useCallback(
    (): CreateAgreementInput => ({
      memberId: member?.id ?? "",
      title: "",
      // Prazo nasce HOJE (D28); calculado a cada abertura, não na montagem.
      dueDate: formatDate(todayBusinessDate(), "business"),
      description: "",
      priority: "NORMAL",
      origin,
      centralId: "",
    }),
    [member?.id, origin],
  )
  const form = useForm<CreateAgreementInput>({ resolver: zodResolver(createAgreementSchema), defaultValues: defaults() })
  const [showDetails, setShowDetails] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [savedNotice, setSavedNotice] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const another = React.useRef(false)
  // P21: observação marcada antes de salvar (ligada ao combinado ao salvar).
  const [watchIds, setWatchIds] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!open) return
    form.reset(defaults())
    setWatchIds([])
    setShowDetails(false)
    setFormError(null)
    setSavedNotice(false)
  }, [open, defaults, form])

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    const keepOpen = another.current
    another.current = false
    startTransition(async () => {
      const result = await createAgreement({ ...values, watchIds })
      if (result.ok) {
        if (!keepOpen) return onOpenChange(false)
        form.reset(defaults())
        setSavedNotice(true)
        // Depois do re-render do reset; antes dele o foco voltaria ao campo que disparou o atalho.
        requestAnimationFrame(() => form.setFocus("title"))
        return
      }
      setFormError(result.error)
      applyFieldErrors(result.fieldErrors, FIELDS, form.setError)
    })
  })

  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      another.current = true
      void onSubmit()
    }
  }

  const err = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto"
        // Foco inicial no campo principal sem autoFocus: com autoFocus o Radix
        // registra o próprio campo como origem e não devolve o foco ao botão.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          form.setFocus("title")
        }}
      >
        <DialogHeader>
          <DialogTitle>{L.title}</DialogTitle>
          <DialogDescription>
            {member ? fill(L.description, { name: member.preferredName }) : L.descriptionGeneral}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} onKeyDown={onKeyDown} className="flex flex-col gap-4" noValidate>
          <FieldGroup label={L.agreementTitle} error={err.title?.message} required>
            <Input autoComplete="off" {...form.register("title", { onChange: () => setSavedNotice(false) })} />
          </FieldGroup>
          <div className={member ? "grid gap-4 sm:grid-cols-[1fr_140px]" : "grid gap-4 sm:grid-cols-[1fr_1fr_140px]"}>
            {member ? null : (
              <FieldGroup label={L.member} error={err.memberId?.message} required>
                {(control) => (
                  <Select
                    value={form.watch("memberId")}
                    onValueChange={(v) => form.setValue("memberId", v, { shouldValidate: form.formState.isSubmitted })}
                  >
                    <SelectTrigger {...control} className="w-full">
                      <SelectValue placeholder={L.memberPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.preferredName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FieldGroup>
            )}
            {/* Central (P19): triagem, visível de cara e opcional. Sem o módulo no time (D32), não existe. */}
            {centrals ? (
              <FieldGroup label={labels.centrals.field} error={err.centralId?.message}>
                {(control) => (
                  <CentralCombobox
                    {...control}
                    options={centrals}
                    value={form.watch("centralId") || null}
                    onValueChange={(id) => form.setValue("centralId", id ?? "")}
                  />
                )}
              </FieldGroup>
            ) : null}
            <FieldGroup label={L.dueDate} error={err.dueDate?.message} required>
              <Input
                inputMode="numeric"
                placeholder={labels.forms.datePlaceholder}
                autoComplete="off"
                className="font-mono"
                {...form.register("dueDate", { onChange: (e) => form.setValue("dueDate", maskDateInput(e.target.value)) })}
              />
            </FieldGroup>
          </div>

          <DisclosureToggle open={showDetails} onToggle={() => setShowDetails((v) => !v)} />
          {showDetails ? (
            <div className="flex flex-col gap-4">
              <FieldGroup label={L.details} error={err.description?.message}>
                <Textarea rows={2} {...form.register("description")} />
              </FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldGroup label={L.priority}>
                  {(control) => (
                    <Select
                      value={form.watch("priority")}
                      onValueChange={(v) => form.setValue("priority", v as CreateAgreementInput["priority"])}
                    >
                      <SelectTrigger {...control} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AGREEMENT_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {enumLabel("agreementPriority", p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FieldGroup>
                <FieldGroup label={L.origin}>
                  {(control) => (
                    <Select
                      value={form.watch("origin")}
                      onValueChange={(v) => form.setValue("origin", v as CreateAgreementInput["origin"])}
                    >
                      <SelectTrigger {...control} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AGREEMENT_ORIGINS.map((o) => (
                          <SelectItem key={o} value={o}>
                            {enumLabel("agreementOrigin", o)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FieldGroup>
              </div>
            </div>
          ) : null}

          {savedNotice ? (
            <p role="status" className="text-xs text-ink-secondary">
              {L.savedAnother}
            </p>
          ) : null}
          <FormError message={formError} />
          <DialogFooter className="items-center sm:justify-between">
            <WatchButton
              className="mr-auto"
              origin="AGREEMENT"
              defaults={{ title: form.watch("title"), heat: "MEDIUM" }}
              link={member ? { memberId: member.id } : form.watch("memberId") ? { memberId: form.watch("memberId") } : {}}
              pendingHint={labels.watch.button.pendingRecord}
              onCreated={(id) => setWatchIds((ids) => [...ids, id])}
            />
            <p className="font-mono text-2xs text-ink-secondary max-sm:hidden">{L.shortcut}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
                {labels.common.cancel}
              </Button>
              <Button type="submit" loading={pending}>
                {L.submit}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
