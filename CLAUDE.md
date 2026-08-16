# CLAUDE.md — Prontuário

Instruções de projeto para sessões de Claude Code. Leia por completo antes de qualquer alteração. Este arquivo tem precedência sobre convenções genéricas.

## Visão do produto

Prontuário é o sistema de gestão de um time de suporte com 9 analistas. A metáfora é o registro clínico e o livro-razão, não um dashboard de BI: entrada datada, calha de margem, régua temporal, escala de severidade. Serve duas pessoas — o gestor (`OWNER`) que registra, e o superior dele (`VIEWER`) que lê o que for compartilhado. Não há cliente externo, não há usuário anônimo, não há endpoint público. O produto existe para responder uma pergunta todo dia: "quem precisa da minha atenção hoje?" — respondida pelo motor de alertas em `src/server/alerts.ts`. Tudo que não serve a essa pergunta ou ao registro histórico é escopo fora do MVP.

## Documentos do projeto

Precedência em caso de conflito: CLAUDE.md > PLANO-TECNICO.md > PROMPTS-CLAUDE-CODE.md.

- CLAUDE.md — este arquivo. Governa tudo. Atualizado ao final de cada fase.
- PLANO-TECNICO.md — fonte de verdade sobre modelo de dados, escopo e riscos. SOMENTE LEITURA.
- PROMPTS-CLAUDE-CODE.md — especificação da fase corrente. SOMENTE LEITURA.
- DESIGN.md e .claude/skills/ui-prontuario/SKILL.md — governam tudo que é visual.

Se uma fase de PROMPTS-CLAUDE-CODE.md contradisser uma decisão travada deste arquivo, a decisão travada vence e você para para perguntar.

## Princípios do projeto

- **Métrica não é avaliação.** Indicadores operacionais (`MetricResult`) nunca escrevem em `TimelineEvent`, nunca alteram `MemberTrait`, nunca aparecem na mesma superfície de um feedback. Ver D5 e seção "Métricas e score".
- **Sem vigilância, sem gamificação.** Sem ranking, sem nota pública, sem score calculado no MVP (D5, D7). Se um dia o time ver esta ferramenta, ela precisa sobreviver à leitura deles.
- **Todo score é explicável.** Quando o cálculo existir, `ScoreResultComponent` guarda o breakdown — nenhum número sem os indicadores e pesos que o formaram.
- **Privacidade combate a autocensura, não a substitui.** `visibility: PRIVATE | SHARED` existe desde a primeira migration. Padrão privado. Sem isso o gestor se autocensura e o produto perde a função.
- **Sem overengineering para dois usuários.** Sem REST público, sem tRPC, sem Redux, sem microserviços, sem camada de abstração especulativa. Ganhos de performance ou flexibilidade que só importam em escala não importam aqui.
- **Fricção de registro mata o produto.** Se lançar uma daily custa mais de 30 segundos, o sistema é abandonado em três semanas. Captura rápida, formulário enxuto e salvamento parcial são requisito de aceite, não polimento.
- **Escopo travado por fase.** Revisão de diff a cada fase, commit por fase. Nenhuma decisão da seção "Decisões que não devem ser alteradas silenciosamente" muda sem confirmação explícita do usuário.
- **Número sem cobertura é mentira.** `MetricResult.sampleSize` é obrigatório e nenhuma métrica pode ser exibida sem a cobertura ao lado. CSAT de 4,8 com 6 avaliações não é CSAT de 4,8. Vale igualmente para qualquer indicador derivado.

## Stack

| Camada | Escolha | Nota |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Components por padrão |
| Linguagem | TypeScript `strict: true` | `noUncheckedIndexedAccess` ligado |
| Estilo | Tailwind CSS v4 | Tokens via `@theme` em CSS, não em `tailwind.config` |
| Componentes | shadcn/ui (Radix) — tokens reescritos | Radix dá acessibilidade de graça; visual padrão substituído por completo |
| Ícones | Lucide, stroke 1.5, 16px | Nunca ícone acima de 20px na UI |
| ORM | Prisma 6 | Schema legível, ~25 tabelas, muitos relacionamentos opcionais |
| Banco | PostgreSQL — Neon, região `aws-sa-east-1` (São Paulo) | Dados de pessoas permanecem no Brasil |
| Auth | Auth.js v5 (NextAuth) + Google OAuth | Alternativa: magic link via Resend |
| Formulários | react-hook-form + zod | Schema zod compartilhado entre client e Server Action |
| Datas | date-fns + `date-fns/locale/pt-BR`, TZ `America/Sao_Paulo` | Datas de negócio `@db.Date`, timestamps `timestamptz` |
| Deploy | Vercel | Região de função `gru1` se o plano permitir |
| Package manager | pnpm | |
| Node | 20 LTS ou superior | |

Explicitamente fora: Redux, tRPC, microserviços, GraphQL, Storybook, monorepo, testes E2E no MVP, Sentry no MVP, upload de arquivo no MVP, integração com helpdesk no MVP.

## Arquitetura e fluxo de dados

Server Components por padrão. Toda leitura de dados acontece no servidor, direto em `src/server/queries/`. Toda escrita passa por uma Server Action em `src/actions/`, uma por domínio — nunca por rota de API pública, nunca por tRPC (D8).

Fluxo de uma escrita:

1. Client component chama a Server Action (form ou `useTransition`).
2. A action valida o input com o schema zod de `src/lib/validators/` — o mesmo schema usado no `react-hook-form` do client.
3. A action escreve na tabela concreta e, quando o registro entra na timeline, a `TimelineEvent` correspondente — ambas na mesma `prisma.$transaction`.
4. A action grava o `AuditLog` da operação.
5. `revalidatePath`/`revalidateTag` no que precisa reidratar; sem estado global de cliente (sem Redux, sem store).

Fluxo de uma leitura: Server Component chama uma função de `src/server/queries/`, que já aplica a regra de `visibility` conforme o papel do usuário autenticado. Nenhuma query de UI decide visibilidade por conta própria.

## Convenções

- Código, schema e rotas em **inglês** (D6).
- Interface em **pt-BR**, com um único ponto de tradução: `src/lib/labels.ts`. Nenhuma string em pt-BR hardcoded em componente ou Server Action.
- Datas, números e moeda seguem o padrão brasileiro em qualquer superfície visível ao usuário (`DD/MM/AAAA`, `HH:mm` 24h, `1.234,56`, `R$`).
- Um branch por fase: `fase/<N>-<slug-curto>`
- Um commit por fase: `fase(P<N>): <resumo em uma linha>`
- Nunca comitar com typecheck, lint ou build reprovando
- Nunca `git push --force`, `git reset --hard` ou `prisma migrate reset` sem autorização humana explícita

## Estrutura de diretórios

```
.
├── CLAUDE.md
├── README.md
├── DESIGN.md
├── .claude/
│   └── skills/ui-prontuario/SKILL.md
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
└── src/
    ├── app/
    │   ├── (auth)/login/
    │   ├── (app)/
    │   │   ├── layout.tsx            # shell com sidebar
    │   │   ├── page.tsx              # Hoje
    │   │   ├── team/
    │   │   │   ├── page.tsx
    │   │   │   └── [memberId]/
    │   │   │       ├── layout.tsx    # header + abas
    │   │   │       ├── page.tsx      # visão geral
    │   │   │       ├── timeline/
    │   │   │       ├── agreements/
    │   │   │       ├── development/
    │   │   │       └── records/
    │   │   ├── agreements/
    │   │   ├── dailies/
    │   │   ├── records/
    │   │   ├── development/
    │   │   ├── search/
    │   │   └── settings/
    │   ├── ui-lab/                   # dev only
    │   └── api/auth/[...nextauth]/
    ├── components/
    │   ├── ui/                       # primitivos (shadcn reescrito)
    │   ├── shell/                    # sidebar, context-bar, command palette
    │   ├── timeline/
    │   ├── member/
    │   └── forms/
    ├── server/
    │   ├── db.ts                     # cliente Prisma singleton
    │   ├── auth.ts
    │   ├── timeline.ts               # ÚNICO lugar que escreve TimelineEvent
    │   ├── alerts.ts                 # motor de alertas
    │   ├── audit.ts
    │   └── queries/                  # queries por domínio
    ├── actions/                      # Server Actions, uma por domínio
    └── lib/
        ├── labels.ts                 # ÚNICO ponto de tradução en → pt-BR
        ├── dates.ts
        ├── severity.ts               # escala graduada de idade/prazo
        └── validators/                # schemas zod
```

## Comandos

```
pnpm dev                 # desenvolvimento
pnpm build               # build de produção
pnpm db:push             # sincronizar schema em dev
pnpm db:migrate          # criar migration
pnpm db:seed             # popular dados de demonstração
pnpm db:studio           # inspecionar dados
pnpm lint && pnpm typecheck
```

No build da Vercel: `prisma migrate deploy && next build`.

## Padrões de frontend

Antes de criar ou alterar qualquer componente visual, leia **[.claude/skills/ui-prontuario/SKILL.md](.claude/skills/ui-prontuario/SKILL.md)** e **[DESIGN.md](DESIGN.md)**. Eles definem tokens, tipografia, densidade e as restrições negativas do projeto — não são opcionais e têm precedência sobre qualquer default de shadcn/ui ou instinto genérico de "boa UI".

Nenhum componente novo sem primitivo correspondente em `/ui-lab`. Deriva visual entre fases é o risco mais provável do projeto depois de fricção de registro — trate `/ui-lab` como referência obrigatória, não como catálogo opcional.

## Regras de modelagem

- `TimelineEvent` é um **índice denormalizado**, nunca fonte de verdade. Os registros vivem nas tabelas concretas (`Feedback`, `OneOnOne`, `Daily`, `Agreement`, `Note`, `MemberChange`, `DevelopmentPlan`...). A `TimelineEvent` é a linha-espelho.
- Toda criação de registro que aparece na timeline escreve a linha de origem **e** a `TimelineEvent` na mesma `prisma.$transaction`. Edição atualiza ambas.
- **`src/server/timeline.ts` é o único lugar do código que escreve em `TimelineEvent`.** Nenhuma Server Action, nenhuma query, nenhum seed escreve nela diretamente — todos chamam as funções desse arquivo.
- `Seniority` é tabela, não enum — o produto vai crescer para níveis como "Especialista" ou "Tech Lead" (D3).
- O enum de `Agreement.status` NÃO contém `OVERDUE`. Os valores são OPEN, IN_PROGRESS, DONE, CANCELLED. Vencido é sempre derivado em query (`dueDate < hoje AND status IN (OPEN, IN_PROGRESS)`), nunca persistido, nunca escrito por cron (D9).
- `TimelineEvent.visibility` SEMPRE espelha a visibilidade do registro de origem. Alterar a visibilidade de um `Feedback`, `OneOnOne` ou `Note` atualiza a `TimelineEvent` correspondente na mesma transação. Uma linha-espelho SHARED apontando para um registro PRIVATE é vazamento e é bug crítico.
- `TeamMember` não é `User`. Os 9 analistas não autenticam no sistema — não criar fluxo de convite, sessão ou autorização para eles (D1).
- Soft delete (`deletedAt`) apenas onde há valor histórico: `TeamMember`, `Agreement`, registros. Não em tabelas de junção (D10).
- `tags` em `TimelineEvent` é `text[]` nativo do Postgres com índice GIN — não criar tabela de tags separada.

## Regras de segurança e privacidade

- `ALLOWED_EMAILS` é uma allowlist rígida no login — nenhum e-mail fora dela autentica, mesmo via Google Workspace válido.
- Dois papéis ativos no MVP: `OWNER` (você, leitura e escrita completas) e `VIEWER` (seu gestor, leitura apenas). `MANAGER` existe no enum mas fica reservado para quando outro gestor tiver seu próprio time.
- `VIEWER` **nunca** lê um registro com `visibility: PRIVATE`, em nenhuma superfície — timeline, busca, command palette, exportação futura. Essa checagem vive nas queries de `src/server/queries/`, não em filtro de UI.
- Toda escrita grava uma entrada em `AuditLog` (`action`, `entity`, `entityId`, `before`, `after`, `userId`, `at`). Sem exceção, inclusive para escritas administrativas em `/settings`.
- Nenhum endpoint público. Sem REST, sem rota de API além de `api/auth/[...nextauth]`. Toda mutação é Server Action autenticada (D8).
- Dados de pessoas ficam no Brasil: banco Neon em `aws-sa-east-1`. Alinhar com RH/jurídico antes de inserir dados reais é responsabilidade do usuário, não do Claude Code — não presumir que já foi feito.
- Padrão de visibilidade por entidade: `Note`, `OneOnOne` e `Feedback` nascem PRIVATE. A única exceção é `Feedback` de categoria RECOGNITION, cujo formulário sugere SHARED como padrão — sugere, não impõe.
- A rota `/ui-lab` é bloqueada em produção via NODE_ENV. Ela expõe estados de componente e não deve existir fora de desenvolvimento.

## Decisões que não devem ser alteradas silenciosamente

| # | Decisão | Motivo |
|---|---|---|
| D1 | `TeamMember` ≠ `User`. Os 9 analistas **não são usuários** do sistema | Eles não acessam. Modelar como usuário criaria autorização, convites e sessões inúteis |
| D2 | `TimelineEvent` é **índice denormalizado**, não fonte de verdade | Registros vivem em tabelas concretas (`Feedback`, `OneOnOne`...). A timeline é uma linha-espelho escrita na mesma transação. Evita `jsonb` genérico e evita `UNION` de 8 tabelas a cada abertura de perfil |
| D3 | `Seniority` é **tabela**, não enum | Vai ser necessário "Especialista" ou "Tech Lead" depois. Enum em Postgres é doloroso de alterar |
| D4 | `visibility: PRIVATE \| SHARED` existe desde a primeira migration | O gestor superior tem acesso de leitura. Sem isso o autor se autocensura e o produto perde a função |
| D5 | Nenhuma fórmula de score no MVP | Só o esquema, os pesos configuráveis e o breakdown explicável |
| D6 | Código, schema e rotas em **inglês**. Interface em **pt-BR** | Evita o inferno de `combinado` vs `agreement` no mesmo arquivo. Um único ponto de tradução: os arquivos de label |
| D7 | Sem ranking, sem nota pública, sem gamificação | Requisito explícito do usuário |
| D8 | Server Actions. Sem REST público, sem tRPC, sem Redux | Só duas pessoas usam. Não há cliente externo |
| D9 | Alertas são **derivados em query**, não persistidos | Um alerta persistido fica obsoleto no segundo seguinte |
| D10 | Soft delete apenas onde há valor histórico | `TeamMember`, `Agreement`, registros. Não em tabelas de junção |

Qualquer sessão de Claude Code que considerar revisar uma dessas dez decisões deve parar e perguntar ao usuário antes de agir — não decidir sozinha, mesmo que pareça uma melhoria técnica.

## Funcionalidades existentes

_Vazio — este projeto ainda não saiu da fase 0 (documentação). Atualize esta seção ao final de cada fase entregue, listando o que passou a existir e funcionar._

## Backlog de curto prazo

1. **P0** — CLAUDE.md, README.md, DESIGN.md, skill local de UI. Fundação documental — em auditoria/correção nesta fase.
2. **P1** — scaffold Next.js 15 + TypeScript + Tailwind v4, tokens do `DESIGN.md` aplicados via `@theme`, primitivos shadcn reescritos em `/ui-lab`.
3. **P2** — app shell: sidebar fixa/colapsável, barra de contexto de 48px, responsividade (drawer em tablet/mobile, tabelas viram lista empilhada).
4. Provisionar Neon (`aws-sa-east-1`, branches `main` e `dev`) **antes** de iniciar P3 — P3 em diante depende de banco real, não de fixtures em memória.
5. **P3** — `schema.prisma` completo (seção 5 do `PLANO-TECNICO.md`) + primeira migration.
6. **P4** — seed com as 9 pessoas do time e ~6 meses de histórico não uniforme (ver seção 11 do `PLANO-TECNICO.md`).
7. **P5** — Auth.js v5 + Google OAuth, allowlist de e-mail, papéis, `visibility`, `AuditLog`.
8. **P6–P15** — os 7 módulos do MVP, agrupados (Hoje, Equipe, Perfil, Dailies, Combinados, 1:1/Feedbacks, Desenvolvimento). `PLANO-TECNICO.md` §7 não quebra este intervalo em fases individuais — a numeração fina de P6 a P15 só existe em `PROMPTS-CLAUDE-CODE.md`, que não está neste repositório. Não fragmentar sem essa fonte.
9. **P16** — não definida. `PLANO-TECNICO.md` §7 só cobre até "Fase 15"; não há fonte para o conteúdo de uma fase 16. Confirmar com o usuário ou com `PROMPTS-CLAUDE-CODE.md` quando ele existir — não inventar escopo para essa fase.

## Protocolo de execução autônoma

Este projeto é executado fase a fase. Uma fase por sessão, nunca duas.

Antes de qualquer fase: leia PROGRESS.md, BLOCKERS.md e este arquivo por completo.

Você DEVE parar e registrar em BLOCKERS.md, sem tentar contornar, quando encontrar:
- Credencial, chave de API, connection string ou variável de ambiente ausente
- Necessidade de criar conta ou autorizar acesso em serviço externo
- Ambiguidade de produto que muda o comportamento de forma perceptível ao usuário
- Qualquer coisa que exija julgamento visual ou de experiência
- Conflito entre o que a fase pede e uma decisão travada
- Necessidade de biblioteca fora da stack acordada

É PROIBIDO, em qualquer circunstância:
- Inventar credencial ou usar placeholder para seguir adiante
- Deixar TODO, FIXME ou stub em código comitado como concluído
- Alterar decisão travada sem autorização explícita
- Avançar para a fase seguinte por conta própria
- Marcar fase como concluída com typecheck, lint ou build reprovando

Ao terminar uma fase, seja explícito sobre o que NÃO foi feito. Um relatório que só lista sucessos é inútil para quem vai revisar.
