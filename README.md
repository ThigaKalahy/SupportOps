# Prontuário

Sistema interno de gestão de time de suporte: registros datados (dailies, 1:1, feedbacks, combinados, desenvolvimento), timeline por pessoa e motor de alertas. Uso restrito a dois papéis — gestor (`OWNER`) e superior com leitura (`VIEWER`). Sem cliente externo, sem endpoint público.

Para decisões de produto, arquitetura e regras de negócio, ver [CLAUDE.md](CLAUDE.md). Para sistema visual, ver [DESIGN.md](DESIGN.md).

## Stack

- Next.js 15 (App Router) + TypeScript `strict`
- Tailwind CSS v4, shadcn/ui (Radix) com tokens reescritos
- Prisma 6 + PostgreSQL (Neon, `aws-sa-east-1`)
- Auth.js v5 — provider Credentials (e-mail + senha, sessão JWT)
- react-hook-form + zod
- date-fns (`pt-BR`, TZ `America/Sao_Paulo`)
- Deploy: Vercel (`gru1`)
- pnpm, Node 20 LTS+

## Instalação

```
pnpm install
cp .env.example .env
```

Preencha o `.env` com as variáveis abaixo.

## Variáveis de ambiente

```
DATABASE_URL=            # Neon, connection string com pooler
DIRECT_URL=              # Neon, conexão direta — usada por prisma migrate
AUTH_SECRET=             # openssl rand -base64 32
AUTH_URL=                # http://localhost:3000 em dev
DEFAULT_ORG_SLUG=suporte
TZ=America/Sao_Paulo
```

Não há cadastro público nem recuperação de senha. Usuários são criados por CLI:

```
pnpm user:create         # criar usuário
pnpm user:password       # redefinir senha
```

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

## Build

```
pnpm build
pnpm lint && pnpm typecheck
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
