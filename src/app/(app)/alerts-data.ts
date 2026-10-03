import { cache } from "react"

import { requireUser } from "@/server/access"
import { getAlerts } from "@/server/alerts"
import { getThresholds } from "@/server/queries/thresholds"

/**
 * O motor de alertas roda uma vez por requisição: o layout (contadores da
 * sidebar) e a home (lista) usam o mesmo resultado — mesma fonte de dados.
 */
export const loadAlerts = cache(async () => getAlerts(await requireUser()))

export const loadThresholds = cache(async () => getThresholds(await requireUser()))
