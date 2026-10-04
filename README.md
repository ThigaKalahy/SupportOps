# Prontuário

Sistema interno de gestão de time de suporte: registros datados (dailies, 1:1, feedbacks, combinados, desenvolvimento), timeline por pessoa e motor de alertas. Uso restrito a dois papéis — gestor (`OWNER`) e superior com leitura (`VIEWER`). Sem cliente externo, sem endpoint público.

Para decisões de produto, arquitetura e regras de negócio, ver [CLAUDE.md](CLAUDE.md). Para sistema visual, ver [DESIGN.md](DESIGN.md).

## Stack

- Next.js 15 (App Router) + TypeScript `strict`
- Tailwind CSS v4, shadcn/ui (Radix) com tokens reescritos
- Prisma 6 + PostgreSQL (Neon, `aws-sa-east-1`)
- Auth.js v5 — provider Credentials (e-mail + senha, sessão JWT de 7 dias), bcryptjs cost 12
- react-hook-form + zod
- date-fns (`pt-BR`, TZ `America/Sao_Paulo`)
- Deploy: Vercel (`gru1`)
- pnpm, Node 20 LTS+

## Instalação

```
pnpm install
```

Copie o `.env.example` para `.env.local` e preencha. O `.env.local` é ignorado pelo git; o `.env.example` (sem valores) é a referência de todas as variáveis.

## Variáveis de ambiente

```
DATABASE_URL=            # Neon, connection string com pooler
DIRECT_URL=              # Neon, conexão direta — usada por prisma migrate
AUTH_SECRET=             # openssl rand -base64 32
AUTH_URL=                # http://localhost:3000 em dev
ALLOWED_EMAILS=          # e-mails que podem entrar, separados por vírgula — kill switch
DEFAULT_ORG_SLUG=suporte
TZ=America/Sao_Paulo
```

O `.env.local` é o arquivo de ambiente (padrão do Next). Os scripts `db:*`, `user:*`, `test` e o seed o leem com `node --env-file=.env.local`.

`AUTH_SECRET` precisa ser um valor aleatório real — gere com:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Usuários

Não existe cadastro público, convite nem recuperação de senha por e-mail. A única forma de criar usuário ou trocar senha é pela CLI:

```
pnpm user:create         # pergunta e-mail, nome e papel (OWNER ou VIEWER)
pnpm user:password       # gera nova senha para um e-mail existente e desbloqueia a conta
```

Os dois geram uma senha aleatória, mostram **uma única vez** no terminal e gravam só o hash. Guarde no gerenciador de senhas. Ambos registram a operação no AuditLog.

- O e-mail precisa estar em `ALLOWED_EMAILS` para entrar. Tirar um e-mail da variável revoga o acesso na hora, inclusive de sessões abertas.
- 5 senhas erradas seguidas bloqueiam a conta por 15 minutos. `pnpm user:password` desbloqueia.
- O seed cria o OWNER com o primeiro e-mail de `ALLOWED_EMAILS`, sem senha: defina com `pnpm user:password`.

Papéis: `OWNER` (leitura e escrita), `VIEWER` (só leitura; nunca vê registro privado). `MANAGER` é reservado.

## Banco de dados

PostgreSQL via Neon, região `aws-sa-east-1` (São Paulo) — dados de pessoas permanecem no Brasil. Crie dois branches no Neon: `main` e `dev`.

```
pnpm db:push             # sincronizar schema.prisma em dev, sem gerar migration
pnpm db:migrate          # criar e aplicar migration
pnpm db:seed             # popular dados de demonstração (9 pessoas, ~6 meses de histórico)
pnpm db:studio           # inspecionar dados
```

Em produção (build da Vercel): `prisma migrate deploy && next build` (ver "Deploy na Vercel").

A migration `full_text_search` usa a extensão `unaccent` do Postgres (busca sem acento). No Neon ela já vem disponível; num Postgres próprio, o usuário da migration precisa de permissão para `CREATE EXTENSION`.

## Execução local

```
pnpm dev
```

Aplicação em `http://localhost:3000`. Requer `.env.local` preenchido e schema já sincronizado (`pnpm db:push` ou `pnpm db:migrate`).

## Build e testes

```
pnpm build
pnpm lint && pnpm typecheck
pnpm test                # node:test; parte dos testes lê o banco com os dados do seed
```

## Estrutura geral

```
prisma/            schema, migrations, seed
src/app/           rotas (App Router), grupos (auth) e (app)
src/components/    ui (primitivos), shell, timeline, member, forms
src/server/        db, auth, timeline.ts, alerts.ts, audit.ts, queries/
src/actions/       Server Actions por domínio
src/lib/           labels.ts (pt-BR), dates.ts, severity.ts, validators/
```

Estrutura completa e regras de cada diretório em [CLAUDE.md](CLAUDE.md#estrutura-de-diretórios).


## Deploy na Vercel

O `vercel.json` já define o build e a região:

- **Build**: `pnpm exec prisma migrate deploy && pnpm exec next build` — aplica as migrations pendentes no banco de produção antes do build. O Prisma lê as variáveis direto do ambiente da Vercel (lá não existe `.env.local`).
- **Região das funções**: `gru1` (São Paulo), perto do banco em `aws-sa-east-1`.

Passo a passo (uma vez):

1. Importe o repositório em vercel.com → *Add New → Project*. Framework: Next.js (detectado). Deixe os comandos como estão: o `vercel.json` manda.
2. *Settings → Environment Variables*: cadastre `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` (um valor novo, diferente do de desenvolvimento), `ALLOWED_EMAILS` e `DEFAULT_ORG_SLUG` para *Production* e *Preview*. **Não** defina `AUTH_URL` nem `TZ` na Vercel.
3. Os previews usam o mesmo banco? Prefira apontar *Preview* para o branch `dev` do Neon (outra `DATABASE_URL`/`DIRECT_URL`), para um preview nunca migrar o banco de produção.
4. *Settings → Deployment Protection*: **Vercel Authentication**, escopo **Standard Protection**. Fecha as URLs de preview, que carregam dados de seed com nomes e feedbacks. O domínio de produção continua público no plano Hobby — quem o protege é a tela de login (allowlist + senha + bloqueio após 5 tentativas).
5. Depois do primeiro deploy: crie as contas com `pnpm user:create` / `pnpm user:password` apontando o `.env.local` para o banco de produção, e confira que `/ui-lab` responde 404 no domínio de produção (ele só existe em desenvolvimento).

Revogar acesso: tire o e-mail de `ALLOWED_EMAILS` na Vercel e faça *Redeploy* — sessões abertas caem na próxima requisição.

## Backup

Backup semanal com `pg_dump`, em formato custom, para `backups/prontuario-DD-MM-AAAA.dump` (pasta ignorada pelo git — contém dados de pessoas):

```
pnpm db:backup                  # usa DIRECT_URL do .env.local
pnpm db:backup D:\Backups       # outra pasta de destino
```

Requer o cliente do PostgreSQL **18 ou mais novo** (o Neon roda Postgres 18) com `pg_dump` no PATH — no Windows, o instalador do PostgreSQL com a opção *Command Line Tools*.

Agendar toda segunda às 8h (Windows, Agendador de Tarefas):

```
schtasks /Create /SC WEEKLY /D MON /ST 08:00 /TN "Prontuario backup" /TR "cmd /c cd /d C:\caminho\do\projeto && pnpm db:backup"
```

No macOS/Linux, `crontab -e`: `0 8 * * 1 cd /caminho/do/projeto && pnpm db:backup`.

Restaurar num banco vazio (ex.: um branch novo do Neon):

```
pg_restore --clean --if-exists --no-owner -d "<DIRECT_URL do destino>" backups/prontuario-DD-MM-AAAA.dump
```

Guarde os arquivos fora do computador (pasta criptografada ou cofre da empresa) e teste uma restauração de vez em quando. O Neon também tem restauração por ponto no tempo dentro da janela do plano — o `pg_dump` semanal é a cópia que fica com você.

## Celular

Uso secundário: leitura antes de reunião e captura simples. No iPhone, Safari → Compartilhar → *Adicionar à Tela de Início* cria o atalho (manifest e ícone prontos). Não há service worker, cache offline nem sincronização: o atalho abre o site normal e pede login como sempre. Daily e 1:1 funcionam no celular, com aviso de que a experiência é melhor no computador.
