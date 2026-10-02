"use client"

import * as React from "react"
import { CheckIcon, EllipsisIcon, PencilIcon } from "lucide-react"

import { CancelAgreementDialog } from "@/components/agreements/cancel-agreement-dialog"
import { CompleteAgreementDialog } from "@/components/agreements/complete-agreement-dialog"
import { EditAgreementDialog } from "@/components/agreements/edit-agreement-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { labels } from "@/lib/labels"
import type { EditAgreementInput } from "@/lib/validators/agreement"

const A = labels.agreements

/**
 * Ações do detalhe de um combinado. Aberto: concluir é a ação primária;
 * editar e cancelar ficam no menu. Encerrado: só editar o texto.
 */
export function AgreementActions({ agreement, open }: { agreement: EditAgreementInput; open: boolean }) {
  const [dialog, setDialog] = React.useState<"complete" | "edit" | "cancel" | null>(null)
  const target = { id: agreement.id, title: agreement.title }
  const close = (next: boolean) => !next && setDialog(null)

  return (
    <>
      {open ? (
        <>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={A.rowActions}>
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog("edit")}>{A.edit}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("cancel")} className="text-overdue focus:text-overdue">
                {A.cancel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => setDialog("complete")}>
            <CheckIcon />
            {A.complete}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setDialog("edit")}>
          <PencilIcon />
          {A.edit}
        </Button>
      )}
      <CompleteAgreementDialog agreement={dialog === "complete" ? target : null} onOpenChange={close} />
      <CancelAgreementDialog agreement={dialog === "cancel" ? target : null} onOpenChange={close} />
      <EditAgreementDialog agreement={agreement} open={dialog === "edit"} onOpenChange={close} />
    </>
  )
}
