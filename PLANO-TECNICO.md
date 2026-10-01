> **DOCUMENTO HISTÓRICO — NÃO É FONTE DE VERDADE.**
> Escrito antes das decisões D11 a D19. Contém informação desatualizada sobre:
> autenticação (descreve Google OAuth; o projeto usa Credentials), enum de
> `Agreement.status` (lista OVERDUE, que não existe), e o modelo de dados (não
> contém `originalDueDate`, `AgreementCheckin`, `BlockerReason`, `PriorityLevel`,
> `PriorityValidation` nem `TicketUrlPattern`).
> O modelo de dados vigente está no prompt da fase P3, dentro do MANUAL-COMPLETO.md.
> As decisões vigentes estão no CLAUDE.md.
> Mantido apenas pelo registro de raciocínio e análise de risco. NÃO consulte este
> arquivo para implementar nada.

# Plano Técnico — Sistema de Gestão de Equipe de Suporte

Documento de decisão. Revise, corrija o que discordar, e só depois execute os prompts do arquivo `PROMPTS-CLAUDE-CODE.md`.

Nome de trabalho sugerido: **Prontuário** (ou `prontuario-suporte` como nome do repo). O nome importa porque define a metáfora do produto — registro clínico datado, não painel de BI.

---

## 1. Decisões travadas

Estas são as decisões que **não devem ser alteradas silenciosamente** pelo Claude Code em sessões futuras. Elas vão para o `CLAUDE.md`.

| # | Decisão | Motivo |
|---|---|---|
| D1 | `TeamMember` ≠ `User`. Os 9 analistas **não são usuários** do sistema | Eles não acessam. Modelar como usuário criaria autorização, convites e sessões inúteis |
| D2 | `TimelineEvent` é **índice denormalizado**, não fonte de verdade | Registros vivem em tabelas concretas (`Feedback`, `OneOnOne`...). A timeline é uma linha-espelho escrita na mesma transação. Evita `jsonb` genérico e evita `UNION` de 8 tabelas a cada abertura de perfil |
| D3 | `Seniority` é **tabela**, não enum | Você vai querer "Especialista" ou "Tech Lead" depois. Enum em Postgres é doloroso de alterar |
| D4 | `visibility: PRIVATE \| SHARED` existe desde a primeira migration | Seu gestor tem acesso de leitura. Sem isso você se autocensura e o produto perde a função |
| D5 | Nenhuma fórmula de score no MVP | Só o esquema, os pesos configuráveis e o breakdown explicável |
| D6 | Código, schema e rotas em **inglês**. Interface em **pt-BR** | Evita o inferno de `combinado` vs `agreement` no mesmo arquivo. Um único ponto de tradução: os arquivos de label |
| D7 | Sem ranking, sem nota pública, sem gamificação | Requisito explícito seu |
| D8 | Server Actions. Sem REST público, sem tRPC, sem Redux | Só você e seu gestor usam. Não há cliente externo |
| D9 | Alertas são **derivados em query**, não persistidos | Um alerta persistido fica obsoleto no segundo seguinte |
| D10 | Soft delete apenas onde há valor histórico | `TeamMember`, `Agreement`, registros. Não em tabelas de junção |

---

## 2. Stack

| Camada | Escolha | Nota |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Components por padrão |
| Linguagem | TypeScript `strict: true` | `noUncheckedIndexedAccess` ligado |
| Estilo | Tailwind CSS v4 | Tokens via `@theme` em CSS, não em `tailwind.config` |
| Componentes | shadcn/ui (Radix) — **tokens reescritos** | Radix dá acessibilidade de graça. O visual padrão do shadcn é o "cara de IA"; substituímos todos os tokens |
| Ícones | Lucide, stroke 1.5, tamanho 16px | Padronizado. Nunca ícone acima de 20px na UI |
| ORM | Prisma 6 | Schema legível, migrations maduras, o Claude Code escreve Prisma com muito menos erro que Drizzle |
| Banco | PostgreSQL — **Neon, região `aws-sa-east-1` (São Paulo)** | Dados de pessoas permanecem no Brasil |
| Auth | Auth.js v5 (NextAuth) + Google OAuth | Se a empresa não usa Google Workspace, trocar por magic link via Resend |
| Formulários | react-hook-form + zod | Schema zod compartilhado entre client e Server Action |
| Datas | date-fns + `date-fns/locale/pt-BR`, TZ `America/Sao_Paulo` | Datas de negócio como `@db.Date`, timestamps como `timestamptz` |
| Deploy | Vercel | Região de função `gru1` se o plano permitir |
| Package manager | pnpm | |
| Node | 20 LTS ou superior | |

**Explicitamente fora:** Redux, tRPC, microserviços, GraphQL, Storybook, monorepo, testes E2E no MVP, Sentry no MVP, upload de arquivo no MVP, integração com helpdesk no MVP.

**Justificativa de Prisma sobre Drizzle:** Drizzle é mais leve e mais rápido em runtime, mas o modelo aqui tem ~25 tabelas com muitos relacionamentos opcionais (a `TimelineEvent` sozinha tem 7 FKs nullable). O `schema.prisma` mantém isso legível em um arquivo só, e o `prisma migrate` te dá um histórico versionado sem esforço. Ganho de performance de Drizzle é irrelevante para dois usuários.

---

## 3. Direção visual

Não instale o `minimalist-ui`. Criamos `.claude/skills/ui-prontuario/SKILL.md` no projeto, herdando o que presta dele e corrigindo o resto.

### Tese

O produto é um **prontuário**, não uma revista nem um dashboard. O vocabulário visual vem do registro clínico e do livro-razão: entrada datada, calha de margem, régua temporal, escala de severidade. Isso justifica cada escolha abaixo.

Deliberadamente **não** usamos o creme quente `#F4F1EA` + serifa editorial + acento terracota. Essa combinação virou o default de interface gerada por IA em 2025–2026 — é justamente a "cara de vibecoding" que você quer evitar. Vamos para neutro frio, onde âmbar e vermelho de severidade também assentam melhor.

### Tokens

```
--canvas:          #FBFBFC   fundo da aplicação
--surface:         #FFFFFF   painéis, linhas de tabela
--surface-sunken:  #F4F5F7   hover de linha, cabeçalho de tabela, estado vazio
--ink:             #16181D   texto primário (nunca #000)
--ink-secondary:   #5C6270   rótulos, metadados
--ink-tertiary:    #8A909E   placeholder, texto desabilitado
--line:            #E4E6EB   toda borda e divisor — 1px
--line-strong:     #CDD1D9   separador de seção, foco
--accent:          #2C4A7C   azul-tinta. Ação primária e seleção. Único acento não semântico
--accent-wash:     #EDF1F6   fundo de linha selecionada
```

Severidade — **a cor só comunica estado e prioridade**, nunca decora:

```
--calm:       #4B7A5A  /  wash #EDF3EF   concluído, em dia
--attention:  #A8730E  /  wash #FBF3E2   vencendo, atenção
--overdue:    #A33A32  /  wash #FAECEA   vencido, crítico
--neutral:    #5C6270  /  wash #F4F5F7   aberto, sem prazo
```

Escala graduada de idade (a mesma lógica que você já usa no backlog): neutro → âmbar → laranja → vermelho.

### Tipografia

- **IBM Plex Sans** — toda a interface. Escolha fundamentada no assunto: foi desenhada para documentação técnica e registro, tem personalidade sem virar editorial, e não é Inter (que é o default de todo mundo).
- **IBM Plex Mono** — datas, prazos, contadores, chaves, rótulos de tipo de registro. É o que faz a timeline ler como um livro-razão.
- Sem serifa em lugar nenhum.
- `font-variant-numeric: tabular-nums` global em números.
- Escala: 11 / 12 / 13 / 15 / 18 / 22 / 28. Corpo de UI a 13px, `line-height` 1.5. Densidade de gestão exige isso.
- Sentence case em tudo. Uppercase apenas em rótulos mono de 11px com `letter-spacing: 0.06em`.

### Elemento assinatura

**A calha temporal da timeline.** Uma régua vertical de 1px à esquerda, com a data em mono na margem, o tipo do registro como etiqueta mono de 11px, e um traço de severidade que sangra para dentro da calha quando o item está vencido ou exige ação. É o único momento de ousadia visual do produto. Todo o resto fica quieto.

### Regras de densidade e comportamento

- Altura de linha de tabela: 40px. Modo compacto opcional: 32px.
- Raio: 4px em controles, 6px em contêineres. `rounded-full` só em avatar.
- Sombra: zero em cards. `0 1px 2px rgba(16,18,24,0.04)` apenas em popover, dropdown e dialog.
- Hover de linha: `--surface-sunken`. Selecionada: `--accent-wash` + barra `inset 2px` de `--accent` na esquerda (inset, para não deslocar conteúdo).
- Foco visível: `outline: 2px solid --accent; outline-offset: 1px`. Nunca remover.
- Movimento: 120–160ms, só `opacity` e `transform`. **Nenhum scroll-reveal, nenhum stagger.** Você reabre a mesma tela 20 vezes por dia — animação de entrada vira ruído. `prefers-reduced-motion` respeitado.
- Largura: contêiner fluido até 1600px. Nada de `max-w-4xl`.
- Sem emoji na UI. Sem gradiente. Sem glow. Sem ícone acima de 20px. Sem gráfico decorativo.

### Layout

- **Desktop (≥1024px):** sidebar fixa de 232px, colapsável para 56px. Sem navbar superior grande — apenas uma barra de contexto de 48px com breadcrumb, busca e ação primária da tela.
- **Tablet/mobile:** sidebar vira drawer. Tabelas viram lista de linhas empilhadas (não scroll horizontal). Ações secundárias entram em menu de overflow.
- Sidebar com **6 itens + configurações**: Hoje · Equipe · Combinados · Dailies · Registros (1:1 e feedbacks) · Desenvolvimento · ⌄ Configurações.

---

## 4. Arquitetura de informação

```
/                       Hoje — central diária, motor de alertas
/team                   Equipe — listagem com filtros
/team/[memberId]        Perfil (abas: overview | timeline | agreements | development | records)
/agreements             Central de combinados
/dailies                Histórico de dailies
/dailies/new            Registro rápido de daily
/records                1:1 e feedbacks — índice cruzado
/development            PDIs, competências, mentorias
/search                 Busca global (fallback do ⌘K)
/settings               Time, senioridades, competências, limiares de alerta, score
/ui-lab                 Catálogo de componentes (dev only, fora de produção)
```

Rotas em inglês (D6). Rótulos em pt-BR vindos de `src/lib/labels.ts`.

Perfil usa abas em rota (`/team/[id]/timeline`) e não estado local, para que cada aba seja linkável e o seu gestor possa receber um link direto.

---

## 5. Modelo de dados

### 5.1 Tenancy e acesso

| Entidade | Campos principais |
|---|---|
| `Organization` | `id`, `name`, `slug`, timestamps |
| `User` | `id`, `email`, `name`, `image`, `role` (`OWNER \| MANAGER \| VIEWER`), `organizationId` |
| `Account`, `Session`, `VerificationToken` | Tabelas do Auth.js |
| `Team` | `id`, `organizationId`, `name`, `managerUserId` |
| `AuditLog` | `id`, `organizationId`, `userId`, `action`, `entity`, `entityId`, `before` jsonb, `after` jsonb, `at` |

`OWNER` = você. `VIEWER` = seu gestor: leitura apenas, e **nunca enxerga registro `PRIVATE`**. `MANAGER` fica reservado para quando outro gestor entrar com seu próprio time.

### 5.2 Pessoas

| Entidade | Campos principais |
|---|---|
| `Seniority` | `id`, `organizationId`, `key`, `label`, `order` — seed: JUNIOR(1), PLENO(2), SENIOR(3) |
| `TeamMember` | `id`, `teamId`, `fullName`, `preferredName`, `email?`, `position`, `seniorityId`, `joinedAt`, `status` (`ACTIVE \| ON_LEAVE \| OFFBOARDING \| INACTIVE`), `avatarSeed`, `managerSummary`, `createdAt`, `updatedAt`, `deletedAt` |
| `MemberTrait` | `id`, `memberId`, `kind` (`STRENGTH \| DEVELOPMENT`), `text`, `observedAt`, `isActive` — unifica pontos fortes e de desenvolvimento em uma tabela só |
| `MemberChange` | `id`, `memberId`, `changeType` (`SENIORITY \| POSITION \| STATUS \| RESPONSIBILITY`), `fromValue`, `toValue`, `effectiveAt`, `reason`, `authorUserId` |
| `Responsibility` | `id`, `organizationId`, `name`, `description` |
| `MemberResponsibility` | `memberId`, `responsibilityId`, `isPrimary`, `assignedAt`, `endedAt` |
| `MentorshipLink` | `id`, `mentorMemberId`, `menteeMemberId`, `competencyId?`, `startedAt`, `endedAt`, `note` |

`MentorshipLink` é o que responde *"como meus Plenos estão ajudando os Juniors"* sem virar organograma: é um vínculo temporário e por competência, não uma hierarquia.

### 5.3 Registros

| Entidade | Campos principais |
|---|---|
| `Daily` | `id`, `teamId`, `date`, `summary`, `decisions`, `authorUserId`, `createdAt` |
| `DailyParticipant` | `dailyId`, `memberId`, `present`, `note`, `blocker` — absorve o `DailyNote` do seu rascunho, evitando duplicação |
| `Agreement` | `id`, `memberId`, `title`, `description`, `origin` (`DAILY \| ONE_ON_ONE \| FEEDBACK \| MEETING \| INCIDENT \| MANAGER \| OTHER`), `sourceDailyId?`, `sourceOneOnOneId?`, `sourceFeedbackId?`, `createdAt`, `dueDate`, `priority` (`LOW \| NORMAL \| HIGH`), `status` (`OPEN \| IN_PROGRESS \| DONE \| OVERDUE \| CANCELLED`), `completedAt`, `outcome`, `managerNote`, `authorUserId`, `deletedAt` |
| `AgreementParticipant` | `agreementId`, `memberId` |
| `OneOnOne` | `id`, `memberId`, `date`, `durationMinutes`, `topics`, `memberPerception`, `managerPerception`, `wins`, `difficulties`, `development`, `nextReviewAt`, `visibility`, `authorUserId` |
| `Feedback` | `id`, `memberId`, `date`, `category` (`RECOGNITION \| DEVELOPMENT \| BEHAVIOR \| TECHNICAL \| PERFORMANCE \| FORMAL`), `context`, `behavior`, `impact`, `guidance`, `followUpAt`, `visibility`, `authorUserId` |
| `Note` | `id`, `memberId`, `occurredAt`, `title`, `body`, `visibility`, `authorUserId` — anotação gerencial e ocorrência |

Nota sobre `Agreement.status`: `OVERDUE` **não é escrito no banco**. É derivado de `dueDate < hoje AND status IN (OPEN, IN_PROGRESS)`. Persistir "vencido" exigiria um cron e ficaria errado entre execuções. Manter no enum apenas se você quiser marcar manualmente; caso contrário, remover do enum e tratar só como derivado. Recomendo **remover do enum**.

### 5.4 Desenvolvimento

| Entidade | Campos principais |
|---|---|
| `Competency` | `id`, `organizationId`, `name`, `description`, `category`, `isActive` |
| `CompetencyExpectation` | `competencyId`, `seniorityId`, `expectedLevel`, `descriptor` — o esqueleto da matriz futura, sem preenchê-la agora |
| `MemberCompetency` | `memberId`, `competencyId`, `currentLevel` (1–5), `targetLevel`, `assessedAt`, `evidence` |
| `DevelopmentPlan` | `id`, `memberId`, `competencyId?`, `currentSituation`, `objective`, `expectedEvidence`, `status` (`DRAFT \| ACTIVE \| PAUSED \| DONE \| CANCELLED`), `startedAt`, `dueDate`, `completedAt`, `progressNote`, `lastReviewedAt` |
| `DevelopmentAction` | `id`, `planId`, `description`, `ownerType` (`MEMBER \| MANAGER \| MENTOR`), `ownerMemberId?`, `dueDate`, `status`, `completedAt`, `followUpNote` |

`CompetencyExpectation` é a única concessão de "preparar para o futuro" que vale a pena: são três colunas que evitam uma migration dolorosa depois.

### 5.5 Métricas e score — arquitetura apenas

| Entidade | Campos principais |
|---|---|
| `MetricDefinition` | `id`, `organizationId`, `key`, `label`, `unit`, `direction` (`HIGHER_IS_BETTER \| LOWER_IS_BETTER`), `sourceSystem`, `isActive` |
| `MetricResult` | `id`, `memberId`, `metricDefinitionId`, `periodStart`, `periodEnd`, `value`, `sampleSize`, `importedAt`, `sourceRef` |
| `ScoreDefinition` | `id`, `organizationId`, `name`, `version`, `isActive`, `notes`, `createdAt` |
| `ScoreComponent` | `scoreDefinitionId`, `metricDefinitionId`, `weight`, `normalizationMin`, `normalizationMax` |
| `ScoreResult` | `id`, `memberId`, `scoreDefinitionId`, `periodStart`, `periodEnd`, `value`, `computedAt` |
| `ScoreResultComponent` | `scoreResultId`, `metricDefinitionId`, `rawValue`, `normalizedValue`, `weight`, `contribution` |

`ScoreResultComponent` é o que garante que todo score seja **explicável**: você consegue abrir qualquer número e ver exatamente quais indicadores o formaram e com que peso. Sem essa tabela, o score vira caixa-preta — e caixa-preta aplicada a pessoas é indefensável numa conversa de avaliação.

`sampleSize` em `MetricResult` existe pelo motivo que você já conhece dos dashboards: CSAT alto com 6 avaliações não é CSAT alto. O campo obriga a exibir a cobertura junto do número.

**Separação obrigatória:** métricas operacionais nunca escrevem em `TimelineEvent`, nunca alteram `MemberTrait`, nunca aparecem na mesma superfície de um feedback. Métrica é insumo. Avaliação é ato humano.

### 5.6 Timeline

```
TimelineEvent
  id, memberId, occurredAt, type, title, summary,
  authorUserId, visibility, tags text[],
  agreementId?, oneOnOneId?, feedbackId?, dailyId?,
  noteId?, developmentPlanId?, memberChangeId?,
  createdAt
  @@index([memberId, occurredAt(sort: Desc)])
  @@index([type])
```

`type`: `DAILY \| FEEDBACK \| ONE_ON_ONE \| RECOGNITION \| INCIDENT \| AGREEMENT \| AGREEMENT_DONE \| ROLE_CHANGE \| SENIORITY_CHANGE \| DEVELOPMENT \| NOTE`

Regra: toda criação de registro escreve a linha de origem **e** a `TimelineEvent` na mesma `prisma.$transaction`. Edição atualiza ambas. Isso vive em `src/server/timeline.ts` e em nenhum outro lugar.

`tags` como `text[]` nativo do Postgres com índice GIN — evita duas tabelas para algo que é só um filtro.

### 5.7 Motor de alertas — derivado, não persistido

`src/server/alerts.ts` expõe `getAlerts(teamId, userId)`. Regras iniciais, com limiares em `Settings`:

| Alerta | Regra padrão |
|---|---|
| Combinado vencido | `dueDate < hoje` e status aberto/em andamento |
| Combinado vencendo | `dueDate` em até 3 dias |
| Sem 1:1 há muito tempo | Junior > 21 dias · Pleno > 30 · Senior > 30 |
| Silêncio gerencial | Nenhum registro de qualquer tipo há > 30 dias |
| PDI parado | `DevelopmentPlan` ativo sem `lastReviewedAt` há > 45 dias |
| Follow-up de feedback vencido | `Feedback.followUpAt < hoje` sem registro posterior |
| Daily não registrada | Nenhuma `Daily` nos últimos 2 dias úteis |
| Prontidão | Membro com todas as `MemberCompetency` no nível esperado da próxima senioridade — informativo, nunca automático |

Esse arquivo é o coração do produto. É ele que responde *"quem precisa da minha atenção hoje?"*.

---

## 6. Escopo do MVP

**Dentro:** os 7 módulos (Hoje, Equipe, Perfil, Dailies, Combinados, 1:1/Feedbacks, Desenvolvimento), autenticação com dois papéis, visibilidade privado/compartilhado, auditoria de escrita, busca global, command palette, esquema de score sem cálculo, seed com ~6 meses de histórico, deploy.

**Fora:** integração com helpdesk, cálculo de score, upload de foto, matriz de competências preenchida, notificações por e-mail, exportação PDF, modo escuro, múltiplos times, app nativo, offline.

---

## 7. Fases e dependência de banco

| Fase | Entrega | Precisa de banco? |
|---|---|---|
| 0 | `CLAUDE.md`, `README.md`, `DESIGN.md`, skill local de UI | Não |
| 1 | Scaffold, tokens, primitivos em `/ui-lab` | Não |
| 2 | App shell: sidebar, barra de contexto, responsividade | Não |
| 3 | Schema Prisma + migration | **Sim** |
| 4 | Seed realista | **Sim** |
| 5 | Auth, papéis, visibilidade, auditoria | **Sim** |
| 6–15 | Todos os módulos | **Sim** |

Recomendação: **provisione o Neon antes de começar a fase 3.** Leva cinco minutos e é gratuito. Construir fases 3–15 sobre fixtures em memória para depois trocar por Prisma significa escrever uma camada de abstração que você mesmo classificou como overengineering, e depois jogá-la fora. Só as fases 0–2 fazem sentido sem banco, e elas são justamente as que definem a identidade visual — que é onde vale gastar tempo antes de qualquer dado existir.

---

## 8. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| **Abandono por atrito de registro.** Se lançar uma daily custar mais de 30 segundos, o sistema morre em três semanas | Alta | Captura rápida via ⌘K, formulário de daily com uma linha por pessoa e navegação por Tab, salvamento parcial. Isso é requisito de aceite da fase 10, não polimento |
| **Autocensura por leitura do gestor** | Alta | `visibility` desde a migration 1. Padrão privado. Indicador visual explícito de o que está compartilhado |
| **Dados de pessoas em nuvem (LGPD)** | Média | Neon `sa-east-1`, allowlist de e-mail no auth, zero endpoint público, `AuditLog` de escrita, política de retenção documentada. Alinhe com o RH/jurídico antes de inserir dados reais |
| **Claude Code explodindo escopo** | Alta | `CLAUDE.md` com a seção de decisões travadas, fases pequenas, revisão de diff a cada fase, `git commit` por fase |
| **Deriva visual entre fases** | Média | Skill local + `/ui-lab` como referência obrigatória. Nenhum componente novo sem primitivo correspondente |
| **Modelo virar ferramenta de vigilância** | Média | Separação métrica/avaliação (D5, 5.5), sem ranking (D7), score explicável. Se você um dia mostrar esse sistema ao time, ele precisa sobreviver à leitura deles |

---

## 9. O que você precisa provisionar

| Item | Onde | Custo | Nota |
|---|---|---|---|
| Repositório privado | GitHub | Grátis | Privado, obrigatoriamente |
| Banco | Neon, região **AWS São Paulo (`sa-east-1`)** | Grátis para começar | Crie dois branches: `main` e `dev` |
| Hospedagem | Vercel | Grátis (Hobby) | Configure região de função `gru1` se o plano permitir |
| OAuth | Google Cloud Console → OAuth 2.0 Client | Grátis | Redirect: `https://SEU-APP.vercel.app/api/auth/callback/google` e `http://localhost:3000/api/auth/callback/google` |
| Alternativa ao Google | Resend (magic link) | Grátis até 3k/mês | Só se a empresa não usar Google Workspace |

### Variáveis de ambiente

```
DATABASE_URL=            # Neon, connection string com pooler
DIRECT_URL=              # Neon, conexão direta — usada por prisma migrate
AUTH_SECRET=             # openssl rand -base64 32
AUTH_URL=                # http://localhost:3000 em dev
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ALLOWED_EMAILS=          # seu@email.com,gestor@email.com — allowlist rígida
DEFAULT_ORG_SLUG=suporte
TZ=America/Sao_Paulo
```

### Comandos

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

---

## 10. Estrutura de diretórios

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
        └── validators/               # schemas zod
```

---

## 11. Dados de demonstração

Nove pessoas com nomes brasileiros plausíveis, sem repetir sobrenome comum em excesso. Sugestão:

| Nome | Senioridade | No time desde |
|---|---|---|
| Rafael Bittencourt | Senior | mar/2022 |
| Camila Nakagawa | Pleno | ago/2022 |
| Diego Sarmento | Pleno | jan/2023 |
| Priscila Vasconcelos | Pleno | mai/2023 |
| Henrique Toledo | Pleno | set/2023 |
| Larissa Fontoura | Junior | fev/2025 |
| Vinícius Amorim | Junior | abr/2025 |
| Beatriz Caldeira | Junior | jul/2025 |
| Otávio Rezende | Junior | out/2025 |

O seed precisa produzir uma sensação de sistema em uso há seis meses, com padrões narrativos reais e não distribuição uniforme: alguém em ascensão clara, alguém estagnado, alguém com combinado vencido há 40 dias, alguém sem 1:1 há 6 semanas, um Pleno mentorando dois Juniors, um Junior perto da promoção. É isso que permite avaliar o motor de alertas — dados uniformes não testam nada.
