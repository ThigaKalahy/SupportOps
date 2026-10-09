# CLAUDE.md — Prontuário

Instruções de projeto para sessões de Claude Code. Leia por completo antes de qualquer alteração. Este arquivo tem precedência sobre convenções genéricas.

## Visão do produto

Prontuário é o sistema de gestão de um time de suporte com 9 analistas. A metáfora é o registro clínico e o livro-razão, não um dashboard de BI: entrada datada, calha de margem, régua temporal, escala de severidade. Serve os gestores de time de uma organização, um time por vez. Cada gestor vê e registra apenas o próprio time; o gestor acima deles tem leitura em vários times e escolhe qual está olhando. O isolamento entre times é requisito de produto, não detalhe de implementação: o que é de um setor não aparece em outro. Não há cliente externo, não há usuário anônimo, não há endpoint público. O produto existe para responder uma pergunta todo dia: "quem precisa da minha atenção hoje?" — respondida pelo motor de alertas em `src/server/alerts.ts`. Tudo que não serve a essa pergunta ou ao registro histórico é escopo fora do MVP.

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

## Modelo de acesso

Dois gates independentes, verificados em sequência, implementados em arquivos separados que nunca se chamam (D29):

1. ESCOPO DE TIME — `TeamAccess (userId, teamId, level)`. Duro. Sem acesso, o dado não existe. O time ativo da sessão é revalidado contra `TeamAccess` em TODA requisição, em `requireTeamContext` de `src/server/scope.ts`. Nunca confiado do cookie ou do JWT, nunca cacheado na sessão, nunca resolvido para um padrão quando inválido (D30).
2. MÓDULO — `TeamModule (teamId, moduleKey)`. Duro. Gating em três camadas: navegação, rota e Server Action/query. Esconder do menu não é autorização (D32).
3. VISIBILIDADE — `PRIVATE | SHARED`. Macio. `MANAGER` no time vê os dois, `VIEWER` vê só `SHARED` (D34). Em `visibilityFilter`, arquivo separado de `teamScope`.

`isPlatformAdmin` permite criar time, criar usuário, conceder acesso e ligar módulo. Não dá acesso a dado de time nenhum — até o administrador precisa de `TeamAccess`.

`User.role` está OBSOLETO e não participa de nenhuma decisão de autorização. A coluna permanece por compatibilidade e será removida em limpeza futura.

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
pnpm team:create         # abrir um time novo (P24): time, gestor, acessos, módulos e só o mínimo semeado
pnpm team:access         # conceder ou revogar acesso a um time, por e-mail e slug
pnpm test                # node:test (tests/), em série, no banco de TESTE (.env.test) — nunca no de produção
pnpm test:db:prepare     # migrations + seed no banco de teste (.env.test)
pnpm db:verify-teams     # verificação do P22 (teamId nulo por tabela, TeamAccess por usuário); só leitura
pnpm lint && pnpm typecheck
```

Os scripts `db:*` rodam o Prisma CLI com `node --env-file=.env.local` (o CLI só lê `.env` sozinho; as credenciais ficam no `.env.local`, padrão do Next). Sem biblioteca extra.

No build da Vercel: `prisma migrate deploy && next build` — chamando o Prisma direto, sem `--env-file`, porque lá as variáveis vêm do painel da Vercel e não existe `.env.local`.

## Padrões de frontend

Antes de criar ou alterar qualquer componente visual, leia **[.claude/skills/ui-prontuario/SKILL.md](.claude/skills/ui-prontuario/SKILL.md)** e **[DESIGN.md](DESIGN.md)**. Eles definem tokens, tipografia, densidade e as restrições negativas do projeto — não são opcionais e têm precedência sobre qualquer default de shadcn/ui ou instinto genérico de "boa UI".

Nenhum componente novo sem primitivo correspondente em `/ui-lab`. Deriva visual entre fases é o risco mais provável do projeto depois de fricção de registro — trate `/ui-lab` como referência obrigatória, não como catálogo opcional.

Exceção única à proibição de emoji: o gerador de texto para WhatsApp em `src/server/whatsapp.ts` (D16). Nenhum componente de UI usa emoji.

A sidebar tem 8 itens: Hoje, Em observação, Equipe, Combinados, Validação de prioridade (com aba de devoluções), Dailies, Registros, Desenvolvimento, mais Configurações no rodapé. Oito é o teto — nenhum item novo entra sem outro sair ou virar aba.

Quem tem acesso a mais de um time vê o nome do time ativo permanentemente na barra de contexto, nunca apenas em dropdown fechado nem apenas na sidebar — ler o registro de um time pensando que é de outro é erro gerencial real. Trocar de time redireciona para a home do time novo, nunca para a rota equivalente. Ação indisponível por nível de acesso fica AUSENTE da interface, não desabilitada.
A sidebar monta os itens a partir dos módulos habilitados: módulo desligado, item não existe.

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
- `Central.slug` é derivado do nome (minúsculas, sem acento, hífens) e é a chave de deduplicação. Criar central verifica o slug antes de inserir.
- `Agreement.centralId` e `PriorityValidation.centralId` são opcionais. Registros anteriores ao P19 ficam sem central, e "sem central informada" é linha legítima em qualquer métrica.
- `Central.externalId` existe para sincronização futura com a plataforma de rastreamento. Nenhuma integração foi feita.
- `DevReturn.priorityValidationId` é preenchido automaticamente por `ticketRef` quando existe validação para o mesmo chamado; nulo é normal.
- `DevReturn.reasonId` é obrigatório no zod e NOT NULL no banco.
- `WatchItem` tem todos os vínculos opcionais; só `title` e `heat` são obrigatórios.
- Estado de revisão e "fogo alto frio" são DERIVADOS em query a partir de `lastReviewedAt`, `heatChangedAt` e das cadências de Settings. Nunca persistidos (D9).
- `WatchReview` registra cada revisão, com grau antes e depois. Revisão não escreve em `TimelineEvent`.
- Nem `PriorityValidation` nem `DevReturn` escrevem em `TimelineEvent` (D15, D21).
- Prazo de combinado (D28): combinado criado na Seção 3 de uma daily nasce com `originalDueDate` e `dueDate` iguais à DATA DA DAILY. Reagendar na daily do dia D propõe o próprio dia D. Combinado criado fora de daily nasce com prazo HOJE. `originalDueDate` continua imutável (D17).
- Prazo igual a hoje é severidade `neutral`. O sinal de atraso começa no primeiro dia de vencimento.
- Combinado com prazo hoje NÃO entra no alerta "Combinado vencendo" nem na home. A daily é o mecanismo de revisão dele.
- `teamId` é denormalizado em toda entidade de dado de time, mesmo quando derivável via `TeamMember`. Denormalização deliberada: toda query filtra por `teamId` direto, sem join, e um join esquecido deixa de ser vazamento.
- Em toda entidade de dado de time, `teamId` entra no primeiro índice composto, para que o filtro de time seja sempre coberto.
- Nenhuma função de `src/server/queries/` ou `src/actions/` obtém o contexto por conta própria: recebe `TeamContext` como primeiro parâmetro. Isso torna o esquecimento visível na assinatura.
- Nenhuma query `$queryRaw` sem filtro explícito de `teamId` no WHERE.
- Toda escrita grava `teamId` explicitamente a partir do contexto, nunca derivando do registro pai.
- `TeamAccess` revogado preenche `revokedAt` e nunca é apagado — é registro de quem pôde ver o quê.

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
- Acesso é por time (P22, D30, D34): `TeamAccess.level` MANAGER (lê e escreve, vê PRIVATE) ou VIEWER (só lê, só SHARED). `User.role` (OWNER/MANAGER/VIEWER) é obsoleto e não decide nada; `pnpm user:create` ainda pergunta o papel só para escolher o nível do acesso que concede.
- `VIEWER` **nunca** lê um registro com `visibility: PRIVATE`, em nenhuma superfície — timeline, busca, command palette, exportação futura. Essa checagem vive nas queries de `src/server/queries/`, não em filtro de UI.
- Toda escrita grava uma entrada em `AuditLog` (`action`, `entity`, `entityId`, `before`, `after`, `userId`, `at`). Sem exceção, inclusive para escritas administrativas em `/settings`.
- Nenhum endpoint público. Sem REST, sem rota de API além de `api/auth/[...nextauth]`. Toda mutação é Server Action autenticada (D8).
- Dados de pessoas ficam no Brasil: banco Neon em `aws-sa-east-1`. Alinhar com RH/jurídico antes de inserir dados reais é responsabilidade do usuário, não do Claude Code — não presumir que já foi feito.
- Padrão de visibilidade por entidade: `Note`, `OneOnOne` e `Feedback` nascem PRIVATE. A única exceção é `Feedback` de categoria RECOGNITION, cujo formulário sugere SHARED como padrão — sugere, não impõe.
- A rota `/ui-lab` é bloqueada em produção via NODE_ENV. Ela expõe estados de componente e não deve existir fora de desenvolvimento.
- `WatchItem` nasce com `visibility: PRIVATE` sem exceção, e não há configuração que mude esse padrão.
- `src/server/whatsapp.ts` NUNCA inclui `WatchItem`, em nenhuma seção, nem quando a observação está marcada como SHARED. É proibição absoluta, não default.
- O PDF da daily (`src/lib/daily-report.ts`) inclui TODAS as observações ativas que quem gera pode ler — para o MANAGER do time, inclusive as PRIVATE; para o VIEWER, só as SHARED (a query aplica `visibilityFilter`). Decisão do usuário em 08/10/2026: o PDF é documento gerencial e avisa no topo quando contém observação privada. Cada exportação grava `daily.export.pdf` no AuditLog. A proibição do WhatsApp (D25) não muda.
- A suíte `tests/isolation.test.ts` é obrigatória e precisa passar antes de qualquer merge. Inclui o teste estrutural que varre queries e actions em busca de `where` sem `teamId`. A lista de exceções é explícita e comentada; a regra nunca é desligada.
- Tentativa de acessar time sem permissão resulta em ERRO, nunca em lista vazia. Lista vazia esconde o bug.
- Desligar um módulo não apaga dado: torna inacessível pela interface.

## Contrato de importação de métricas

Nada disto está implementado no MVP (D5, P17): não há importador, rota ou integração com helpdesk. É o contrato que a importação futura deve seguir — os tipos estão em `src/server/score.ts` (`MetricResultImport`, `ExplainedScore`), sem implementação.

- **Formato de cada linha (`MetricResult`)**: `metricKey` (a `MetricDefinition.key` da organização, ex.: `csat`, `sla_first_response`), `memberEmail`, `periodStart` e `periodEnd` (datas de negócio, `AAAA-MM-DD` na carga, gravadas como `@db.Date`), `value` (número, na unidade da métrica — % de 0 a 100, minutos, nota, chamados), `sampleSize` (inteiro ≥ 0) e `sourceRef` (opcional: id do lote ou relatório de origem). `importedAt` é preenchido pelo banco.
- **Correspondência analista do helpdesk ↔ `TeamMember`**: pelo e-mail, comparado sem caixa e sem espaços com `TeamMember.email`. Linha cujo e-mail não casa com exatamente uma pessoa da organização é recusada e listada no relatório da importação — nunca casada por nome, nunca criando pessoa. `TeamMember` continua não sendo `User` (D1).
- **Chave da métrica**: `MetricDefinition.key` é fixa depois de criada (a tela não deixa mudar). Chave desconhecida ou métrica desativada: a linha é recusada.
- **Granularidade de período**: mês civil fechado (do dia 1 ao último dia). Mês corrente nunca é importado. A unicidade `(memberId, metricDefinitionId, periodStart, periodEnd)` torna a reimportação do mesmo mês uma substituição (upsert), não uma duplicata. Período de outro tamanho exige decisão explícita antes de existir.
- **`sampleSize` é obrigatório**: linha sem cobertura é recusada; `0` é aceito e significa "sem amostra" — o valor não é exibido como número. Nenhuma métrica aparece sem a cobertura ao lado ("CSAT 4,8 · 6 avaliações"); abaixo de uma amostra mínima por métrica, a tela marca "amostra pequena", como no cumprimento (D19).
- **Separação**: importar métrica nunca escreve `TimelineEvent`, nunca altera `MemberTrait`, e métrica nunca aparece na mesma superfície de um feedback (Princípios, D5).
- **Score**: só existirá depois de fórmula aprovada pelo usuário. Quando existir, usa a versão ATIVA da `ScoreDefinition` (pesos somando 100, faixa de normalização por métrica, direção da métrica) e grava `ScoreResult` com TODAS as `ScoreResultComponent` (bruto, normalizado, peso, contribuição) na mesma transação. Score sem breakdown não é gravado nem exibido. Mudar pesos é versão nova — resultados antigos ficam com a versão que os gerou.

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
| D19 | Taxa de cumprimento nunca aparece sem o total de combinados ao lado, e nunca vira um número único por pessoa. Vale igualmente para taxa de devolução do desenvolvimento: o denominador é o total de chamados validados no período e aparece sempre ao lado. | Quem teve 3 combinados fáceis fecha 100%. Taxa sem denominador é propaganda, não medição |
| D20 | `Central` é tabela com `slug` normalizado desde o início, nunca coluna de texto livre | "Central Alfa", "central alfa" e "Central Alfa " fragmentariam a métrica em três. A UI parece texto livre; o armazenamento é normalizado |
| D21 | `DevReturn` é entidade separada, não um valor de `PriorityValidation.outcome` | Outro ator, outro momento, outra taxonomia de motivo, pode ocorrer sem validação prévia e pode repetir. Como valor de `outcome` sobrescreveria um fato datado (D14) |
| D22 | `DevReturnReason.category` (ANALYST / PROCESS) separa devolução treinável de atrito entre áreas | Mesma lógica de D18. Dev que pede informação desnecessária não é falha do analista |
| D23 | Migrations são aditivas e não destrutivas | O sistema está em produção com dados reais. Coluna nova é nullable, enum não perde valor, nenhum dado histórico é reescrito ou recebe backfill inventado |
| D24 | `WatchItem` tem `lastReviewedAt` e cadência derivada do `heat`; item sem revisão vira alerta | Lista de observação sem ciclo de revisão vira cemitério em dois meses. A cadência obriga a lista a responder "isso ainda está quente?" |
| D25 | `WatchItem` nasce PRIVATE e nunca entra na exportação do WhatsApp, em nenhuma hipótese | É a superfície mais provável de conter anotação gerencial crua sobre uma pessoa. Vazamento aqui é o pior do sistema |
| D26 | `WatchItem` escreve `TimelineEvent` apenas quando `memberId` está preenchido | Observação sobre pessoa é prontuário. Observação sobre central ou processo não tem prontuário onde entrar |
| D27 | Resolver um `WatchItem` exige texto de resolução | Fechar sem dizer o que aconteceu desperdiça o registro — o valor da observação está no que você aprendeu |
| D28 | O prazo padrão de combinado criado em daily é a data da própria daily, não o dia seguinte. Prazo igual a hoje é severidade neutra | O combinado é o compromisso do dia. Prazo no dia seguinte empurra tudo para frente. E se o estado normal de todo combinado novo for amarelo, amarelo deixa de significar algo |
| D29 | Autorização tem dois gates independentes: escopo de time (duro) e visibilidade (macio), em funções e arquivos separados | Bug na visibilidade mostrava nota privada. Bug no escopo mostra o prontuário de outro setor. Não podem compartilhar código |
| D30 | `TeamAccess` é a única fonte de verdade do escopo. O time ativo é revalidado contra ela em toda requisição, nunca confiado do cookie | Cookie com outro time vindo de quem não tem acesso tem que ser recusado. É o jeito número um de sistema multi-time vazar |
| D31 | Tudo é escopado por time, exceto `User`, `Organization`, `Team`, `TeamAccess` e `AuditLog` — inclusive tabelas de apoio | Uma regra só, sem exceção para lembrar ao escrever query. Senioridade compartilhada quebra no primeiro time que usa outra nomenclatura |
| D32 | Módulos são por time (`TeamModule`), com gating em navegação, rota e action/query | Esconder do menu não é autorização: a URL digitada entra |
| D33 | Time novo nasce vazio — sem pessoa fictícia, sem competência pré-definida, sem dado de demonstração | O seed do P4 é do Suporte. Semear demonstração em time de outro gestor é sujeira que ele terá que apagar |
| D34 | `PRIVATE` é visível a quem tem `level = MANAGER` naquele time. `VIEWER` nunca lê `PRIVATE` | Mantém o comportamento atual e já funciona quando um time tiver dois gestores |
| D35 | Não existe visão consolidada entre times | É a tela que mais convida dado a se misturar, e não foi pedida |
| D36 | Em tabela escopada por time, `teamId` é a única chave de escopo em query; `organizationId` nunca escopa sozinho | Duas chaves de escopo convidam a usar a errada |

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

**P16 — Busca global**
- Paleta de comandos (`src/components/shell/command-palette.tsx`, montada no shell): ⌘K / Ctrl+K em qualquer lugar, o campo de busca da barra de contexto e, abaixo de 768px, o ícone de busca. Vazia: com uma pessoa no contexto (rota `/team/<id>`), registrar para ela; Registrar (Nova daily, Novo combinado, Validar prioridade, Registrar 1:1, Dar feedback, Anotação — os três últimos perguntam "com quem?" na própria paleta; Backspace no campo vazio volta); Ir para (páginas); combinados recentes (`recentAgreements`). Digitando: pessoas (abrir perfil e, para quem escreve, as quatro ações de registro para a primeira pessoa encontrada), ações e páginas que casam (filtro próprio sem acento, `shouldFilter={false}`), a busca no servidor agrupada por tipo com trecho e destaque, e "Ver todos" em `/search`. VIEWER só navega e busca. Leituras via Server Actions de leitura em `src/actions/search.ts` (`searchPalette`, `loadRecentAgreements`).
- Busca no servidor (`src/server/queries/search.ts`, `searchAll`): Postgres full-text em português — migration `full_text_search` cria colunas `searchVector` GERADAS (`to_tsvector('portuguese', immutable_unaccent(...))`) com índice GIN em TimelineEvent (título e resumo), Feedback (contexto, comportamento, impacto, orientação), OneOnOne (todos os campos de texto), Note (título e corpo) e Agreement (título, detalhes, resultado). `immutable_unaccent` é um wrapper IMMUTABLE da extensão `unaccent` (busca sem acento). No schema, `searchVector Unsupported("tsvector")? @default(dbgenerated())` — o app nunca escreve nela; `migrate diff` contra o banco sai vazio. Consulta: cada palavra como prefixo, todas exigidas (`toTsQuery` em `src/lib/search.ts`, só letras e números — nada vira operador). Grupos: pessoas (nome sem acento, `ILIKE`), 1:1, feedbacks, anotações, combinados e outros registros da timeline (daily, PDI, mudança de carreira), cada um com total; ordem por `ts_rank` e data. `visibilitySql` em cada tabela sensível: o VIEWER não encontra PRIVATE nem pela contagem. Registros excluídos ficam fora; pessoas desligadas continuam encontráveis.
- Trecho e destaque no servidor-cliente sem HTML: `highlight(text, query)` (puro) devolve partes; `HighlightedText` (primitivo novo) marca com `--accent-wash`. Sem acento e por radical aproximado ("relatorios" marca "relatório").
- `/search` (fallback): termo, tipo e período na URL (`?q=&type=&period=`, `src/lib/search.ts`), até 10 por grupo com "ver só …" e até 50 com tipo; tempo da busca no subtítulo. Links: 1:1 e feedback abrem o registro no painel de `/team/<id>/records?period=all&open=<tipo>:<id>` (`RecordsTable.initialOpen`); anotação vai à timeline filtrada; combinado ao detalhe; daily ao detalhe da daily.
- `CommandDialog` passou a pôr o título acessível dentro do conteúdo; o campo da paleta não desenha outline (cobria a primeira letra).

**P17 — Arquitetura de score (sem cálculo)**
- `/settings/metrics`: cadastro de `MetricDefinition` no catálogo genérico (kind `metric`, sem posição): rótulo, chave (minúsculas/números/_, única, fixa depois de criada), unidade, direção ("maior é melhor" / "menor é melhor"), sistema de origem, ativa. Coluna "Resultados" mostra que nada foi importado; em uso (resultado ou componente de score) não se exclui. Seed com as nove métricas do P17 (volume, SLA de primeira resposta, SLA de atendimento, CSAT, retorno em 72h, recorrência, reabertura, backlog, tempo médio), sem nenhum resultado.
- `/settings/score`: definições versionadas (`src/components/settings/score-list.tsx`, `score-detail.tsx`; escrita em `src/server/score-definitions.ts` + `src/actions/score.ts`; leitura em `src/server/queries/score.ts`). Definição nova nasce v1 em rascunho; componentes com peso (%) e faixa de normalização (mínimo < máximo); soma dos pesos exibida e validada — ativar exige 100% (`src/lib/score-composition.ts`); uma versão ativa por nome; versão ativa (ou com resultado) fica travada — "Nova versão" copia a composição; só rascunho se exclui. Tudo auditado (`settings.score.*`, `settings.metric.*`).
- `/settings/score/[id]/preview`: pré-visualização da COMPOSIÇÃO (barra dos pesos, métrica, direção, peso, faixa e como seria lido) — documentação viva, não execução: não lê `MetricResult`/`ScoreResult` de ninguém.
- `src/server/score.ts`: só tipos, com o aviso no topo. Contrato de importação documentado na seção "Contrato de importação de métricas". Nenhuma tela de pessoa mudou (teste estático garante que nenhuma lê métrica ou score).

**P18 — Mobile, acessibilidade e deploy**
- Mobile (360–768px): toda DataTable vira lista empilhada com o título e os 2 campos mais importantes à vista (`stackedOrder` define a ordem só no celular) e o resto atrás de "Mais detalhes (N)", alvo de 44px; vazia, a lista não é `role="list"`. Em ponteiro grosso (`@media (pointer: coarse)` no globals.css) botões, selects, campos, abas, itens de menu e de paleta e links de navegação têm no mínimo 44px; checkbox ganha área de toque de 44px sem mudar o desenho. Timeline: abaixo de 768px a calha encolhe para 24px (só a régua) e a data sobe para o topo de cada entrada. `RouteTabs` rola até a aba ativa. Formulários longos (daily, 1:1) mostram `DesktopHint` (primitivo novo) e continuam funcionais; os curtos (combinado, anotação, validação) não mudam. Na equipe, o cargo sai da linha no celular; a coluna de atenção mostra a gravidade em texto ao lado do ponto.
- Instalação como atalho: `src/app/manifest.ts` (standalone, pt-BR), `src/app/icon.svg`, `src/app/apple-icon.png` e `public/icons/icon-{192,512}.png`; `appleWebApp` e `viewport` no layout raiz. Manifest e ícones fora do middleware de login. SEM service worker, cache offline ou sincronização.
- Acessibilidade: contraste AA de todos os tokens de texto verificado em teste (`tests/a11y.test.ts`), inclusive severidade sobre o próprio wash; `--ink-tertiary` (3,2:1) ficou só para placeholder nativo, desabilitado e ícone — texto informativo, "—" de ausência e placeholder de select passaram a `--ink-secondary` (DESIGN.md e skill atualizados). Foco nunca removido: o campo da paleta, que não tem outline, mostra uma barra de 2px em `--accent` na base. `prefers-reduced-motion` desliga animação e transição. Timeline: cabeçalho de mês é h2, botão de visibilidade sem `aria-label` divergente do texto, abas de período sem `aria-controls` para painel inexistente. Lighthouse (acessibilidade, perfil mobile) 100 nas telas principais, como gestor e como VIEWER.
- Deploy preparado: `vercel.json` (build `pnpm exec prisma migrate deploy && pnpm exec next build`, região `gru1`), `.env.example` com todas as variáveis comentadas, README com o passo a passo da Vercel (variáveis, Deployment Protection com Vercel Authentication / Standard Protection, previews no branch `dev` do Neon) e o backup. `/ui-lab` responde 404 em produção (verificado autenticado). O deploy em si depende da sua conta na Vercel (BLOCKERS.md).
- Backup: `pnpm db:backup [pasta]` (`scripts/db-backup.ts`) roda `pg_dump --format=custom` com a `DIRECT_URL` para `backups/prontuario-DD-MM-AAAA.dump` (pasta no `.gitignore`); exige cliente PostgreSQL 18+. Agendamento semanal (Agendador de Tarefas / cron) e restauração com `pg_restore` no README.

**C1 — Prazo padrão do combinado (D28)**
- Combinado criado na Seção 3 da daily nasce com a data da daily (também na retroativa); reagendar e substituir na Seção 1 propõem a data da daily; a criação rápida nasce com hoje. Prazo hoje é severidade neutra ("Vence hoje"); vencido há 1 dia é âmbar; 2–7 laranja; 8–30 vermelho; > 30 "provavelmente esquecido". "Combinado vencendo" (alerta, coluna de atenção de /team) e os próximos acompanhamentos da home não contam prazo hoje. WhatsApp omite o prazo igual à data da daily. `nextBusinessDay` continua em `src/lib/dates.ts` (testado), sem uso nos padrões.

**P19 — Central de atendimento (D20, D23)**
- Migration aditiva `20261008120000_centrals`: tabela `Central` (`slug` único por organização, `externalId` reservado, `isActive`, `note`, `deletedAt`) e `centralId` NULLABLE em `Agreement` e `PriorityValidation`, com índices `(centralId, createdAt)` e `(centralId, validatedAt)`. Nenhum backfill.
- Regras puras em `src/lib/centrals.ts` (`centralSlug`, `previewCentralImport`, `centralWhere`, `centralFilterOptions`); escrita em `src/server/centrals.ts` (`ensureCentralRecord` — devolve a existente pelo slug, nunca duplica, não reativa; `importCentralsRecord`; `resolveCentralId`) e `src/actions/centrals.ts`.
- `CentralCombobox` (`src/components/ui/CentralCombobox.tsx`, no /ui-lab): parece texto livre, filtra sem acento, "Criar central: <texto>" cria e seleciona sem dialog, grafia diferente da mesma central usa a existente com aviso discreto; opcional, sem parada extra no Tab, Enter só escolhe com a lista aberta. Usado na Seção 3 da daily (responsável → central → título → prazo; a central criada numa linha vale para as outras), na criação rápida de combinado (visível de cara) e em /priority-validations (entre responsável e prioridade do analista).
- Colunas de central em /agreements e /priority-validations; filtro "Central" (inclusive "Sem central informada") no popover, na URL (`?central=<id>|none`).
- WhatsApp: "- Pessoa — Central — Título" quando há central; sem ela, a linha sai sem; prazo segue a regra do C1.
- `/settings/centrals`: CRUD no catálogo genérico (desativar preenche `deletedAt` e tira dos formulários; histórico continua apontando) e importação por colagem (uma por linha ou `nome;externalId`), com pré-visualização de novas, já existentes (ignoradas, sem reativar) e vazias/inválidas; cria só as novas numa transação, auditado `settings.central.import`.
- Métrica em `src/server/queries/centrals.ts`: `volumeByCentral`, `centralsInDailies`, `centralByMember` (carga, nunca comparação de pessoas — D7), `priorityDisputeByCentral`; seção "Por central" em `/agreements/adherence` (combinados, validações, alteração de prioridade com o total, dailies), por volume, com "Sem central informada" no fim e a cobertura do campo.

**P20 — Devolução do desenvolvimento (D21, D22, D23)**
- Migration aditiva `20261009120000_dev_returns`: enum `DevReturnCategory` (ANALYST / PROCESS), `DevReturnReason` (com `requiresDetail` para o "Outro", conferido por trigger) e `DevReturn` (`reasonId` NOT NULL, `priorityValidationId` e `centralId` opcionais, `resolvedAt`/`resolutionNote`, soft delete) com os cinco índices pedidos. O catálogo inicial de 13 motivos é gravado pela própria migration em cada organização existente (dado de catálogo, não backfill) e pelo seed numa organização nova (`DEFAULT_DEV_RETURN_REASONS` em `src/lib/dev-returns.ts`). `ValidationOutcome` e `PriorityValidation` não mudaram.
- Escrita em `src/server/dev-returns.ts` (+ `src/actions/dev-returns.ts`): criar, editar, marcar como reenviado, excluir (lógica), tudo auditado (`devReturn.*`), sem TimelineEvent. O ID do chamado sai da URL por `withExtractedRef` (a mesma função da validação); `priorityValidationId` é ligado no servidor à validação mais recente do mesmo `ticketRef` — sem nenhuma, nulo.
- Leituras em `src/server/queries/dev-returns.ts`: `getDevReturns`, `getDevReturnSeries`, `getReasonBreakdown`, `getTeamDevReturns`, `getReturnOverlap`, `getTicketContext`, `listDevReturns`, `getMemberDevReturnProfile`. Regras puras em `src/lib/dev-returns.ts`: toda taxa é `{ count, total, percent, lowConfidence }` com o denominador = validações de prioridade do mesmo período e recorte (D19); `lowConfidence` abaixo de 20; atribuível (ANALYST) nunca sem a total.
- `/dev-returns` (aba de "Validação de prioridade" — `TriageTabs` nas duas páginas, `also` no item da sidebar; nenhum item novo): formulário fixo no topo (URL → ID em mono → linha somente leitura "Validado em DD/MM — prioridade do analista X, validada Y, resultado Z" e quantas devoluções o chamado já teve → analista e central pré-selecionados da validação → data, hoje por padrão → motivo agrupado por categoria, Analista primeiro → "Outro" abre o texto → quem devolveu → observação; Ctrl/⌘+Enter salva, limpa e volta à URL), resumo em StatStrip com "7% (12 de 180 chamados)" e a marca de amostra pequena, tabela (data, chamado com link e marca "validado", analista, central, motivo com a categoria, quem devolveu, reenviado; "Marcar como reenviado" na linha, editar/excluir no menu) e a seção "Prioridade alterada e devolvido". Filtros na URL (`src/lib/dev-return-filters.ts`): período (padrão 30 dias), analista, motivo, categoria, central, apenas em aberto.
- Perfil, coluna estreita, abaixo da validação: devoluções em 90 dias com os chamados validados ao lado, atribuíveis (N de M), motivo mais frequente, sparkline de 6 meses e "Registrar feedback sobre isto" com contexto só sugerido.
- Alertas (`src/server/alerts.ts`): "Devoluções recorrentes" (3+ ANALYST pelo mesmo motivo em 60 dias) e "Devolução sem reenvio" (> 7 dias; laranja > 14, vermelho > 30), contados no item Validação de prioridade da sidebar (`nav: "validations"`). Limiares fixos em `DEV_RETURN_ALERTS` (não estão em /settings).
- `/settings/dev-return-reasons`: CRUD no catálogo genérico com categoria, ordem (Subir/Descer) e "exige descrever".

**P21 — Em observação (D24–D27)**
- Migration aditiva `20261010120000_watch_items`: enums `WatchHeat`, `WatchStatus`, `WatchOrigin`; `WatchItem` (todos os vínculos opcionais; `visibility` nasce PRIVATE; `lastReviewedAt`/`heatChangedAt` preenchidos na criação; CHECK de resolução com texto) e `WatchReview` (grau antes e depois, nota opcional); valor `WATCH` em `TimelineEventType` e `TimelineEvent.watchItemId` (nulo, FK em cascata).
- Regras puras em `src/lib/watch.ts`: cadência por grau, `reviewState` (em dia / sem revisão / muito atrasada acima do dobro), `coldHighDays` (fogo alto sem mudar de grau há mais de `watchStaleHighDays`), `stalledDays` (nunca revisada há mais de 14 dias), `showsOnHome` (alto e médio sem revisão; baixo só passado o dobro). Nada disso é persistido (D9). Cadências em /settings/thresholds (`watchHighCadenceDays` 2, `watchMediumCadenceDays` 7, `watchLowCadenceDays` 21, `watchStaleHighDays` 30), na tabela `AlertThreshold` que já existia.
- Escrita em `src/server/watch.ts` (+ `src/actions/watch.ts`): criar (devolve a ativa já ligada ao mesmo registro em vez de duplicar), "Revisado hoje" (um clique: WatchReview + `lastReviewedAt` + `reviewCount`), esfriar/esquentar (WatchReview com antes → depois e `heatChangedAt`; conta como revisão), resolver (texto obrigatório — D27), arquivar, visibilidade (sincroniza a timeline na mesma transação). Timeline WATCH só com pessoa (D26), na criação e na resolução; revisão não. Leituras em `src/server/queries/watch.ts`, sempre com `visibilityFilter` (o teste estático de visibilidade passou a cobrir `watchItem`).
- `WatchButton` (`src/components/watch/watch-button.tsx`, no /ui-lab): ícone de 16px que abre popover inline (título pré-preenchido, grau, contexto), confirma por 2 s e, com observação ativa no mesmo registro, fica preenchido na cor do grau e mostra a existente ("Revisado hoje", "Abrir observação"). Em: daily (nota de cada pessoa — Alt+O abre pelo teclado —, linha de combinado novo e revisão Parcial/Não feito com o impeditivo como contexto), detalhe do combinado, dialog de criação de combinado, linhas de /priority-validations e /dev-returns, dialogs de 1:1 e feedback, cabeçalho do perfil ("Colocar em observação") e /watch ("Nova observação"; a paleta abre `/watch?new=1`). Em formulário ainda não salvo (daily, 1:1, feedback, combinado), a observação nasce com a pessoa e ganha o vínculo com o registro ao salvar (`linkPendingWatchItems`, na mesma transação).
- `/watch` (2º item da sidebar, contador = fogo alto ativo, da mesma fonte de `getAlerts`): abas Ativas | Sem revisão | Resolvidas | Arquivadas | Todas e filtros (grau, pessoa, central, origem) na URL; agrupada por grau, o mais esquecido no topo; linha com SeverityDot do estado de revisão, título, vínculos clicáveis, dias desde a última revisão, contagem de revisões e "fogo alto há N dias sem mudar de grau"; painel com o histórico completo de revisões e a visibilidade.
- Home: alertas "sem revisão", "fogo alto frio" e "parada" (no máximo um por item, o mais forte) na lista única; ritmo de gestão com "Em observação" e o fogo alto ao lado. Perfil: bloco das ativas da pessoa (até 4) acima dos blocos de métrica.
- WhatsApp nunca lê observação (teste garante).

**C2 — PDF da daily**
- "Baixar PDF" no detalhe da daily e em cada linha do histórico (`DownloadDailyPdfButton`, no /ui-lab). A Server Action de leitura `exportDailyPdf` monta o arquivo no servidor e o navegador baixa `daily-DD-MM-AAAA.pdf`, sem janela nem diálogo.
- Modelo do time de treinamento adaptado ao suporte: cabeçalho (data, quem registrou, presentes, ausentes), uma seção por pessoa em ordem alfabética — "Combinados de ontem" (desfecho, impeditivo com motivo, novo prazo ou substituto), "Nota" (bloqueio em negrito) e "Combinados de hoje | DD/MM" (central e prazo quando difere da daily) —, quem não teve registro numa linha só, resumo, decisões e o bloco "Em observação".
- "Em observação": todas as ativas legíveis por quem gera, agrupadas por grau e com a mais esquecida primeiro. Observação ligada a um combinado ou nota desta daily ganha "em observação (grau)" na linha da pessoa e, no bloco final, só o título com "aparece acima" — sem repetir o contexto. As demais saem com o contexto (até 180 caracteres), exceto fogo baixo (só o título); estado "sem revisão há N dias" ou "fogo alto há N dias sem mudar de grau" ao lado.
- Gerador de PDF próprio em `src/lib/pdf.ts` (sem biblioteca nova): A4, Helvetica/negrito/itálico padrão em WinAnsi (acentos do português), quebra de linha e de página, rodapé com "gerado em DD/MM/AAAA HH:mm" e "Página N de M". Emoji e caracteres fora do WinAnsi viram "?". Testes em `tests/daily-report.test.ts`.

**P22 — Multi-tenancy no banco e no acesso (D29–D36)**
- Três migrations, nesta ordem: `20261011120000_team_scope_expand` (TeamAccess, TeamModule, `User.isPlatformAdmin`, `Team.slug/isActive/createdAt/createdByUserId`, `AuditLog.teamId` e `teamId` NULLABLE em 36 tabelas; nenhuma constraint nova em tabela existente), `20261011120100_team_scope_backfill` (SQL determinístico: falha se não houver exatamente 1 time; T recebe slug `suporte`; toda linha recebe `teamId = T`; OWNER vira `isPlatformAdmin` + TeamAccess MANAGER, MANAGER → MANAGER, VIEWER → VIEWER; os três módulos ligados; falha se sobrar `teamId` nulo) e `20261011120200_team_scope_restrict` (NOT NULL, FK para Team com ON DELETE RESTRICT, `teamId` no primeiro índice composto, unicidades de catálogo passam de organização para time, `AlertThreshold` com chave `(teamId, key)`). `pnpm db:verify-teams` confere depois.
- `src/server/scope.ts` (gate 1, duro): `TeamContext`, `requireTeamContext` (cookie `active-team` httpOnly/lax/secure em produção, SEMPRE reconfirmado contra TeamAccess não revogado e time ativo; um time só → resolve e regrava; mais de um sem escolha válida, ou nenhum → redireciona para `/select-team`, desde o P23), `requireWriteContext`, `teamContextFor`, `teamScope`, `teamSql`, `requireManager`, `canWrite`, `hasModule`, `requireModule`. `src/server/visibility.ts` (gate 2, macio) só conhece `ctx.level`; os dois não se chamam (teste garante).
- Toda query de `src/server/queries` e todo núcleo de escrita recebem `TeamContext` como 1º parâmetro e filtram/gravam `teamId` direto (sem join); Server Actions são a fronteira que monta o contexto. SQL cru (busca, /team, resumos de validação) filtra `teamId` por tabela. Timeline e auditoria gravam o time. O motor de alertas olha um time por chamada.
- Módulos (`src/lib/modules.ts`: PRIORITY_VALIDATION, DEV_RETURNS, CENTRALS) com gating em três camadas: navegação (`navItemsFor`, paleta, abas de triagem e de /settings), rota (`notFound`, /settings redireciona para a primeira aba existente) e query/núcleo (`requireModule`). Central desligada some dos formulários e das tabelas; os alertas de devolução somem sem o módulo.
- Sessão/JWT não carregam mais papel; o shell mostra o nível no time ativo. `pnpm user:create` concede TeamAccess no time escolhido (slug).
- `pnpm test` passou a usar `.env.test` (banco de teste). `tests/isolation.test.ts`: varredura estrutural (sem banco, passa) e os sete critérios com dois times reais no banco de teste (passando no banco de teste, 273/273 na suíte completa).

**P23 — Seleção e troca de time**
- `/select-team` (fora do shell, no molde do login): para quem tem mais de um time e nenhum time ativo válido — `requireTeamContext` redireciona para lá (o middleware roda no Edge, sem Prisma, e não consulta TeamAccess). Uma linha por time: nome, "gerencia"/"somente leitura" e a contagem de pessoas. Setas percorrem, Enter abre (`TeamList`, listbox com uma parada de Tab). Quem tem um time só nunca vê a tela (volta para a home, que resolve sozinha); quem não tem nenhum lê o aviso e pode sair.
- Escolher ou trocar: Server Action `selectTeam` (`src/actions/team-selection.ts`) confere o time com `teamContextFor` (TeamAccess) antes de gravar o cookie, invalida todo o cache de rota (`revalidatePath("/", "layout")`) e vai para a HOME do time novo — nunca para a rota equivalente. É a única action que estabelece o contexto em vez de partir dele (exceção explícita no teste estrutural).
- Sidebar: `TeamSwitcher` acima da navegação (também no drawer). Um time: nome em texto, não controle. Mais de um: popover com a mesma `TeamList`; recolhida, só a inicial.
- Indicador persistente: com mais de um time, o nome do time ativo fica na barra de contexto à esquerda do breadcrumb (`ActiveTeamIndicator`, MetaLabel), em toda tela e largura, e entra no `<title>` (template do `(app)/layout`: "Página · Prontuário · Time"). Com um time só, nada disso aparece.
- `listAccessibleTeams(userId)` em `src/server/scope.ts`: os times do próprio usuário com nível e contagem de pessoas — só nome e número.
- `/settings/team` (só `isPlatformAdmin`; aba "Times e acessos", 404 para os outros): times da organização com identificador, ativo e contagem de pessoas; módulos com liga/desliga e a linha "desligar não apaga nada"; quem tem acesso e com que nível, conceder (dialog: usuário e nível), mudar o nível e revogar (confirmação no app, botão de perigo). Ninguém revoga o próprio acesso. Revogar preenche `revokedAt`; conceder de novo reabre a mesma linha com data e autor novos. Tudo auditado no time alvo (`team.module.enable|disable`, `team.access.grant|level|revoke`). Leitura em `src/server/queries/teams.ts` (`listTeamsForAdmin`), escrita em `src/server/teams.ts` + `src/actions/teams.ts` via `requireAdminContext` (administrar não exige MANAGER no time ativo e não dá acesso a dado de time).
- Gating de módulo complementado: o atalho "Validar prioridade" da home some sem o módulo. Somente leitura: o indicador já reflete o nível no time ativo; as ações de escrita continuam ausentes para o VIEWER.
- `tests/isolation.test.ts`: seleção lista só os times com acesso (o admin sem TeamAccess não vê nenhum); administração só para `isPlatformAdmin`, com auditoria no time alvo, módulo desligado sem apagar dado e revogação sem apagar a linha; as três escritas novas entram na tabela de escritas (VIEWER recebe erro).

**P24 — Provisionamento de time (D33)**
- `pnpm team:create` (`scripts/team-create.ts` → `createTeam` em `src/server/provisioning.ts`), interativo, numa transação: Team (ativo, `createdByUserId` = o `isPlatformAdmin` da organização, ou `ADMIN_EMAIL`), conta do gestor (reaproveitada se o e-mail existe; senão senha aleatória mostrada uma vez), TeamAccess MANAGER do gestor, TeamAccess VIEWER para quem é VIEWER em TODOS os outros times ativos (VIEWER de um time só, ou quem gerencia algum, não entra), TeamModule só dos módulos escolhidos (padrão: nenhum), e o mínimo de `src/lib/team-defaults.ts` — senioridades Júnior/Pleno/Sênior, os nove motivos de impeditivo, cadências de observação 2/7/21/30 (`AlertThreshold`). AuditLog `team.create` (e `user.create` da conta nova). Não exige o e-mail no ALLOWED_EMAILS: imprime a linha pronta para a Vercel. Nenhuma pessoa, competência, responsabilidade, registro ou demonstração (D33).
- `pnpm team:access` (`grantAccess`/`revokeAccess`): conceder, mudar o nível e revogar por e-mail e slug; revogar preenche `revokedAt`; conceder de novo reabre a mesma linha. Auditado.
- `pnpm db:verify-teams` também imprime as linhas por time em cada tabela, para comparar antes e depois de abrir um time.
- Primeiro acesso (time vazio): /team "Comece cadastrando as pessoas do seu time." + Adicionar pessoa; / "Cadastre seu time para começar a ver o que precisa de atenção." (e o motor não acusa nada com o time vazio); /dailies "Registre sua primeira daily." + botão; /agreements "Os combinados aparecem aqui conforme você registra dailies e 1:1."; /watch "Nada em observação. Você pode marcar algo de qualquer tela."; /development sem competência e sem PDI mostra só "Cadastre competências em Configurações antes de criar PDIs." + Ir para Competências; /records "Registre seu primeiro 1:1 ou feedback.". Para o VIEWER, as telas que mandariam registrar dizem o estado ("O gestor ainda não cadastrou…").
- README: seção "Abrir um time novo" (comandos, o que é e o que não é semeado, o passo manual do ALLOWED_EMAILS na Vercel).
- `tests/provisioning.test.ts`: organização própria (`prov_`) com Suporte, Extra, um VIEWER de todos e um VIEWER de um só; confere a transação inteira, o mínimo semeado, nenhum módulo, o Suporte intacto, o reaproveitamento do gestor, as recusas e conceder/mudar/revogar sem apagar.

## Backlog de curto prazo

As 18 fases do MVP estão entregues (tabela em PROGRESS.md). O que ficou de fora, por ordem de valor:

**Para colocar em uso**
- Deploy na Vercel com as variáveis de produção, Deployment Protection (Vercel Authentication, Standard Protection) e previews apontando para o branch `dev` do Neon — depende da conta do usuário (BLOCKERS.md). Depois: `/ui-lab` 404 no domínio, login, tempo da busca na região `gru1`.
- Conta do VIEWER (`ALLOWED_EMAILS` + `pnpm user:create`), quando houver o e-mail.
- Matriz de competências (`/settings/competency-matrix`): o seed não a preenche; sem ela não há marca do esperado nem prontidão.
- Backup: instalar o cliente PostgreSQL 18 e agendar `pnpm db:backup` semanal; testar uma restauração.
- Alinhar com RH/jurídico antes de inserir dados reais (responsabilidade do usuário).

**Checagens humanas (MANUAL-COMPLETO.md, Parte E)**
- `/ui-lab` olhado de verdade (as seções novas de P8 a P18 só foram vistas por captura).
- Cronômetros: daily com 5 revisões, 4 notas e 3 combinados em menos de 3 minutos; 10 validações em menos de 2 minutos; combinado em 15 segundos; home "em 10 segundos eu sei o que fazer".
- Teste de vazamento com uma nota PRIVATE real (OWNER cria, VIEWER não vê em timeline, busca, paleta e contadores).
- Uso de ponta a ponta num iPhone (atalho na tela inicial, login, captura de combinado, leitura do perfil).

**Funcionalidade fora do MVP (decisões registradas em PROGRESS.md)**
- Daily: excluir uma daily e editar revisões/combinados de daily já salva; mudar prazo ou responsável fora da daily (esconderia o arrasto — exige decisão).
- Competências: histórico de níveis (o schema guarda um nível por pessoa × competência).
- Validação de prioridade: telas de relatório (as queries `summaryBy*` já existem).
- Busca: resumo e decisões da daily, validações, pontos fortes/de desenvolvimento; anotação ainda abre pela timeline filtrada.
- Hoje: registrar acompanhamento de PDI direto da lista; limiares por pessoa (hoje são por organização).
- Métricas: importador do helpdesk segundo o "Contrato de importação de métricas" (nada implementado). Score: fórmula só depois de aprovada pelo usuário (D5), sempre com breakdown.
- Fora do MVP por decisão: modo escuro, testes E2E, Sentry, upload de arquivo, notificações.

**Próximas entregas (pós-MVP)**
- C1 — Correção do prazo padrão do combinado (D28). _(Entregue.)_
- P19 — Central de atendimento (D20). _(Código entregue; migration aguarda aplicação no banco de produção.)_
- P20 — Devolução do desenvolvimento (D21, D22). _(Código entregue; migration aguarda aplicação no banco de produção, junto com a do P19.)_
- P21 — Em observação (D24–D27). _(Código entregue; migration aguarda aplicação no banco de produção, junto com as do P19 e P20.)_
- P22 — Multi-tenancy no banco e no acesso (D29–D36). _(Entregue e ensaiado no banco de teste; migrations aguardam aplicação em produção.)_
- P23 — Seleção e troca de time. _(Entregue.)_
- P24 — Provisionamento de time. _(Entregue. Treinamento e Hardware criados em produção em 09/10/2026.)_

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
