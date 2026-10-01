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

Crie o `.env.local` na raiz com as variáveis abaixo. Ele é ignorado pelo git.

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

Em produção (build da Vercel): `prisma migrate deploy && next build`.

## Execução local

```
pnpm dev
```

Aplicação em `http://localhost:3000`. Requer `.env` preenchido e schema já sincronizado (`pnpm db:push` ou `pnpm db:migrate`).

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
