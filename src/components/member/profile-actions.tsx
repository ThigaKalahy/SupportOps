"use client"

import * as React from "react"
import {
  EllipsisIcon,
  ListPlusIcon,
  MessageSquareTextIcon,
  NotebookPenIcon,
  PlusIcon,
  UsersRoundIcon,
} from "lucide-react"

import { AgreementDialog } from "@/components/forms/agreement-dialog"
import { FeedbackDialog } from "@/components/forms/feedback-dialog"
import { NoteDialog } from "@/components/forms/note-dialog"
import { OneOnOneDialog } from "@/components/forms/one-on-one-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { labels } from "@/lib/labels"
import type { MemberForEdit, MemberFormCatalogs } from "@/server/queries/members"

import { DeactivateMemberDialog } from "./deactivate-member-dialog"
import { MemberDialog } from "./member-dialog"

const A = labels.profile.actions

type DialogKind = "oneOnOne" | "feedback" | "agreement" | "note" | "edit" | "deactivate"

const RECORD_ACTIONS = [
  { kind: "oneOnOne", label: A.oneOnOne, icon: UsersRoundIcon },
  { kind: "feedback", label: A.feedback, icon: MessageSquareTextIcon },
  { kind: "agreement", label: A.agreement, icon: ListPlusIcon },
  { kind: "note", label: A.note, icon: NotebookPenIcon },
] as const

/**
 * Ações do cabeçalho do perfil. Cada uma abre um dialog, sem sair da página.
 * ≥ 1280px: os quatro registros como botões + "Editar cadastro" + menu (…)
 * com "Desativar". Abaixo: um botão "Registrar" com menu e o menu (…).
 * Só aparece para quem escreve.
 */
export function ProfileActions({
  member,
  catalogs,
}: {
  member: MemberForEdit
  catalogs: MemberFormCatalogs
}) {
  const [dialog, setDialog] = React.useState<DialogKind | null>(null)
  const close = (open: boolean) => !open && setDialog(null)
  const target = { id: member.id, preferredName: member.preferredName }

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 xl:flex">
          {RECORD_ACTIONS.map((action) => (
            <Button key={action.kind} variant="secondary" size="sm" onClick={() => setDialog(action.kind)}>
              <action.icon />
              {action.label}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setDialog("edit")}>
            {A.edit}
          </Button>
        </div>

        {/* modal={false}: o dialog abre logo após o menu fechar, sem travar o foco da página. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="xl:hidden">
              <PlusIcon />
              {A.record}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {RECORD_ACTIONS.map((action) => (
              <DropdownMenuItem key={action.kind} onSelect={() => setDialog(action.kind)}>
                <action.icon />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={A.more}>
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="xl:hidden" onSelect={() => setDialog("edit")}>
              {A.edit}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="xl:hidden" />
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("deactivate")}>
              {A.deactivate}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <OneOnOneDialog open={dialog === "oneOnOne"} onOpenChange={close} member={target} />
      <FeedbackDialog open={dialog === "feedback"} onOpenChange={close} member={target} />
      <AgreementDialog open={dialog === "agreement"} onOpenChange={close} member={target} />
      <NoteDialog open={dialog === "note"} onOpenChange={close} member={target} />
      {dialog === "edit" ? <MemberDialog open onOpenChange={close} catalogs={catalogs} member={member} /> : null}
      {dialog === "deactivate" ? <DeactivateMemberDialog open onOpenChange={close} member={target} /> : null}
    </>
  )
}
