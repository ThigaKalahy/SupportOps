"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"

import { CompleteAgreementDialog } from "@/components/agreements/complete-agreement-dialog"
import { Button } from "@/components/ui/button"
import { labels } from "@/lib/labels"

/** Ação primária do detalhe de um combinado aberto. */
export function CompleteAgreementButton({ agreement }: { agreement: { id: string; title: string } }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <CheckIcon />
        {labels.agreements.complete}
      </Button>
      <CompleteAgreementDialog agreement={open ? agreement : null} onOpenChange={setOpen} />
    </>
  )
}
