import { randomBytes } from "node:crypto"

import bcrypt from "bcryptjs"

/** bcryptjs, puro JS (sem binário nativo), cost 12 (CLAUDE.md). */
export const BCRYPT_COST = 12

/**
 * Hash fixo e descartável (de um segredo aleatório que ninguém conhece). Quando
 * o e-mail não existe, a senha é comparada contra ele: o tempo de resposta fica
 * igual ao de uma conta real e não vaza quais contas existem.
 */
export const DUMMY_HASH = "$2b$12$we2h6UoAmZhy7Q0FFWVCR.BPdYQ4.vQc1fZB.xSqhYnraw.dHknji"

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/** Senha aleatória de 20 caracteres (120 bits), segura para copiar do terminal. */
export function generatePassword(): string {
  return randomBytes(15).toString("base64url")
}
