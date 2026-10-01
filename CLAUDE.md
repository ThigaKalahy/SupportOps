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
pnpm lint && pnpm typecheck
```

No build da Vercel: `prisma migrate deploy && next build`.

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

_Vazio — este projeto ainda não saiu da fase 0 (documentação). Atualize esta seção ao final de cada fase entregue, listando o que passou a existir e funcionar._

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
