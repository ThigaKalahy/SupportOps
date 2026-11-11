/**
 * C25 — gestores recebem combinados (decisão do usuário em 11/11/2026, todos os times).
 *
 * O combinado aponta para uma linha de TeamMember (`Agreement.memberId`). Para o gestor
 * poder ser responsável sem virar pessoa do time (D1), cada gestor do time ganha um "lugar
 * de gestor": TeamMember com `managerUserId` preenchido. O cliente `db` esconde esses lugares
 * de TODA leitura de TeamMember (Equipe, presença da daily, alertas de 1:1 e silêncio, PDI,
 * cumprimento do time, busca, portal), a não ser que a leitura peça de propósito, com
 * `withManagerSeats` — só onde se escolhe ou confere o responsável de um combinado.
 */

/** Acrescente ao `where` de uma leitura de TeamMember para incluir os lugares de gestor. */
export const withManagerSeats = { managerUserId: undefined } as const

/** Só os lugares de gestor. */
export const onlyManagerSeats = { managerUserId: { not: null } } as const

/** Primeiro nome, para o nome curto do lugar de gestor (como o `preferredName` das pessoas). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}
