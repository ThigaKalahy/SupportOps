"use client"

import * as React from "react"

import { DEFAULT_THRESHOLDS, type AlertThresholds } from "@/lib/alert-thresholds"

/**
 * Limiares do motor de alertas para componentes de cliente (ex.: o selo
 * "arrastado Nx" a partir do limiar de crônico). O shell recebe os valores do
 * servidor; fora dele (ex.: /ui-lab), valem os padrões.
 */
const ThresholdsContext = React.createContext<AlertThresholds>(DEFAULT_THRESHOLDS)

export function ThresholdsProvider({ value, children }: { value: AlertThresholds; children: React.ReactNode }) {
  return <ThresholdsContext value={value}>{children}</ThresholdsContext>
}

export function useThresholds(): AlertThresholds {
  return React.useContext(ThresholdsContext)
}
