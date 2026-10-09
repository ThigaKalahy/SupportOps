"use client"

import * as React from "react"
import { FileDownIcon } from "lucide-react"

import { exportDailyPdf } from "@/actions/dailies"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { labels } from "@/lib/labels"

const P = labels.dailies.pdf

/** Entrega bytes ao navegador como download, sem abrir janela nem diálogo. */
function saveFile(base64: string, filename: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * "Baixar PDF" da daily salva: o servidor monta o arquivo (src/lib/daily-report.ts)
 * com as observações ativas que quem pede pode ler, e o navegador baixa
 * `daily-DD-MM-AAAA.pdf`. Falha vira aviso passageiro na página.
 */
export function DownloadDailyPdfButton({
  dailyId,
  size = "sm",
  variant = "secondary",
}: {
  dailyId: string
  size?: "sm" | "default"
  variant?: "secondary" | "ghost"
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await exportDailyPdf(dailyId)
          if (result.ok) saveFile(result.base64, result.filename)
          else toast.show(result.error, { tone: "neutral" })
        })
      }
    >
      {pending ? null : <FileDownIcon />}
      {pending ? P.downloading : P.download}
    </Button>
  )
}
