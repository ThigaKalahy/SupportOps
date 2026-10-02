"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { labels } from "@/lib/labels"

import { NewPlanDialog } from "./new-plan-dialog"

/** Ação primária da aba Desenvolvimento: abre o dialog de novo PDI. */
export function NewPlanButton(props: Omit<React.ComponentProps<typeof NewPlanDialog>, "open" | "onOpenChange">) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon />
        {labels.development.plans.new}
      </Button>
      <NewPlanDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  )
}
