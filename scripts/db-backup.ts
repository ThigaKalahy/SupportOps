// Backup do banco (P18): pg_dump em formato custom para backups/prontuario-DD-MM-AAAA.dump.
// Uso: pnpm db:backup   (lê DIRECT_URL do .env.local; conexão direta, sem pooler)
// Restaurar: pg_restore --clean --if-exists --no-owner -d "<DIRECT_URL do destino>" backups/prontuario-DD-MM-AAAA.dump
//
// Requer o pg_dump instalado na mesma versão do Postgres do Neon ou mais nova
// (o Neon roda Postgres 18). Nada aqui envia o arquivo para lugar nenhum: o
// destino do backup é decisão sua (ver README, "Backup").
import { spawnSync } from "node:child_process"
import { mkdirSync, statSync } from "node:fs"
import { join } from "node:path"

const url = process.env.DIRECT_URL
if (!url) {
  console.error("DIRECT_URL não está definida no .env.local. O backup usa a conexão direta do Neon (sem pooler).")
  process.exit(1)
}

// Nome do arquivo com a data em DD-MM-AAAA (padrão brasileiro também em nome de arquivo).
const now = new Date()
const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })
  .formatToParts(now)
  .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {})
const dir = process.argv[2] ?? "backups"
const file = join(dir, `prontuario-${parts.day}-${parts.month}-${parts.year}.dump`)
mkdirSync(dir, { recursive: true })

const result = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", file, url], {
  stdio: ["ignore", "inherit", "inherit"],
})

if (result.error) {
  console.error(
    "Não foi possível executar o pg_dump. Instale o cliente do PostgreSQL 18 (ou mais novo) e garanta que o pg_dump está no PATH.",
  )
  process.exit(1)
}
if (result.status !== 0) {
  console.error(`O pg_dump terminou com erro (código ${result.status}). Nenhum backup válido foi gerado.`)
  process.exit(result.status ?? 1)
}
const size = statSync(file).size
console.log(`Backup gravado em ${file} (${new Intl.NumberFormat("pt-BR").format(Math.round(size / 1024))} KB).`)
