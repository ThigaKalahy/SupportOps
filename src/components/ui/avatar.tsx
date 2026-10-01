"use client"

import * as React from "react"
import { Avatar as AvatarPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** Avatar: único elemento do produto com rounded-full (DESIGN.md). */
function Avatar({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: "default" | "sm" | "lg"
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full border border-line select-none data-[size=lg]:size-10 data-[size=sm]:size-6",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image data-slot="avatar-image" className={cn("aspect-square size-full object-cover", className)} {...props} />
  )
}

function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center bg-surface-sunken text-xs font-medium text-ink-secondary in-data-[size=sm]:text-2xs",
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn("flex -space-x-1.5 *:data-[slot=avatar]:border-2 *:data-[slot=avatar]:border-surface", className)}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup }
