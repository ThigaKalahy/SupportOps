import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * Marca do Manager Ops: o ícone do produto (src/app/icon.svg), o mesmo do favicon e do
 * atalho na tela inicial. Decorativa — o nome do produto vem sempre ao lado, em texto.
 */
export function ProductMark({ size = 24, className }: { size?: number; className?: string }) {
  return <Image src="/icon.svg" alt="" aria-hidden width={size} height={size} unoptimized className={cn("shrink-0", className)} />
}
