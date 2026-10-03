# CLAUDE.md — Prontuário

Instruções de projeto para sessões de Claude Code. Leia por completo antes de qualquer alteração. Este arquivo tem precedência sobre convenções genéricas.

## Visão do produto

Prontuário é o sistema de gestão de um time de suporte com 9 analistas. A metáfora é o registro clínico e o livro-razão, não um dashboard de BI: entrada datada, calha de margem, régua temporal, escala de severidade. Serve duas pessoas — o gestor (`OWNER`) que registra, e o superior dele (`VIEWER`) que lê o que for compartilhado. Não há cliente externo, não há usuário anônimo, não há endpoint público. O produto existe para responder uma pergunta todo dia: "quem precisa da minha atenção hoje?" — respondida pelo motor de alertas em `src/server/alerts.ts`. Tudo que não serve a essa pergunta ou ao registro histórico é escopo fora do MVP.

## Documentos do projeto

Precedência em conflito: CLAUDE.md > MANUAL-COMPLETO.md > PLANO-TECNICO.md.

- CLAUDE.md — este arquivo. Governa tudo. Atualizado ao final de cada fase.
- MANUAL-COMPLETO.md — os prompts de cada fase e as checagens humanas. SOMENTE LEITURA para você.
- PLANO-TECNICO.md — documento histórico, superado. Não consultar para implementação.
- DESIGN.md e .claude/skills/ui-prontuario/SKILL.md — governam tudo que é visual.

Se o prompt de uma fase contradisser uma decisão travada deste arquivo, a decisão travada vence e você para para perguntar.

## Princípios do projeto

- **Métrica não é avaliação.** Indicadores operacionais (`MetricResult`) nunca escrevem em `TimelineEvent`, nunca alteram `MemberTrait`, nunca aparecem na mesma superfície de um feedback. Ver D5 e seção "Métricas e score".
- **Sem vigilância, sem gamificação.** Sem ranking, sem nota pública, sem score calculado no MVP (D5, D7). Se um dia o time ver esta ferramenta, ela precisa sobreviver à leitura deles.
- **Todo score é explicável.** Quando o cálculo existir, `ScoreResultComponent` guarda o breakdown — nenhum número sem os indicadores e pesos que o formaram.
- **Privacidade combate a autocensura, não a substitui.** `visibility: PRIVATE | SHARED` existe desde a primeira migration. Padrão privado. Sem isso o gestor se autocensura e o produto perde a função.
- **Sem overengineering para dois usuários.** Sem REST público, sem tRPC, sem Redux, sem microserviços, sem camada de abstração especulativa. Ganhos de performance ou flexibilidade que só importam em escala não importam aqui.
- **Fricção de registro mata o produto.** Se lançar uma daily custa mais de 30 segundos, o sistema é abandonado em três semanas. Captura rápida, formulário enxuto e salvamento parcial são requisito de aceite, não polimento.
- **Escopo travado por fase.** Revisão de diff a cada fase, commit por fase. Nenhuma decisão da seção "Decisões que não devem ser alteradas silenciosamente" muda sem confirmação explícita do usuário.
- **Número sem cobertura é mentira.** `MetricResult.sampleSize` é obrigatório e nenhuma métrica pode ser exibida sem a cobertura ao lado. CSAT de 4,8 com 6 avaliações não é CSAT de 4,8. Vale igualmente para taxa de cumprimento e taxa de alteração de prioridade.

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
| Auth | Auth.js v5 (NextAuth) — provider Credentials | E-mail + senha, sessão JWT. Sem OAuth, sem cadastro público, sem recuperação de senha. Usuários criados por script de CLI |
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

Auth.js exige configuração dividida por causa do Edge runtime: `src/server/auth.config.ts` é leve (sem Prisma, sem bcrypt) e é o que o middleware importa; `src/server/auth.ts` é completo, roda em Node, e contém o provider Credentials. Importar Prisma no middleware quebra o build na Vercel.

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
    │   ├── auth.config.ts            # config leve importada pelo middleware (sem Prisma, sem bcrypt)
    │   ├── auth.ts                   # config completa, Node, provider Credentials
    │   ├── timeline.ts               # ÚNICO lugar que escreve TimelineEvent
    │   ├── alerts.ts                 # motor de alertas
    │   ├── audit.ts
    │   ├── whatsapp.ts               # gerador de texto para WhatsApp (único lugar com emoji)
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
pnpm user:create         # criar usuário (único meio de criar conta)
pnpm user:password       # redefinir senha de usuário
pnpm test                # node:test (tests/), arquivos em série; parte lê o banco com os dados do seed
pnpm lint && pnpm typecheck
```

Os scripts `db:*` rodam o Prisma CLI com `node --env-file=.env.local` (o CLI só lê `.env` sozinho; as credenciais ficam no `.env.local`, padrão do Next). Sem biblioteca extra.

No build da Vercel: `prisma migrate deploy && next build` — chamando o Prisma direto, sem `--env-file`, porque lá as variáveis vêm do painel da Vercel e não existe `.env.local`.

## Padrões de frontend

Antes de criar ou alterar qualquer componente visual, leia **[.claude/skills/ui-prontuario/SKILL.md](.claude/skills/ui-prontuario/SKILL.md)** e **[DESIGN.md](DESIGN.md)**. Eles definem tokens, tipografia, densidade e as restrições negativas do projeto — não são opcionais e têm precedência sobre qualquer default de shadcn/ui ou instinto genérico de "boa UI".

Nenhum componente novo sem primitivo correspondente em `/ui-lab`. Deriva visual entre fases é o risco mais provável do projeto depois de fricção de registro — trate `/ui-lab` como referência obrigatória, não como catálogo opcional.

Exceção única à proibição de emoji: o gerador de texto para WhatsApp em `src/server/whatsapp.ts` (D16). Nenhum componente de UI usa emoji.

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
- A daily do dia D puxa os combinados criados na daily anterior mais os em aberto com `dueDate <= hoje`. Revisar grava `AgreementCheckin` (D11).
- Reagendar estende `dueDate` do mesmo `Agreement` e grava checkin com `newDueDate`. `originalDueDate` permanece intocado (D12, D17). Substituir: o antigo vai para CANCELLED, o novo nasce com `replacesAgreementId`.
- `PriorityValidation.outcome` é calculado na escrita e nunca recalculado (D14). `RETURNED` é ação explícita, não derivável de ranks.
- `reasonId` é obrigatório quando `outcome != MAINTAINED`, validado no zod e no banco.
- Métricas de cumprimento são calculadas em query sobre `originalDueDate`, `completedAt` e `AgreementCheckin`. Nenhuma taxa é persistida (D19).

## Métricas e score

- Métricas operacionais (`MetricResult`) nunca escrevem em `TimelineEvent`, nunca alteram `MemberTrait` e nunca aparecem na mesma superfície de um feedback.
- `MetricResult.sampleSize` é obrigatório. Nenhuma métrica é exibida sem a cobertura ao lado.
- Nenhum score é exibido sem o `ScoreResultComponent` que o explica — indicadores e pesos que formaram o número.

## Regras de segurança e privacidade

- `ALLOWED_EMAILS` é uma allowlist rígida verificada no callback de signIn, ANTES de qualquer verificação de senha. Nenhum e-mail fora dela autentica, mesmo com passwordHash válido no banco. Não é redundante com a criação por CLI: é o kill switch operacional — remover um e-mail da variável de ambiente revoga o acesso imediatamente, sem tocar no banco de produção — e a segunda barreira caso alguém com acesso ao banco insira uma linha em `User`.
- Autenticação é e-mail + senha com hash bcryptjs cost 12. Senha nunca em texto.
- Não existe cadastro público, convite ou recuperação de senha. Usuários são criados exclusivamente por `pnpm user:create` e `pnpm user:password`.
- Erro de login genérico e idêntico para e-mail inexistente e senha errada: "E-mail ou senha inválidos".
- `bcrypt.compare` roda SEMPRE, inclusive com e-mail inexistente (contra hash descartável), para não vazar quais contas existem por tempo de resposta.
- 5 tentativas falhas bloqueiam a conta por 15 minutos.
- Toda tentativa de login, sucesso ou falha, gera entrada no `AuditLog`.
- O domínio de produção na Vercel é público no plano Hobby. A tela de login é a única barreira. Deployment Protection cobre apenas os previews.
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
| D11 | `AgreementCheckin` registra cada revisão de combinado numa daily | Um combinado arrastado 4x é problema diferente de um arrastado 1x. Sem a tabela, o arrasto é invisível |
| D12 | Reagendar estende o `dueDate` e grava um checkin — não cria registro novo nem muda status | Mantém o enum de status em 4 valores e preserva o histórico de arrasto |
| D13 | `PriorityLevel` (chamado) é separado do enum `Agreement.priority` (combinado) | Domínios diferentes. Unificar faz a escala do helpdesk mexer na priorização dos compromissos do gestor |
| D14 | `PriorityValidation.outcome` é persistido junto com os ranks do momento | Fato histórico de uma decisão, não estado derivado do tempo. Reordenar a escala não pode reescrever o passado. Não conflita com D9 |
| D15 | Validação de prioridade não escreve em `TimelineEvent` | Inundaria o prontuário com registro operacional. O perfil mostra o agregado; virar feedback é ato explícito do gestor |
| D16 | Emoji permitido exclusivamente no texto exportado para WhatsApp | A proibição vale para a interface. O export é outro meio |
| D17 | `Agreement.originalDueDate` é gravado na criação e NUNCA alterado | Reagendamento muda `dueDate`. Sem o prazo original não existe medição honesta de cumprimento — todo combinado arrastado pareceria cumprido no prazo |
| D18 | `BlockerReason.category` (EXTERNAL / INTERNAL / CAPACITY) existe para separar cumprimento bruto de ajustado | "Aguardando acesso do cliente" e "esqueci" não podem pesar igual contra a pessoa |
| D19 | Taxa de cumprimento nunca aparece sem o total de combinados ao lado, e nunca vira um número único por pessoa | Quem teve 3 combinados fáceis fecha 100%. Taxa sem denominador é propaganda, não medição |

Qualquer sessão de Claude Code que considerar revisar uma dessas decisões deve parar e perguntar ao usuário antes de agir — não decidir sozinha, mesmo que pareça uma melhoria técnica.

## Funcionalidades existentes

Atualize esta seção ao final de cada fase entregue, listando o que passou a existir e funcionar.

**P1 — Design system**
- Scaffold Next.js 15.5 (App Router, `src/`), TypeScript strict com `noUncheckedIndexedAccess`, Tailwind CSS v4, ESLint, pnpm. Scripts: `dev`, `build`, `start`, `lint`, `typecheck`.
- `src/app/globals.css`: tokens do DESIGN.md em `:root` com os mesmos nomes (`--canvas`, `--accent`...) e expostos ao Tailwind (`bg-canvas`, `text-ink`, `border-line`, `bg-overdue-wash`...). A paleta, as sombras, os blurs e as larguras padrão do Tailwind foram removidos: classe fora do sistema não gera CSS. Escala tipográfica em nomes Tailwind (`text-2xs` 11 · `xs` 12 · `sm` 13 corpo · `base` 15 · `lg` 18 · `xl` 22 · `2xl` 28). Raios: `rounded-xs` 2px, `rounded-sm` 4px (controles), `rounded-lg` 6px (contêineres). Única sombra: `shadow-popover`. Larguras: `max-w-page` (1600px), `max-w-dialog`, `max-w-drawer`, `max-w-tooltip`. Foco global com outline 2px `--accent`; `prefers-reduced-motion` remove transições; barra de rolagem discreta.
- Fontes IBM Plex Sans (400/500/600) e IBM Plex Mono (400/500) via `next/font/google`, subsets `latin` + `latin-ext`.
- shadcn/ui (base Radix) com os 19 componentes reescritos para os tokens: button, input, textarea, select, dialog, dropdown-menu, popover, tabs, badge, separator, tooltip, command, sheet, calendar, avatar, checkbox, label, scroll-area, table. Classes compartilhadas de superfície flutuante e item de menu em `src/components/ui/styles.ts`.
- Primitivos próprios em `src/components/ui/`: DataTable, StatusPill, SeverityDot, MetaLabel, DateStamp, PageHeader, EmptyState, FieldGroup, StatStrip, Sparkline.
- `/ui-lab` com todos os primitivos em todos os estados; 404 em produção. Estados de hover e foco são reproduzidos com `data-force-state="hover|focus"` (variante `hover` redefinida no globals.css), sem duplicar estilo.
- `src/lib/labels.ts` (formato da tradução: `labels`, `enumLabels`, `enumLabel()`, `fill()`), `src/lib/dates.ts` (timestamp no fuso de São Paulo × data de negócio `@db.Date` lida em UTC), `src/lib/severity.ts` (escala de prazo com os limiares do P9; escala de idade com limiares obrigatórios por módulo).
- Não existe página em `/` — responde 404 até o P2 criar `src/app/(app)/page.tsx`. _(Resolvido no P2.)_

**P2 — App shell**
- `src/app/(app)/layout.tsx` monta o `AppShell` (`src/components/shell/`): sidebar de 232px recolhível para 56px em ≥ 1024px, com estado no cookie `prontuario.sidebar` lido no servidor; drawer (Sheet) abaixo de 1024px; barra de contexto de 48px com breadcrumb (só a página atual abaixo de 768px), busca inerte com `⌘K` e slot de ação primária; conteúdo fluido até 1600px com padding de 24px (16px no mobile); link "Pular para o conteúdo".
- Ação primária por página: `<ContextActions>` (`src/components/shell/context-actions.tsx`) injeta o botão no slot da barra de contexto via portal.
- Navegação e breadcrumb definidos em `src/components/shell/nav-config.ts` (sete itens + Configurações).
- Oito rotas com PageHeader e EmptyState de direção: `/`, `/team`, `/agreements`, `/priority-validations`, `/dailies`, `/records`, `/development`, `/settings`. Textos em `labels.pages`.
- 404 global em pt-BR (`src/app/not-found.tsx`).
- DataTable: colunas aceitam `hideBelow: "lg" | "xl"` para sair em telas médias; a tabela agora ocupa 100% do contêiner e encolhe.

**P3 — Schema Prisma**
- `prisma/schema.prisma` com todas as entidades do prompt do P3 (Prisma 6.19, PostgreSQL no Neon `sa-east-1`), comentários `///` nas de intenção não óbvia. Primeira migration `init` aplicada no branch `main` do Neon.
- Regras no banco, por SQL manual na migration `init` (testadas contra o Neon): `PriorityValidation` exige `reasonId` fora de MAINTAINED, exige prioridade/rank do supervisor fora de RETURNED e exige outcome coerente com os rank snapshots; `AgreementCheckin` exige `blockerText` não vazio em PARTIAL/NOT_DONE; `MentorshipLink` proíbe mentor = mentorado; `MetricResult.sampleSize >= 0`; trigger torna `Agreement.originalDueDate` imutável (D17). Índice GIN em `TimelineEvent.tags`, declarado também no schema (`type: Gin`).
- `src/server/db.ts`: singleton com `db` (leituras de TeamMember, Agreement, OneOnOne, Feedback, Note, PriorityValidation e DevelopmentPlan escondem `deletedAt` automaticamente; `include` aninhado precisa filtrar à mão) e `dbIncludingDeleted` (sem filtro, uso explícito).
- Scripts: `db:generate`, `db:validate`, `db:push`, `db:migrate`, `db:migrate:deploy`, `db:seed` (o seed em si é do P4), `db:studio`; `postinstall` roda `prisma generate`.

**P4 — Seed**
- `src/server/timeline.ts`: único escritor de TimelineEvent. Construtores `timelineEventFor.*` (combinado criado/concluído, 1:1, feedback, nota de daily, anotação, PDI, mudança de carreira), `recordTimelineEvents(tx, ...)` e `syncTimelineVisibility(tx, ...)`. Registros sem campo de visibilidade (combinado, daily, PDI, mudança de carreira) geram linha SHARED.
- `prisma/seed.ts` (`pnpm db:seed`, Node ≥ 22.6 com TypeScript nativo): ~6 meses de histórico relativo à data em que roda, aleatoriedade com semente fixa. Idempotente: apaga e recria só os ids `seed_`; organização, usuário e catálogos por upsert. O OWNER é o primeiro e-mail de `ALLOWED_EMAILS`, sem senha; o VIEWER não é criado (fica para o P5).
- Padrões narrativos verificados no banco: Larissa 50% → 67% → 100% de cumprimento no prazo; Henrique 100% → 67%, com 5/6 → 3/6 nas duas últimas janelas de 30 dias (dispara "cumprimento em queda"), sem feedback há ~100 dias, PDI sem acompanhamento há ~80 dias e só dois 1:1; Diego com um combinado reagendado 4x, sempre "Dependência de terceiro"; Priscila com dois combinados vencidos há mais de 40 dias; Beatriz sem 1:1 há ~6 semanas; Otávio com 50% de alteração de prioridade e "Impacto superestimado" dominante; Rafael com 5% de alteração e 100% de cumprimento; dois combinados substituídos; duas semanas de ausência do gestor sem daily.
- `tsconfig.json` com `allowImportingTsExtensions` (imports `.ts` explícitos em código que também roda no Node puro).

**P5 — Auth e visibilidade**
- Auth.js v5 (5.0.0-beta.32) com provider Credentials, configuração dividida: `src/server/auth.config.ts` (leve, Edge, usado pelo `src/middleware.ts`) e `src/server/auth.ts` (Node, Credentials). O bundle do middleware não contém Prisma nem bcrypt (verificado). Sessão JWT de 7 dias renovada a cada hora de atividade; papel e organização vão no token.
- `src/server/credentials.ts`: allowlist antes do banco; `bcrypt.compare` sempre (hash descartável para e-mail inexistente, fora da lista ou sem senha); 5 falhas → bloqueio de 15 min, recusando até a senha certa; sucesso zera e grava `lastLoginAt`; toda tentativa no AuditLog (`auth.login.success|failure|blocked`). Logout também é auditado.
- Kill switch: a allowlist é conferida no middleware e em `getCurrentUser` a cada requisição — tirar o e-mail de `ALLOWED_EMAILS` derruba sessões abertas (testado).
- `src/server/access.ts`: `getCurrentUser`, `requireUser`, `requireOwner` (lança `ForbiddenError` para VIEWER), reexporta `visibilityFilter`, `memberScope`, `canWrite` de `src/server/visibility.ts`. MANAGER limitado ao próprio time via `memberScope`.
- `src/server/queries/records.ts`: única leitura de OneOnOne, Feedback, Note e TimelineEvent — `getMemberTimeline`, `searchRecords`, `countRecordsByMember`, `listOneOnOnes`, `listFeedbacks`, `listNotes`, todas com `visibilityFilter` e escopo de organização.
- `src/server/audit.ts`: `writeAudit(entry, { organizationId, userId, tx })`.
- `/login` (`src/app/(auth)/login`), Server Actions `loginAction`/`logoutAction` em `src/actions/auth.ts`. Shell mostra o usuário atual com "Sair" e, para VIEWER, o indicador "Somente leitura" na barra de contexto.
- CLI: `pnpm user:create` e `pnpm user:password` (`scripts/`), senha aleatória mostrada uma vez, só o hash gravado, auditados.
- Testes (`pnpm test`, `node:test`, sem biblioteca extra): `tests/visibility.test.ts` (varredura estática que reprova leitura sensível fora de `src/server/queries` ou sem `visibilityFilter` + verificação no banco de timeline, busca, contadores e listas como VIEWER), `tests/lockout.test.ts` (6 senhas erradas → bloqueio de 15 min e 6 linhas no AuditLog), `tests/access.test.ts`.

**P6 — Equipe e cadastro**
- `/team`: DataTable com pessoa (avatar de iniciais com cor por id, nome preferido, cargo), senioridade, tempo no time, status, último 1:1, combinados abertos e coluna de atenção (SeverityDot + tooltip com cada motivo em uma frase). Agrupada por senioridade (Sênior → Pleno → Júnior) com toggle; ordem por senioridade e nome, nunca por métrica.
- Filtros no popover "Filtros" da barra de contexto (senioridade, status atual/inativos, precisa de atenção, agrupar), estado na URL: `?seniority=PLENO&status=inactive&attention=1&group=off`.
- Listagem em UMA consulta SQL (`listTeamMembers` em `src/server/queries/members.ts`, provado por teste com contador de consultas). Último 1:1 respeita visibilidade: para VIEWER, 1:1 privado não conta (`visibilitySql`).
- Atenção derivada em `src/server/alerts.ts` (`memberAttention`), com os limiares padrão da tabela do P15: combinado vencido (escala de prazo), crônico (≥ 3 reagendamentos), 1:1 atrasado (Júnior 21 dias, Pleno/Sênior 30; acima do dobro vira vermelho), PDI sem acompanhamento > 45 dias, combinado vencendo em ≤ 3 dias.
- Cadastro, edição e desativação: `MemberDialog` e `DeactivateMemberDialog` em `src/components/member/` (reutilizáveis no header do perfil, P7), Server Actions em `src/actions/members.ts`, núcleo testável em `src/server/members.ts`. Mudança de senioridade, cargo ou status exige motivo e grava MemberChange + TimelineEvent; desativar = INACTIVE + `deletedAt`, nunca apaga. Responsabilidades com histórico (`endedAt`), competências com nível 1–5.
- Primitivos ampliados: DataTable (`groupBy`, `stacked: "aside"`, vazio/erro fora da tabela), FieldGroup (filho como função, para Select). Data em DD/MM/AAAA com máscara (`maskDateInput`, `parseDisplayDate`), tempo no time (`formatTenure`), `plural()` em labels.
- `db.ts` tem `queryCounter`, ligado só com `PRISMA_COUNT_QUERIES=1` (testes).

**P7 — Perfil do analista**
- `/team/[memberId]`: `layout.tsx` com cabeçalho sempre visível (avatar, nome, cargo, senioridade, status, entrada com tempo no time, gestor, último 1:1, próximo acompanhamento com severidade, responsabilidades em MetaLabel e — só quando há — a linha de atenção com cada motivo em frase) e abas em rota (`RouteTabs`): Visão geral, Timeline, Combinados, Desenvolvimento, 1:1 e feedbacks. Breadcrumb mostra o nome da pessoa (`<CrumbLabel>` em `src/components/shell/crumb-label.tsx`). Pessoa desativada continua acessível, só leitura.
- Visão geral em duas colunas assimétricas: resumo gerencial editável no lugar (Ctrl+Enter salva, Esc cancela; auditado, sem linha na timeline), últimos 5 registros com cadeado nos privados, pontos fortes e de desenvolvimento lado a lado; coluna estreita com combinados em aberto (severidade de prazo e arrasto), PDIs ativos (ações concluídas e último acompanhamento; > 45 dias em destaque), mentorias nos dois sentidos e ritmo (dias desde o último 1:1 com a referência da senioridade, último feedback, último registro). O ponto de entrada dos blocos de cumprimento (P12) e validação de prioridade (P11) está marcado em `page.tsx`.
- Leituras em `src/server/queries/profile.ts` (`getMemberProfile`, `getMemberOverview`), com `visibilityFilter` em toda leitura de 1:1, feedback e timeline: para o VIEWER, último 1:1, próximo acompanhamento, ritmo e últimos registros contam só o que é SHARED. `listTeamMembers` aceita `id` (atenção de uma pessoa, inclusive inativa). `loadProfile` (React `cache`) evita repetir as consultas entre layout e página.
- Ações do cabeçalho (só para quem escreve), cada uma em dialog: Registrar 1:1, Dar feedback, Novo combinado, Anotação, Editar cadastro (+ Desativar no menu). ≥ 1280px viram botões; abaixo, um botão "Registrar" com menu. Formulários em `src/components/forms/` com o mesmo schema zod da action (`src/lib/validators/records.ts`, `agreement.ts`, `fields.ts`): 1:1 com data e assuntos de cara e o resto em seções recolhidas; feedback SCI com rótulos de ajuda, reconhecimento sugere SHARED enquanto a pessoa não escolheu; anotação; combinado rápido (Enter salva, Ctrl/⌘+Enter salva e reabre em branco, origem pelo contexto, originalDueDate = dueDate). Núcleos testáveis em `src/server/records.ts` e `src/server/agreements.ts`; actions em `src/actions/records.ts` e `src/actions/agreements.ts`; casca comum em `src/server/action-runner.ts`.
- `/team`: clicar na linha abre o perfil (`DataTable.rowHref`; o nome é link para teclado e nova aba). As abas Timeline, Combinados, Desenvolvimento e 1:1 e feedbacks ainda mostram aviso de "ainda não disponível" (P8, P9, P14, P13).
- Primitivos novos no /ui-lab: `RouteTabs` (abas em rota) e `Section` (bloco de página sem card). `DialogContent` devolve o foco ao elemento que abriu o dialog (o Radix só devolvia a um `DialogTrigger`).
- Datas de negócio na timeline: `businessDateAtNoon` grava 1:1, feedback, daily e conclusão de combinado ao meio-dia de São Paulo — meia-noite UTC aparecia como o dia anterior.
- `pnpm test` roda os arquivos em série (`--test-concurrency=1`): eles compartilham o banco.

**P8 — Timeline**
- `/team/[memberId]/timeline`: calha temporal em `src/components/timeline/` — `timeline-rail.tsx` (calha de 96px, régua de 1px centralizada desenhada em cada linha para correr contínua, marcador de 7px em SVG, traço de 4px que sangra da régua para dentro da calha no trecho do evento com pendência, cabeçalho de mês sticky abaixo da barra de contexto), `timeline-event.tsx` (etiqueta mono do tipo, visibilidade, título 13px medium, resumo em 3 linhas com "Mostrar tudo" só quando passa disso, combinados vinculados, tags traduzidas, autor) e `timeline-feed.tsx` (agrupamento por mês, "Carregar mais" por cursor, sem scroll infinito). Sem animação de entrada.
- Leitura em `src/server/queries/timeline.ts` (`getTimelinePage`, 40 por página, `visibilityFilter`): cada item sai com o marcador calculado — sangra só combinado aberto vencendo/vencido (escala de prazo), revisão marcada no 1:1 mais recente e não cumprida, PDI ativo sem acompanhamento há mais de 45 dias — e com os combinados vinculados e o status atual (o próprio combinado, ou os que o 1:1/feedback/daily gerou).
- Filtros na URL (`src/lib/timeline-filters.ts`): `?types=ONE_ON_ONE,FEEDBACK&period=30d|3m|6m&q=texto`; popover de tipos com multi-seleção, período segmentado, busca com espera de 350ms. "Carregar mais" é a Server Action de leitura `loadTimelinePage` (`src/actions/timeline.ts`), com a mesma query.
- Alternar privado/compartilhado (só quem escreve, só 1:1, feedback e anotação): `setRecordVisibilityRecord` em `src/server/records.ts` muda a origem e todas as linhas-espelho na mesma transação, com auditoria `record.visibility.update`; compartilhar pede confirmação em modal, tornar privado é imediato. Combinado, daily, PDI e mudança de carreira mostram "Compartilhado" com a explicação. O VIEWER não vê indicador nem ação. A origem é localizada por `findToggleableSource` (`src/server/queries/records.ts`).
- /ui-lab ganhou a seção Timeline com todos os estados (sem pendência, âmbar, laranja, vermelho, privado, resumo longo, combinados gerados).

**P9 — Combinados**
- `/agreements`: abas Atrasados | Vencendo (7 dias) | Em aberto | Concluídos | Todos, com contagem e estado na URL (`?view=`); filtros no popover (pessoa, senioridade, origem, prioridade, criado nos últimos 30 dias/3/6 meses), também na URL (`src/lib/agreement-filters.ts`). Tabela com título, responsável, origem, criado em, prazo com a escala graduada, prioridade, status, arrasto ("reagendado 1x"; a partir de 3, selo vermelho "arrastado Nx") e menu com "Marcar como concluído". Ordem: abertos por prazo (vencidos, vencendo, depois o resto), encerrados por último. Clique na linha abre o detalhe.
- Leitura em `src/server/queries/agreements.ts`: `listAgreements` (uma consulta; abas e contagens repartidas em memória), `getAgreementDetail`, `listAgreementMembers`.
- `/agreements/[agreementId]`: prazo original × atual (+N dias), origem (daily com data), prioridade, autor, substitui/substituído por, detalhes, resultado e o histórico de revisões nas dailies em ordem cronológica (data da daily, desfecho, impeditivo com motivo e categoria, novo prazo).
- Criação rápida acionável de qualquer lugar: `QuickAgreementProvider` (`src/components/forms/quick-agreement.tsx`) no AppShell, atalho C fora de campos de texto, botão "Novo combinado" na central e no perfil (com o responsável preenchido). Ordem do teclado: título → responsável (o select aceita a inicial) → prazo → Enter; Ctrl/⌘+Enter salva e reabre em branco com o foco no título. Origem pelo contexto (em /dailies, DAILY; no resto, Gestor).
- Conclusão: `completeAgreementRecord` (`src/server/agreements.ts`) grava DONE, completedAt (hoje), resultado opcional, linha AGREEMENT_DONE e auditoria; recusa combinado já encerrado sem duplicar a linha.
- Aba Combinados do perfil (`/team/[memberId]/agreements`): as mesmas abas e tabela, filtradas pela pessoa. Combinados da visão geral e da timeline levam ao detalhe.
- `RouteTabs` aceita contagem por aba; `DataTable.hideBelow` aceita `2xl` (1536px).
- Complemento (02/10/2026): editar combinado (título, detalhes e prioridade — prazo e responsável não; a timeline acompanha via `syncTimelineContent`) e cancelar com motivo obrigatório (CANCELLED, motivo em `outcome`), no detalhe e no menu da linha (`updateAgreementRecord`, `cancelAgreementRecord`; dialogs em `src/components/agreements/`). A central mostra 50 linhas por vez com "Mostrar mais".

**P10 — Dailies com rollover e exportação**
- `/dailies/new` (`src/components/dailies/daily-form.tsx`): três seções em sequência. (1) Revisão dos combinados — criados na daily anterior (qualquer prazo, ainda abertos) mais os abertos com prazo até hoje, sem repetir, agrupados por pessoa; três desfechos grandes num grupo com uma parada de Tab (F/P/N escolhem, setas movem); Feito recolhe a linha e leva o foco ao próximo; Parcial/Não feito abrem na linha impeditivo obrigatório, motivo (BlockerReason) e reagendar (padrão: próxima daily, dia útil seguinte) ou substituir; arrasto de 3+ aparece como selo vermelho "arrastado Nx" sem hover. (2) Participantes e notas — membros ativos presentes por padrão, Tab anda de nota em nota (presença e bloqueio por Alt+A / Alt+B ou clique). (3) Combinados de hoje — responsável, título, prazo (padrão: próxima daily), Enter acrescenta linha. Resumo e decisões recolhidos. Ctrl/⌘+Enter salva. Rascunho no localStorage a cada 10 s, restaurado com aviso e descartável.
- Salvamento em UMA transação (`src/server/dailies.ts`, `createDailyRecord`): Daily, DailyParticipants, AgreementCheckins, Feito (DONE + completedAt = data da daily + AGREEMENT_DONE), reagendar (estende o dueDate do mesmo combinado, prazo original intacto), substituir (antigo CANCELLED, novo com replacesAgreementId), combinados novos com origin DAILY e sourceDailyId, uma linha DAILY por pessoa com nota, bloqueio ou combinado revisado (presença simples não gera linha), auditoria `daily.create`. Combinado encerrado em outra tela no meio do salvamento desfaz a daily inteira com mensagem própria. Schema compartilhado em `src/lib/validators/daily.ts`.
- `src/server/whatsapp.ts` (`buildDailyWhatsApp`): texto puro com *negrito*/_itálico_, ✅ ⚠️ 🔴 (único arquivo com emoji — teste garante), seções vazias omitidas, nome preferido, DD/MM, sem wa.me. Função pura, usada também no cliente. "Copiar para WhatsApp" (`copy-whatsapp-button.tsx`) com Clipboard API e fallback de textarea + execCommand; o botão diz "Copiado" por 2 s.
- `/dailies`: histórico compacto (data, presentes, bloqueios, revisados, criados, primeira linha do resumo), expansão na própria página e copiar por daily. `/dailies/[dailyId]`: detalhe completo com copiar na barra de contexto.
- Leituras em `src/server/queries/dailies.ts` (`getDailyForm`, `listDailies`, `getDailyDetail`, `teamFor`). `nextBusinessDay` em `src/lib/dates.ts`. Criação rápida de combinado aberta em /dailies nasce com origem DAILY.
- Complemento (02/10/2026): daily de data passada (`/dailies/new?date=DD-MM-AAAA`, seletor no cabeçalho, aviso de registro retroativo); aviso quando já existe daily na data (não impede); editar daily salva — resumo, decisões, presença e notas, com as linhas DAILY refeitas na mesma transação por `replaceTimelineEvents` (`updateDailyRecord`, `EditDailyButton`); revisões e combinados criados não se editam. `nextBusinessDay` pula feriados nacionais (`isNationalHoliday`: datas fixas, 20/11 desde 2024 e Sexta-feira Santa; Carnaval e Corpus Christi não).

**P11 — Validação de prioridade**
- `/priority-validations`: formulário fixo no topo (gruda abaixo da barra de contexto em ≥ 1024px), feito para validar chamados em sequência sem mouse — colar a URL extrai o ID pelos `TicketUrlPattern` ativos, em ordem (em cada padrão vale a captura mais longa), mostra o ID em mono e pula o foco para Responsável; sem padrão, o ID é digitado e a tela avisa discretamente. Selects aceitam a inicial; resultado calculado ao vivo (Elevada/Rebaixada em atenção, Mantida calma, Devolvida em vermelho); "Devolver" dispensa a prioridade validada; motivo aparece e é obrigatório fora de Mantida; motivo que exige texto ("Outro") abre o campo. Ctrl/⌘+Enter salva de qualquer campo (captura, inclusive com foco num select), limpa e volta à URL. Editar na linha carrega o registro no próprio formulário; excluir é lógico, com confirmação.
- Resumo em `StatStrip` (Avaliados · Mantidos · Alterados com "% de total" · Elevados · Rebaixados · Devolvidos), do período e da pessoa — não do filtro de resultado/motivo; sem registro no período, `EmptyState`. Tabela mais recente primeiro; fora de "hoje" ganha a coluna de data. Período (hoje, 7 dias, 30 dias, mês atual, personalizado) e filtros (responsável, resultado, motivo) na barra de contexto, na URL (`src/lib/validation-filters.ts`, datas `DD-MM-AAAA`).
- Regras puras em `src/lib/priority-validation.ts` (`computeOutcome`, `extractTicketRef`, `matchPattern`); schema compartilhado em `src/lib/validators/priority-validation.ts`, que recebe os catálogos (ranks e motivos). Escrita em `src/server/priority-validations.ts`: grava `analystRankSnapshot`/`supervisorRankSnapshot` e o resultado do momento (D14) — na edição, sem trocar prioridades, mantém os gravados; validatedAt e supervisor vindos do servidor; auditoria; nenhuma linha na timeline (D15).
- Banco: migration `reason_requires_detail` — `ReclassificationReason.requiresDetail` ("Outro" marcado) e trigger que recusa validação com esse motivo sem `reasonOther`.
- Relatório futuro, sem tela: `summaryByPeriod`, `summaryByMember` (ordem por nome, taxa com total), `summaryByReason`, `summaryByPriorityTransition` (ranks do momento), em `src/server/queries/priority-validations.ts`, SQL exposto em `summarySql`; o teste confere que os quatro filtram pelo índice `(organizationId, validatedAt)`.
- Perfil, coluna estreita: bloco de 90 dias (validações, taxa de alteração "52% · 14 de 27", motivo mais frequente) e "Registrar feedback sobre isto", que abre o feedback com a pessoa e um contexto SUGERIDO (só entra no campo com "Usar como contexto").
- `/settings` em abas (`layout.tsx` + uma rota por catálogo): níveis de prioridade (Subir/Descer renumera os ranks; chave gerada do nome), motivos de reclassificação (exige texto), motivos de impeditivo (categoria) e padrões de URL (validação da expressão e do grupo, testador da URL na página e no dialog). Criar, editar, ativar/desativar e excluir só o que nada usa; tudo auditado (`settings.<tipo>.<ação>`). Componente genérico em `src/components/settings/catalog-settings.tsx`.
- Correções transversais: selects do Radix recebiam `undefined` ao limpar e passavam a se controlar sozinhos, mostrando o valor anterior com o estado vazio (afetava o Ctrl+Enter do combinado e a linha nova da daily) — agora recebem `""`; `FieldGroup` trata erro vazio como sem erro; o atalho C não dispara com o foco dentro de formulário.

**P12 — Cumprimento de combinados**
- Regras em `src/lib/adherence.ts` (puras, sem persistência — D19): combinado devido = `originalDueDate` no período e já chegado (aberto com prazo original hoje fica de fora, `pending`); no prazo = DONE com `completedAt <= originalDueDate` (D17); com atraso; em aberto vencido; cancelado (inclusive substituído) conta no total e não é cumprido. Ajustada (D18): sai do denominador o combinado NÃO cumprido no prazo cujo último impeditivo com motivo é EXTERNAL. Toda taxa é um `Rate` com numerador, denominador e `lowConfidence` (< 5). Tendência = últimos 30 dias × 30 anteriores; queda = −20 p.p. com 5+ combinados nas duas janelas.
- Consultas em `src/server/queries/adherence.ts`: `getAdherence`, `getAdherenceSeries` (mês a mês, o corrente até hoje), `getAdherenceTrend`, `getTeamAdherence` (por pessoa ativa + taxa do time só com quem tem 5+, contando quem ficou fora), `getBlockerBreakdown` (revisões Parcial/Não feito por motivo e categoria, pela data da daily), `getMemberAdherenceProfile`.
- Alerta "Cumprimento em queda" (`adherenceDropAlert` em `src/server/alerts.ts`), calculado na mesma consulta única de `/team` (`dueCurrent/onTimeCurrent/duePrevious/onTimePrevious`) e exibido na coluna de atenção e no cabeçalho do perfil; teste garante que o SQL concorda com as consultas para todas as pessoas. "Combinado crônico" já existia (`chronicAgreements`).
- Perfil: visão geral com bloco compacto (taxa bruta e ajustada com o total, tendência, série de 6 meses) e aba Combinados com o painel completo acima da lista (`AdherencePanel`: StatStrip de 90 dias, sparkline 0–100, tendência, linha vermelha de crônicos com links, até 4 impeditivos por frequência).
- `/agreements/adherence` (link "Cumprimento do time" em /agreements): DataTable por pessoa (total sempre na linha, "amostra pequena" marcada, bruta, ajustada com total, arrasto médio, tendência com seta e p.p.), ordem alfabética ou por taxa (amostra pequena vai para o fim), período 30d/90d/6m/12m/personalizado na URL (`src/lib/adherence-filters.ts`), linha de leitura do time e "Registrar feedback" com contexto só sugerido. Nada escreve TimelineEvent.
- Primitivos: `PeriodPicker` e `FilterSelect` (`src/components/ui/`, usados também em /priority-validations e /agreements); `StatStrip` aceita `detail` ao lado do número; `Sparkline` aceita `null` (lacuna) e `domain` fixo. Datas na URL via `toUrlDate`/`parseUrlDate` em `src/lib/dates.ts`.

**P13 — 1:1 e feedbacks**
- Formulário de 1:1 em dialog largo (`max-w-dialog-wide`, 960px) com painel de contexto ao lado, aberto por padrão e ocultável (`src/components/forms/one-on-one-context.tsx`): o que ficou do 1:1 anterior (revisão marcada com severidade, assuntos, desenvolvimento, dificuldades, combinados gerados nele com status e arrasto), combinados em aberto, último feedback (com orientação e follow-up) e PDI ativo com até 3 ações em aberto. Carregado ao abrir pela Server Action de leitura `loadOneOnOneContext` → `getOneOnOneContext` (com `visibilityFilter`: o VIEWER não vê 1:1 privado nem no contexto). No celular, o painel vem depois do formulário.
- 1:1 e feedback geram combinados no próprio formulário (`GeneratedAgreements`): responsável = a pessoa, origem ONE_ON_ONE/FEEDBACK com `sourceOneOnOneId`/`sourceFeedbackId`, prazo original = prazo (D17), linha AGREEMENT na timeline, tudo na mesma transação do registro; linha inválida recusa o registro inteiro; linhas vazias são descartadas no cliente. `zodResolver` do form-kit monta erros aninhados (`agreements.0.title`).
- Follow-up (`src/lib/follow-up.ts`): revisão do 1:1 pendente até um 1:1 posterior; follow-up de feedback pendente até um 1:1 ou feedback na data ou depois; pendente vencido usa a escala de prazo; só registros visíveis a quem consulta encerram pendência.
- `/records` e `/team/[memberId]/records`: índice unificado (`listRecords` em `src/server/queries/records.ts`) — data, tipo, pessoa, registro (cadeado no privado), categoria, follow-up com severidade, combinados gerados; filtros tipo, pessoa, categoria (implica feedback) e período (30d/3m/6m/12m/tudo, padrão 3 meses) na URL (`src/lib/records-filters.ts`); clique na linha abre o registro inteiro num Sheet somente leitura, com os combinados e o link para a timeline.

**P14 — Desenvolvimento e PDI**
- Regras em `src/lib/development.ts`: idade do acompanhamento (`planStaleness`: desde o último acompanhamento ou, se nunca houve, desde o início; âmbar > 30 dias, laranja > 45 = "PDI parado", vermelho > 90), progresso em ações (canceladas não contam) e `readiness` — só para quem atende a TODAS as competências esperadas da senioridade atual (não avaliada conta como abaixo), dizendo em quantas da próxima já atende. Sem score, sem porcentagem, sem ordem entre pessoas.
- `/team/[memberId]/development`: PDIs (ativos e pausados em cima, os demais recolhidos) com competência, situação atual, objetivo, evidência esperada, último acompanhamento, ações com responsável (pessoa, gestor ou mentor com nome) e prazo, progresso; PDI parado ganha borda e selo de severidade. Ações: "Novo PDI" (com ações), "Registrar acompanhamento" (nota obrigatória → `lastReviewedAt` + `progressNote` + linha DEVELOPMENT na timeline), marcar ação concluída, mudar status (concluir e cancelar pedem confirmação; concluir grava `completedAt` e linha na timeline). Competências em barras de 4px (`LevelBar`, primitivo novo): nível atual × esperado da senioridade atual × da próxima, agrupadas por categoria em ordem alfabética. Prontidão (quando se aplica), mentorias, pontos fortes/de desenvolvimento com data observada e histórico (arquivar não apaga).
- `/development`: PDIs por status (StatStrip de contagens), PDIs parados em destaque, tabela de todos os PDIs (status e nome — nunca desempenho), mapa de mentorias agrupado por mentor (lista, sem grafo) e prontidão em rótulo neutro ("atende ao nível esperado de Pleno em 8 de 10 competências"), em ordem alfabética.
- Matriz de níveis esperados (`CompetencyExpectation`) preenchível em `/settings/competency-matrix` (célula grava ao escolher, "Não definido" limpa, auditado `settings.competencyExpectation.update`). O seed NÃO preenche a matriz (as 30 linhas de demonstração do P4 foram removidas); sem matriz, as telas dizem isso e a prontidão não aparece.
- Escrita em `src/server/development.ts` (+ `src/actions/development.ts`), leitura em `src/server/queries/development.ts`, schemas em `src/lib/validators/development.ts`. Timeline: `timelineEventFor.developmentReview` e `developmentDone`; a linha de criação do PDI passou a usar o meio-dia de São Paulo do início (antes caía no dia anterior; seed reaplicado).

**P15 — Hoje e motor de alertas**
- Motor em `src/server/alerts.ts`: `getAlerts(viewer, { teamId?, today? })` devolve a lista única e os contadores da sidebar, da MESMA fonte; `deriveAlerts(facts, today, t)` é a regra pura (testada); fatos lidos de uma vez em `src/server/queries/alerts.ts` (`getAlertFacts`, com `visibilityFilter` — para o VIEWER, 1:1 privado não resolve alerta e nada de registro privado vira texto). Nada é persistido (D9).
- Os dez alertas da tabela do P15: combinado vencido (uma linha por combinado; se também crônico, a frase diz "reagendado Nx"), crônico ainda no prazo, vencendo (agrupado por pessoa), sem 1:1 (cadência por senioridade; 1,5x laranja, 2x vermelho), silêncio gerencial (nenhum registro de qualquer tipo; cobre o "sem 1:1" da mesma pessoa), PDI parado (um por plano, escala do PDI), follow-up de feedback vencido sem conversa depois (regra do P13), daily não registrada (dias úteis entre a última e hoje, hoje não conta), cumprimento em queda e prontidão (informativa: só quem atende a TODA a próxima senioridade; fim da lista, fora dos contadores). Pessoa afastada não entra na cadência. Ordem: gravidade (vermelho > laranja > âmbar), depois o mais velho.
- Limiares em `/settings/thresholds` (tabela `AlertThreshold`, chave/valor por organização, migration `alert_thresholds`; sem linha = padrão de `src/lib/alert-thresholds.ts`; cadência de 1:1 por senioridade em `oneOnOneDays.<KEY>`): faixa conferida, voltar ao padrão apaga a linha, auditado `settings.alertThreshold.update`. Os mesmos limiares valem para a coluna de atenção de `/team` (`listTeamMembers` recebe os já carregados), o cabeçalho e a visão geral do perfil, a sangria de PDI da timeline, o "PDI parado" de `/development` (`planStaleness(..., staleDays)`) e o selo "arrastado Nx" (cliente, via `ThresholdsProvider`/`useThresholds` no shell). `ATTENTION_THRESHOLDS` deixou de existir.
- Home `/` (`src/app/(app)/page.tsx`): cabeçalho com o dia ("sábado, 03/10/2026"), barra de ações (Registrar daily · Novo combinado · Validar prioridade · Registrar 1:1 · Dar feedback — 1:1 e feedback perguntam "Com quem?"), coluna principal "Precisa de você" (`AlertList`: severidade, pessoa, frase, há quanto tempo, ação direta — formulário de 1:1/feedback ou link; vazio honesto "Nada vencido hoje") e coluna lateral sem card: composição do time (`SegmentedBar` de 6px, primitivo novo), ritmo de gestão (StatStrip: dias desde a última daily, 1:1 e feedbacks no mês, cumprimento do mês com o total e "amostra pequena"), próximos acompanhamentos em 7 dias (combinados, revisão do 1:1 mais recente, follow-ups, prazo de PDI e de ação; 8 visíveis + contagem) e as 8 últimas movimentações. Leituras em `src/server/queries/today.ts`. Motor e limiares carregados uma vez por requisição (`src/app/(app)/alerts-data.ts`, React `cache`), compartilhados entre layout e página.
- Sidebar com contador discreto por item (Hoje, Equipe = pessoas, Combinados, Dailies, Registros, Desenvolvimento), sem contar "vencendo" nem informativos; no modo recolhido, número no canto do ícone e no nome acessível.
- Complementos das fases anteriores, no mesmo commit: aviso passageiro (`Toast`/`useToast`, primitivo novo, no shell) nos formulários que salvam; editar e excluir 1:1, feedback e anotação pela timeline e pelo painel de /records (`RecordActions`; edição refaz a linha da timeline com `rebuildTimelineEvents`; exclusão lógica tira as linhas com `removeTimelineEvents`; combinados gerados ficam); reativar pessoa desativada (evento de carreira com motivo); editar PDI (texto, competência, prazo — só a linha de criação da timeline acompanha, `syncPlanCreatedEvent`) e acrescentar ação; registrar e encerrar mentoria no perfil (`MentorshipSection`); catálogo de competências em `/settings/competencies` (sem posição própria; em uso não se exclui).

## Backlog de curto prazo

Provisionar o banco antes do P3 (já feito).

- **P1** — Design system
- **P2** — App shell
- **P3** — Schema Prisma
- **P4** — Seed
- **P5** — Auth e visibilidade
- **P6** — Equipe e cadastro
- **P7** — Perfil do analista
- **P8** — Timeline
- **P9** — Combinados
- **P10** — Dailies com rollover
- **P11** — Validação de prioridade
- **P12** — Cumprimento de combinados
- **P13** — 1:1 e feedbacks
- **P14** — Desenvolvimento e PDI
- **P15** — Hoje e motor de alertas
- **P16** — Busca global
- **P17** — Arquitetura de score
- **P18** — Mobile, a11y e deploy

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
