import { createInterface } from "node:readline"
import { stdin, stdout } from "node:process"

/** Utilitários dos scripts de CLI (user:create, user:password). */

/**
 * Faz as perguntas em sequência. Lê por iterador de linhas, que guarda o que
 * já chegou: funciona digitando no terminal e também com respostas por pipe
 * (onde todas as linhas chegam antes de a pergunta ser feita).
 */
export async function ask(questions: string[]): Promise<string[]> {
  const rl = createInterface({ input: stdin, terminal: false })
  const lines = rl[Symbol.asyncIterator]()
  const answers: string[] = []
  try {
    for (const question of questions) {
      stdout.write(question)
      const next = await lines.next()
      if (next.done) break
      answers.push(String(next.value).trim())
      if (!stdin.isTTY) stdout.write("\n")
    }
  } finally {
    rl.close()
  }
  return answers
}

/** Mostra a senha uma única vez, destacada. Ela não fica salva em lugar nenhum. */
export function printPasswordOnce(email: string, password: string): void {
  const line = "─".repeat(56)
  console.log(`\n${line}`)
  console.log(`  E-mail: ${email}`)
  console.log(`  Senha:  ${password}`)
  console.log(line)
  console.log("  Esta senha aparece só agora. Guarde no gerenciador de senhas:")
  console.log("  não existe recuperação por e-mail — só `pnpm user:password`.")
  console.log(`${line}\n`)
}

export function fail(message: string): never {
  console.error(`\nErro: ${message}\n`)
  process.exit(1)
}
