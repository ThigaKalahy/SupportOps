/**
 * Férias (C4). "De férias no dia D" é derivado — início <= D <= fim — e nunca
 * persistido (D9): no dia seguinte ao fim a pessoa volta a ficar disponível sem
 * ninguém mexer em nada. Um filtro só, usado por toda leitura que precisa saber.
 */

/** `where` de MemberVacation para "cobre o dia" (teamId explícito: D31, D36). */
export function vacationCovering(teamId: string, day: Date) {
  return { teamId, startDate: { lte: day }, endDate: { gte: day } }
}
