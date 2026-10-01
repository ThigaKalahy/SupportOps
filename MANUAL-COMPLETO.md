# Manual completo de execução — Prontuário

Documento único. Substitui `EXECUCAO.md` e `AJUSTES-DAILY-E-VALIDACAO.md`.
Contém os 18 prompts já consolidados — cada um está completo, sem patches avulsos.

**Legenda:** **[VOCÊ]** = você faz · **[CC]** = cole no Claude Code

---

# PARTE A — O que já está feito

- [x] P0 — fundação documental (`CLAUDE.md`, `README.md`, `DESIGN.md`, skill de UI)
- [x] Correção do P0
- [x] Neon criado e conectado
- [x] `.env.local` preenchido

---

# PARTE B — Configuração antes de rodar qualquer fase

## B1 — [VOCÊ] Instalar o `jq`

Os hooks dependem dele. Sem `jq` eles falham em silêncio.

```bash
brew install jq            # macOS
sudo apt-get install jq    # Linux
winget install jqlang.jq   # Windows
```

Confirme: `jq --version`

## B2 — [VOCÊ] Conferir o `.env.local`

A autenticação é e-mail + senha, não Google. O arquivo deve ter exatamente:

```
DATABASE_URL="<pooled do Neon>"
DIRECT_URL="<direct do Neon>"
AUTH_SECRET="<openssl rand -base64 32>"
AUTH_URL="http://localhost:3000"
ALLOWED_EMAILS="thigapai@gmail.com,<email-do-seu-gestor>"
DEFAULT_ORG_SLUG="suporte"
TZ="America/Sao_Paulo"
```

Se ainda tiver `AUTH_GOOGLE_ID` ou `AUTH_GOOGLE_SECRET`, apague as linhas.

## B3 — [CC] Atualizar o `CLAUDE.md`

```
Atualize o CLAUDE.md. Apenas este arquivo, nada de código.

1. Na tabela de Stack, substitua a linha de Auth por:
   | Auth | Auth.js v5 (NextAuth) — provider Credentials | E-mail + senha, sessão JWT.
   Sem OAuth, sem cadastro público, sem recuperação de senha. Usuários criados por
   script de CLI |

2. Na seção "Arquitetura e fluxo de dados", acrescente:
   "Auth.js exige configuração dividida por causa do Edge runtime:
   `src/server/auth.config.ts` é leve (sem Prisma, sem bcrypt) e é o que o middleware
   importa; `src/server/auth.ts` é completo, roda em Node, e contém o provider
   Credentials. Importar Prisma no middleware quebra o build na Vercel."

3. Na seção "Regras de segurança e privacidade", acrescente:
   - Autenticação é e-mail + senha com hash bcryptjs cost 12. Senha nunca em texto.
   - Não existe cadastro público, convite ou recuperação de senha. Usuários são
     criados exclusivamente por `pnpm user:create` e `pnpm user:password`.
   - Erro de login genérico e idêntico para e-mail inexistente e senha errada:
     "E-mail ou senha inválidos".
   - bcrypt.compare roda SEMPRE, inclusive com e-mail inexistente (contra hash
     descartável), para não vazar quais contas existem por tempo de resposta.
   - 5 tentativas falhas bloqueiam a conta por 15 minutos.
   - Toda tentativa de login, sucesso ou falha, gera entrada no AuditLog.
   - O domínio de produção na Vercel é público no plano Hobby. A tela de login é a
     única barreira. Deployment Protection cobre apenas os previews.
   - A rota `/ui-lab` é bloqueada em produção via NODE_ENV.

4. Na tabela "Decisões que não devem ser alteradas silenciosamente", acrescente:

| D11 | `AgreementCheckin` registra cada revisão de combinado numa daily | Um combinado arrastado 4x é problema diferente de um arrastado 1x. Sem a tabela, o arrasto é invisível |
| D12 | Reagendar estende o `dueDate` e grava um checkin — não cria registro novo nem muda status | Mantém o enum de status em 4 valores e preserva o histórico de arrasto |
| D13 | `PriorityLevel` (chamado) é separado do enum `Agreement.priority` (combinado) | Domínios diferentes. Unificar faz a escala do helpdesk mexer na priorização dos compromissos do gestor |
| D14 | `PriorityValidation.outcome` é persistido junto com os ranks do momento | Fato histórico de uma decisão, não estado derivado do tempo. Reordenar a escala não pode reescrever o passado. Não conflita com D9 |
| D15 | Validação de prioridade não escreve em `TimelineEvent` | Inundaria o prontuário com registro operacional. O perfil mostra o agregado; virar feedback é ato explícito do gestor |
| D16 | Emoji permitido exclusivamente no texto exportado para WhatsApp | A proibição vale para a interface. O export é outro meio |
| D17 | `Agreement.originalDueDate` é gravado na criação e NUNCA alterado | Reagendamento muda `dueDate`. Sem o prazo original não existe medição honesta de cumprimento — todo combinado arrastado pareceria cumprido no prazo |
| D18 | `BlockerReason.category` (EXTERNAL / INTERNAL / CAPACITY) existe para separar cumprimento bruto de ajustado | "Aguardando acesso do cliente" e "esqueci" não podem pesar igual contra a pessoa |
| D19 | Taxa de cumprimento nunca aparece sem o total de combinados ao lado, e nunca vira um número único por pessoa | Quem teve 3 combinados fáceis fecha 100%. Taxa sem denominador é propaganda, não medição |

5. Na seção "Regras de modelagem", acrescente:
   - A daily do dia D puxa os combinados criados na daily anterior mais os em aberto
     com `dueDate <= hoje`. Revisar grava `AgreementCheckin`.
   - Reagendar estende `dueDate` do mesmo `Agreement` e grava checkin com
     `newDueDate`. `originalDueDate` permanece intocado. Substituir: antigo vai para
     CANCELLED, novo nasce com `replacesAgreementId`.
   - `PriorityValidation.outcome` é calculado na escrita e nunca recalculado.
     `RETURNED` é ação explícita, não derivável de ranks.
   - `reasonId` obrigatório quando `outcome != MAINTAINED`, validado no zod e no banco.
   - Métricas de cumprimento são calculadas em query sobre `originalDueDate`,
     `completedAt` e `AgreementCheckin`. Nenhuma taxa é persistida.

6. Na seção "Padrões de frontend", acrescente:
   "Exceção única à proibição de emoji: o gerador de texto para WhatsApp em
   src/server/whatsapp.ts. Nenhum componente de UI usa emoji."

7. Substitua o "Backlog de curto prazo" pela lista P1 a P18 do PROGRESS.md.

Ao terminar, mostre o diff e pare.
```

Depois: `git add -A && git commit -m "docs: decisoes D11-D19 e auth por credenciais"`

## B4 — [CC] Montar o kit de automação

````
Crie os arquivos abaixo, exatamente como colados. Não improvise, não "melhore" os
scripts. Não crie package.json nem nada de aplicação.

Depois rode:
  chmod +x .claude/hooks/guardrails.sh .claude/hooks/phase-gate.sh scripts/run-phases.sh

Ao terminar, mostre a árvore de arquivos criados e pare.

═══ PROGRESS.md ═══

# Progresso

| Fase | Status | Commit | Data |
|------|--------|--------|------|
| P0  Fundação documental        | concluída | | |
| P1  Design system              | pendente | | |
| P2  App shell                  | pendente | | |
| P3  Schema Prisma              | pendente | | |
| P4  Seed                       | pendente | | |
| P5  Auth e visibilidade        | pendente | | |
| P6  Equipe e cadastro          | pendente | | |
| P7  Perfil do analista         | pendente | | |
| P8  Timeline                   | pendente | | |
| P9  Combinados                 | pendente | | |
| P10 Dailies com rollover       | pendente | | |
| P11 Validação de prioridade    | pendente | | |
| P12 Cumprimento de combinados  | pendente | | |
| P13 1:1 e feedbacks            | pendente | | |
| P14 Desenvolvimento e PDI      | pendente | | |
| P15 Hoje e motor de alertas    | pendente | | |
| P16 Busca global               | pendente | | |
| P17 Arquitetura de score       | pendente | | |
| P18 Mobile, a11y e deploy      | pendente | | |

## Notas de handoff

(o Claude Code escreve aqui ao final de cada fase)

═══ BLOCKERS.md ═══

# Bloqueios aguardando o Thiago

Nada pendente.

<!--
FORMATO — o Claude Code adiciona blocos assim e PARA:

## [ ] Título curto
Fase: P3
Preciso de: <o que exatamente>
Onde consigo: <passo a passo>
Enquanto isso: <o que fica bloqueado>
-->

═══ .claude/settings.json ═══

{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit|Write|Bash",
        "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guardrails.sh" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/phase-gate.sh" }] }
    ],
    "SessionStart": [
      { "matcher": "compact",
        "hooks": [{ "type": "command", "command": "echo 'Releia CLAUDE.md, especialmente as decisoes travadas D1-D19. Veja PROGRESS.md para a fase atual. Nunca use sombra, gradiente, emoji ou serifa na UI.'" }] }
    ]
  }
}

═══ .claude/hooks/guardrails.sh ═══

#!/usr/bin/env bash
set -uo pipefail
INPUT=$(cat)

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
FILE="${FILE//\\//}"
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

PROTEGIDOS=(".env" "MANUAL-COMPLETO.md" "PLANO-TECNICO.md" "pnpm-lock.yaml" ".git/")
for p in "${PROTEGIDOS[@]}"; do
  if [[ "$FILE" == *"$p"* ]]; then
    echo "Bloqueado: '$p' e protegido. Registre em BLOCKERS.md e pare." >&2
    exit 2
  fi
done

DESTRUTIVOS=("migrate reset" "db push --force-reset" "git push --force" "git push -f" "git reset --hard" "rm -rf /" "DROP TABLE" "DROP DATABASE" "TRUNCATE")
for d in "${DESTRUTIVOS[@]}"; do
  if [[ "$CMD" == *"$d"* ]]; then
    echo "Bloqueado: '$d' exige autorizacao humana. Registre em BLOCKERS.md e pare." >&2
    exit 2
  fi
done

PROIBIDAS=("redux" "@reduxjs" "@trpc" "zustand" "framer-motion" "gsap" "styled-components" "@emotion" "algoliasearch" "meilisearch" "chakra" "@mui/" "antd" "next-auth@4" "recharts" "chart.js")
if [[ "$CMD" == *"install"* || "$CMD" == *" add "* ]]; then
  for lib in "${PROIBIDAS[@]}"; do
    if [[ "$CMD" == *"$lib"* ]]; then
      echo "Bloqueado: '$lib' esta fora da stack do CLAUDE.md. Registre em BLOCKERS.md com justificativa e pare." >&2
      exit 2
    fi
  done
fi

exit 0

═══ .claude/hooks/phase-gate.sh ═══

#!/usr/bin/env bash
set -uo pipefail
INPUT=$(cat)

[ -f "$CLAUDE_PROJECT_DIR/.claude/.autorun" ] || exit 0
[ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0
grep -q '^## \[ \]' BLOCKERS.md 2>/dev/null && exit 0
[ -f package.json ] || exit 0

tem_script() { jq -e --arg s "$1" '.scripts[$s] // empty' package.json >/dev/null 2>&1; }

FALHAS=""
for etapa in typecheck lint build; do
  tem_script "$etapa" || continue
  if ! pnpm "$etapa" > "/tmp/gate-$etapa.log" 2>&1; then
    FALHAS="${FALHAS}
- pnpm $etapa reprovou:
$(tail -40 "/tmp/gate-$etapa.log")"
  fi
done

if [ -n "$FALHAS" ]; then
  printf "Portao reprovado. Corrija antes de encerrar o turno:%s\n" "$FALHAS" >&2
  exit 2
fi
exit 0

═══ .claude/commands/next-phase.md ═══

---
description: Executa a proxima fase pendente do plano
---

## Preparacao

1. Leia CLAUDE.md por completo, com atencao as decisoes travadas D1-D19.
2. Leia PROGRESS.md e identifique a primeira fase "pendente".
3. Leia BLOCKERS.md. Se houver item `## [ ]`, PARE e informe o Thiago.
4. Peca ao Thiago o prompt completo da fase, que esta no MANUAL-COMPLETO.md dele.
5. `git checkout -b fase/<N>-<slug-curto>`
6. Crie o arquivo vazio `.claude/.autorun`

## Execucao

- Nunca invente credencial, chave ou URL de servico.
- Nunca use placeholder para seguir adiante.
- Nunca altere decisao travada do CLAUDE.md.
- Nunca instale biblioteca fora da stack.
- Nunca avance para a fase seguinte. Uma fase por invocacao.
- Consulte /ui-lab antes de criar componente. Se ja existe primitivo, use.

## Protocolo de bloqueio

Ao encontrar algo que exige o Thiago (credencial, conta externa, decisao de produto
ambigua, aprovacao visual, conflito com decisao travada):

1. Acrescente em BLOCKERS.md:
   ## [ ] <titulo>
   Fase: P<N>
   Preciso de: <o que exatamente>
   Onde consigo: <passo a passo>
   Enquanto isso: <o que fica bloqueado>
2. Comite o que ja funciona.
3. Remova .claude/.autorun
4. Pare. Sem rota alternativa, sem simulacao, sem TODO no codigo.

## Encerramento

1. `pnpm typecheck && pnpm lint && pnpm build` — todos passando.
2. `git commit -m "fase(P<N>): <resumo>"`
3. Atualize PROGRESS.md: status, hash, data.
4. Escreva em PROGRESS.md tres linhas: o que ficou de fora; o que precisa de revisao
   humana; o que a proxima fase assume que ja existe.
5. Atualize "Funcionalidades existentes" no CLAUDE.md.
6. Remova .claude/.autorun
7. Informe em uma frase o que foi feito e PARE.

═══ scripts/run-phases.sh ═══

#!/usr/bin/env bash
set -uo pipefail
echo "Este script executa fases em sequencia sem supervisao."
echo "Use apenas com os prompts ja colados em .claude/commands/fase-N.md"
echo "Para o fluxo normal, use: claude -> /next-phase"

═══ acrescente ao .gitignore ═══

.env*.local
.claude/.autorun
.claude/settings.local.json
node_modules
.next
````

## B5 — [VOCÊ] Notificação

Crie `.claude/settings.local.json` à mão (não vai para o git):

**macOS**
```json
{ "hooks": { "Notification": [ { "matcher": "permission_prompt",
  "hooks": [{ "type": "command",
    "command": "osascript -e 'display notification \"Precisa de voce\" with title \"Prontuario\" sound name \"Submarine\"'" }] } ] } }
```
Rode uma vez `osascript -e 'display notification "teste"'` e libere o **Script Editor** em Ajustes do Sistema → Notificações.

**Windows**
```json
{ "hooks": { "Notification": [ { "matcher": "permission_prompt",
  "hooks": [{ "type": "command",
    "command": "powershell.exe -Command \"[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('Precisa de voce','Prontuario')\"" }] } ] } }
```

## B6 — [VOCÊ] Testar os hooks

| Digite no Claude Code | Esperado |
|---|---|
| `/hooks` | Lista `PreToolUse`, `Stop`, `SessionStart`, `Notification` |
| `Adicione um comentário no .env.local` | **Bloqueado** |
| `Instale a biblioteca zustand` | **Bloqueado** |

Se os dois últimos passarem, rode `chmod +x .claude/hooks/guardrails.sh` e repita.

```bash
git add -A && git commit -m "chore: kit de automacao"
```

**Configuração concluída.** A partir daqui é só rodar os prompts da Parte C.

---

# PARTE C — Como rodar cada fase

Para cada fase: abra `claude`, cole o prompt da fase, e deixe rodar.

| Modo | Como | Fases |
|---|---|---|
| **Assistido** (você olha) | `claude`, cola o prompt | P1, P3, P7, P8, P15 |
| **Semi-autônomo** (sai de perto) | `claude`, `Shift+Tab` até aceitação automática de edições, cola o prompt | Todas as outras |

**Ciclo, sempre igual:**
1. Cola o prompt da fase
2. Claude Code cria o branch, executa, roda o portão, comita, escreve o handoff
3. Você lê as 3 linhas de handoff no `PROGRESS.md`
4. Você revisa o diff e faz a checagem humana da fase (Parte D)
5. `git checkout main && git merge fase/N-slug`

**Se der errado:** `git checkout main && git branch -D fase/N-slug` e reescreva o prompt. Correção por cima acumula lixo.

---

# PARTE D — Os 18 prompts

## P1 — Design system

```
Leia CLAUDE.md, DESIGN.md e .claude/skills/ui-prontuario/SKILL.md antes de começar.

Crie o scaffold e o sistema de design. Nada de páginas de produto ainda.

1. Next.js 15 App Router, TypeScript strict com noUncheckedIndexedAccess,
   Tailwind CSS v4, pnpm, ESLint. Remova a page.tsx de boas-vindas do Next.

2. globals.css: todos os tokens do DESIGN.md via @theme do Tailwind v4. Reset mínimo.
   font-variant-numeric: tabular-nums global. Body com background --canvas.

3. Fontes IBM Plex Sans e IBM Plex Mono via next/font/google, subset latin-ext,
   expostas como variáveis CSS.

4. Instale shadcn/ui e adicione apenas: button, input, textarea, select, dialog,
   dropdown-menu, popover, tabs, badge, separator, tooltip, command, sheet, calendar,
   avatar, checkbox, label, scroll-area, table.
   Depois REESCREVA os tokens de cada um para as variáveis do DESIGN.md. O visual
   padrão do shadcn não pode sobreviver: sem sombra em card, raio 4px em controles,
   foco com outline 2px em --accent, altura de botão 32px (sm) e 36px (default).

5. Primitivos próprios em src/components/ui/:
   - DataTable — cabeçalho sticky, linhas de 40px, hover em --surface-sunken, linha
     selecionada com --accent-wash e barra inset de 2px em --accent, células com
     truncate e title, estado vazio com texto de direção
   - StatusPill — recebe severidade (calm | attention | overdue | neutral) e rótulo.
     Fundo wash, texto na cor forte, 11px, raio 4px. Não é pill redondo
   - SeverityDot — ponto de 6px para severidade em linha de tabela
   - MetaLabel — rótulo mono, 11px, uppercase, tracking 0.06em, --ink-secondary
   - DateStamp — data em IBM Plex Mono, formato pt-BR, title com data completa
   - PageHeader — título, subtítulo opcional, slot de ações à direita, borda inferior
   - EmptyState — título, uma linha de direção, uma ação. Nunca ilustração, nunca emoji
   - FieldGroup — rótulo + campo + ajuda, espaçamento consistente
   - StatStrip — faixa horizontal de números em mono com rótulo pequeno embaixo.
     Substitui grade de cards de KPI em todo o produto
   - Sparkline — série temporal mínima em SVG inline, 1px, sem eixo, sem legenda,
     altura 24px. Sem biblioteca de gráfico

6. Rota /ui-lab exibindo todos os primitivos em todos os estados (default, hover,
   foco, selecionado, desabilitado, carregando, vazio, erro). É a referência visual
   obrigatória das fases seguintes. Bloqueie em produção via NODE_ENV.

7. src/lib/labels.ts com a estrutura de tradução en → pt-BR (só o formato).
   src/lib/severity.ts com a escala graduada de prazo e idade.
   src/lib/dates.ts com helpers de date-fns em pt-BR, TZ America/Sao_Paulo.

Critério de aceite: /ui-lab renderiza, pnpm build passa, e nenhum componente usa
sombra, gradiente, emoji, ícone acima de 20px ou raio acima de 6px.
```

---

## P2 — App shell

```
Leia CLAUDE.md e DESIGN.md. Consulte /ui-lab antes de criar qualquer componente.

Construa o shell em src/app/(app)/layout.tsx. Ainda sem dados reais — constantes locais.

1. Sidebar fixa de 232px em telas >= 1024px:
   - Identidade do produto no topo, discreta, sem logo grande
   - Sete itens: Hoje, Equipe, Combinados, Validação de prioridade, Dailies,
     Registros, Desenvolvimento
   - Configurações no rodapé, após divisor
   - Item ativo: fundo --accent-wash, texto --ink, barra inset 2px --accent à esquerda
   - Ícones Lucide 16px, stroke 1.5
   - Colapsável para 56px, estado em cookie para persistir entre navegações
   - Sem contadores ainda (virão no P15)

2. Barra de contexto de 48px no topo do conteúdo: breadcrumb à esquerda, campo de
   busca no centro (inerte, mostrando ⌘K em <kbd>), slot de ação primária à direita.
   NÃO é navbar grande.

3. Responsividade: abaixo de 1024px a sidebar vira Sheet acionada por botão na barra
   de contexto. Abaixo de 768px o breadcrumb encurta para a página atual.

4. Conteúdo fluido até 1600px, padding horizontal 24px (16px no mobile).

5. Páginas placeholder para as oito rotas, cada uma com PageHeader e EmptyState com
   texto de direção específico e verdadeiro. Nada de "Em construção".

Critério de aceite: navegação por teclado ponta a ponta com foco visível, layout
íntegro entre 360px e 1920px, zero sombra na tela.
```

---

## P3 — Schema Prisma completo

```
Leia CLAUDE.md e a seção 5 do PLANO-TECNICO.md por completo.

Implemente prisma/schema.prisma com TODAS as entidades abaixo e gere a primeira
migration. Datas de negócio como @db.Date, timestamps como @db.Timestamptz.

═══ TENANCY E ACESSO ═══

Organization — id, name, slug, timestamps
User — id, email (unique), name, image?, role (OWNER|MANAGER|VIEWER), organizationId,
  passwordHash?, passwordUpdatedAt?, lastLoginAt?, failedLoginAttempts Int @default(0),
  lockedUntil?, timestamps
Team — id, organizationId, name, managerUserId
AuditLog — id, organizationId, userId, action, entity, entityId, before Json?,
  after Json?, at

NÃO crie Account, Session nem VerificationToken. Com Credentials + sessão JWT elas
não são usadas. Adicionar OAuth no futuro é migration nova — nada especulativo agora.
NÃO crie tabela ou campo de cadastro público, convite ou recuperação de senha.

═══ PESSOAS ═══

Seniority — id, organizationId, key, label, order Int. TABELA, não enum (D3).
  Seed: JUNIOR(1), PLENO(2), SENIOR(3)
TeamMember — id, teamId, fullName, preferredName, email?, position, seniorityId,
  joinedAt, status (ACTIVE|ON_LEAVE|OFFBOARDING|INACTIVE), avatarSeed,
  managerSummary?, timestamps, deletedAt?
MemberTrait — id, memberId, kind (STRENGTH|DEVELOPMENT), text, observedAt,
  isActive. UMA tabela com kind, não duas.
MemberChange — id, memberId, changeType (SENIORITY|POSITION|STATUS|RESPONSIBILITY),
  fromValue, toValue, effectiveAt, reason, authorUserId
Responsibility — id, organizationId, name, description?
MemberResponsibility — memberId, responsibilityId, isPrimary, assignedAt, endedAt?
MentorshipLink — id, mentorMemberId, menteeMemberId, competencyId?, startedAt,
  endedAt?, note?

═══ REGISTROS ═══

Daily — id, teamId, date, summary?, decisions?, authorUserId, createdAt
DailyParticipant — dailyId, memberId, present, note?, blocker?
  Absorve o DailyNote. NÃO crie tabela separada.

Agreement — id, memberId, title, description?,
  origin (DAILY|ONE_ON_ONE|FEEDBACK|MEETING|INCIDENT|MANAGER|OTHER),
  sourceDailyId?, sourceOneOnOneId?, sourceFeedbackId?,
  createdAt, originalDueDate, dueDate, priority (LOW|NORMAL|HIGH),
  status (OPEN|IN_PROGRESS|DONE|CANCELLED),
  completedAt?, outcome?, managerNote?, replacesAgreementId?,
  authorUserId, updatedAt, deletedAt?
  @@index([memberId, originalDueDate])
  @@index([status, dueDate])

  CRÍTICO — o enum de status tem EXATAMENTE quatro valores. NÃO inclua OVERDUE.
  Vencido é derivado de dueDate < hoje AND status IN (OPEN, IN_PROGRESS) (D9).

  CRÍTICO — originalDueDate é gravado na criação e NUNCA alterado, nem por
  reagendamento (D17). dueDate é o prazo corrente e muda a cada reagendamento.
  Sem essa separação, todo combinado arrastado pareceria cumprido no prazo e a
  métrica de cumprimento do P12 seria mentirosa.

  replacesAgreementId é relação autorreferente nomeada: quando o gestor substitui em
  vez de reagendar, o novo aponta para o antigo, que vai para CANCELLED.

AgreementParticipant — agreementId, memberId

BlockerReason — id, organizationId, label, category, isActive, order
  category enum BlockerCategory: EXTERNAL | INTERNAL | CAPACITY (D18)
  Seed, com categoria:
    Dependência de terceiro — EXTERNAL
    Aguardando cliente — EXTERNAL
    Falta de acesso ou permissão — EXTERNAL
    Volume operacional — CAPACITY
    Ausência (férias/licença) — CAPACITY
    Prioridade alterada — CAPACITY
    Falta de informação — INTERNAL
    Escopo mal definido — INTERNAL
    Outro — INTERNAL

AgreementCheckin — id, agreementId, dailyId, outcome, blockerText?, blockerReasonId?,
  newDueDate?, authorUserId, createdAt
  outcome enum CheckinOutcome: DONE | PARTIAL | NOT_DONE
  @@index([agreementId, createdAt])
  @@index([dailyId])
  blockerText OBRIGATÓRIO quando outcome é PARTIAL ou NOT_DONE.

OneOnOne — id, memberId, date, durationMinutes?, topics?, memberPerception?,
  managerPerception?, wins?, difficulties?, development?, nextReviewAt?,
  visibility, authorUserId, timestamps, deletedAt?
Feedback — id, memberId, date,
  category (RECOGNITION|DEVELOPMENT|BEHAVIOR|TECHNICAL|PERFORMANCE|FORMAL),
  context?, behavior, impact?, guidance?, followUpAt?, visibility, authorUserId,
  timestamps, deletedAt?
Note — id, memberId, occurredAt, title, body, visibility, authorUserId,
  timestamps, deletedAt?

visibility enum Visibility: PRIVATE | SHARED — em OneOnOne, Feedback, Note e
TimelineEvent (D4). Padrão PRIVATE.

═══ VALIDAÇÃO DE PRIORIDADE ═══

PriorityLevel — id, organizationId, key, label, rank Int, color?, isActive
  @@unique([organizationId, key])
  Escala de prioridade de CHAMADO. NÃO reutilize o enum Agreement.priority — são
  domínios diferentes (D13). Seed: CRITICA(4), ALTA(3), MEDIA(2), BAIXA(1).
  rank maior = mais prioritário.

ReclassificationReason — id, organizationId, label, isActive, order
  Seed exatamente estes nove, nesta ordem: Impacto superestimado; Impacto
  subestimado; Ausência de contingência não considerada; Cliente único tratado como
  impacto geral; Urgência comercial confundida com criticidade técnica; Evidência
  insuficiente; Critério de prioridade aplicado incorretamente; Outro.

TicketUrlPattern — id, organizationId, label, regex, captureGroup Int @default(1),
  isActive, order
  Seed com um padrão genérico de fallback que captura a maior sequência de dígitos
  da URL.

PriorityValidation — id, organizationId, ticketUrl, ticketRef, memberId,
  analystPriorityId, supervisorPriorityId?,
  analystRankSnapshot Int, supervisorRankSnapshot Int?,
  outcome, reasonId?, reasonOther?, note?,
  validatedAt, validatedByUserId, timestamps, deletedAt?
  outcome enum ValidationOutcome: MAINTAINED | RAISED | LOWERED | RETURNED
  @@index([organizationId, validatedAt])
  @@index([memberId, validatedAt])
  @@index([reasonId])
  @@index([outcome, validatedAt])
  @@index([ticketRef])

  outcome é PERSISTIDO, não derivado (D14), junto com os dois rank snapshots.
  Isso NÃO contraria D9: OVERDUE é derivado porque depende do tempo e muda sozinho;
  outcome é fato histórico de uma decisão e não pode ser reescrito quando alguém
  reordenar a escala em /settings.
  RETURNED é ação explícita do supervisor, não derivável de ranks; nesse caso
  supervisorPriorityId e supervisorRankSnapshot podem ser nulos.
  reasonId OBRIGATÓRIO quando outcome != MAINTAINED — valide no zod E com CHECK
  constraint no banco via migration manual.

═══ DESENVOLVIMENTO ═══

Competency — id, organizationId, name, description?, category?, isActive
CompetencyExpectation — competencyId, seniorityId, expectedLevel Int, descriptor?
MemberCompetency — memberId, competencyId, currentLevel Int, targetLevel Int?,
  assessedAt, evidence?
DevelopmentPlan — id, memberId, competencyId?, currentSituation, objective,
  expectedEvidence?, status (DRAFT|ACTIVE|PAUSED|DONE|CANCELLED), startedAt,
  dueDate?, completedAt?, progressNote?, lastReviewedAt?, timestamps, deletedAt?
DevelopmentAction — id, planId, description, ownerType (MEMBER|MANAGER|MENTOR),
  ownerMemberId?, dueDate?, status, completedAt?, followUpNote?

═══ MÉTRICAS E SCORE (arquitetura apenas) ═══

MetricDefinition — id, organizationId, key, label, unit?,
  direction (HIGHER_IS_BETTER|LOWER_IS_BETTER), sourceSystem?, isActive
MetricResult — id, memberId, metricDefinitionId, periodStart, periodEnd, value,
  sampleSize Int, importedAt, sourceRef?
ScoreDefinition — id, organizationId, name, version Int, isActive, notes?, createdAt
ScoreComponent — scoreDefinitionId, metricDefinitionId, weight, normalizationMin,
  normalizationMax
ScoreResult — id, memberId, scoreDefinitionId, periodStart, periodEnd, value,
  computedAt
ScoreResultComponent — scoreResultId, metricDefinitionId, rawValue, normalizedValue,
  weight, contribution

ScoreResultComponent existe para tornar todo score explicável. NÃO a remova por
parecer redundante — é o que impede o score de virar caixa-preta.
MetricResult.sampleSize é obrigatório. É o que impede "CSAT 4,8 com 6 avaliações".

═══ TIMELINE ═══

TimelineEvent — id, memberId, occurredAt, type, title, summary?, authorUserId,
  visibility, tags String[], agreementId?, oneOnOneId?, feedbackId?, dailyId?,
  noteId?, developmentPlanId?, memberChangeId?, createdAt
  type enum: DAILY|FEEDBACK|ONE_ON_ONE|RECOGNITION|INCIDENT|AGREEMENT|
    AGREEMENT_DONE|ROLE_CHANGE|SENIORITY_CHANGE|DEVELOPMENT|NOTE
  @@index([memberId, occurredAt(sort: Desc)])
  @@index([type])
  tags é String[] nativo do Postgres com índice GIN criado em migration manual.
  Não crie tabela de tags.

  TimelineEvent.visibility SEMPRE espelha a visibilidade do registro de origem.
  Alterar a visibilidade de um Feedback, OneOnOne ou Note atualiza a TimelineEvent
  correspondente na mesma transação. Linha-espelho SHARED apontando para registro
  PRIVATE é vazamento e bug crítico.

  NÃO escreva TimelineEvent para PriorityValidation (D15).

═══ INFRAESTRUTURA ═══

- src/server/db.ts com singleton do PrismaClient
- Extensão do Prisma Client filtrando deletedAt automaticamente nas leituras
- Scripts db:push, db:migrate, db:seed, db:studio, typecheck, lint no package.json

Não crie seed, nenhuma query e nenhum componente nesta fase.

Critério de aceite: prisma migrate dev roda limpo contra o Neon, prisma generate
passa, e o schema tem comentários /// nas entidades cuja intenção não é óbvia.
```

---

## P4 — Seed realista

```
Leia CLAUDE.md. Escreva prisma/seed.ts gerando ~6 meses de histórico. O protótipo
precisa parecer um sistema em uso, não um banco de exemplo. Use seed fixa de
aleatoriedade para ser reprodutível.

ESTRUTURA BASE
- 1 Organization (slug: suporte), 1 Team, 2 Users (OWNER e VIEWER), 3 Seniorities
- BlockerReason, PriorityLevel, ReclassificationReason e TicketUrlPattern conforme
  o seed definido no schema
- ~10 Competencies reais de suporte técnico (diagnóstico de hardware, comunicação
  escrita com cliente, escalonamento, documentação, autonomia em chamado complexo,
  análise de log, atendimento a cliente crítico, etc.)
- ~12 Responsibilities reais

PESSOAS — exatamente estas nove, sem inventar outras:
| Rafael Bittencourt   | Senior | mar/2022 |
| Camila Nakagawa      | Pleno  | ago/2022 |
| Diego Sarmento       | Pleno  | jan/2023 |
| Priscila Vasconcelos | Pleno  | mai/2023 |
| Henrique Toledo      | Pleno  | set/2023 |
| Larissa Fontoura     | Junior | fev/2025 |
| Vinícius Amorim      | Junior | abr/2025 |
| Beatriz Caldeira     | Junior | jul/2025 |
| Otávio Rezende       | Junior | out/2025 |

REGISTROS
- ~40 Dailies em dias úteis, com participantes, notas individuais em parte deles
- ~90 Agreements. originalDueDate SEMPRE preenchido na criação. Quando houve
  reagendamento, dueDate difere de originalDueDate
- ~70 AgreementCheckins distribuídos pelas dailies, a maioria DONE
- ~35 OneOnOnes, distribuídos de forma DESIGUAL entre as pessoas
- ~50 Feedbacks nas seis categorias
- ~14 DevelopmentPlans com ações
- ~8 MentorshipLinks: Plenos mentorando Juniors, Senior apoiando Plenos
- 2 MemberChanges: duas promoções no período
- MemberTraits para todos
- ~180 PriorityValidations nos últimos 90 dias
- TimelineEvent para cada registro acima, escrita pela mesma função de
  src/server/timeline.ts que a aplicação usa
- MetricDefinitions cadastradas mas SEM nenhum MetricResult, e nenhum
  ScoreDefinition ativo

PADRÕES NARRATIVOS OBRIGATÓRIOS — o seed precisa exercitar os motores de alerta e
de cumprimento. Distribuição uniforme não testa nada.
- Larissa: ascensão clara, feedbacks positivos crescentes, PDI quase concluído,
  cumprimento subindo de ~60% para ~90% ao longo dos 6 meses
- Henrique: estagnado — sem feedback há 3 meses, PDI parado, 1:1 espaçados,
  cumprimento caindo de ~90% para ~65%
- Diego: um combinado arrastado 4 vezes, sempre com impeditivo "Dependência de
  terceiro" (categoria EXTERNAL) — é o caso que separa cumprimento bruto de ajustado
- Priscila: dois combinados vencidos há mais de 40 dias
- Beatriz: sem 1:1 há 6 semanas
- Otávio: taxa de alteração de prioridade visivelmente maior que a dos outros, com
  "Impacto superestimado" dominante
- Rafael: quase nenhuma alteração de prioridade, cumprimento estável e alto
- Dois Agreements substituídos via replacesAgreementId, com escopo mudado
- Um período de duas semanas com menos registros (o gestor esteve fora)

Conteúdo em pt-BR, específico e plausível. Nada de "Feedback sobre performance" nem
"Bloqueado por questões técnicas" — escreva como um gestor escreveria, curto e
concreto.

Critério de aceite: pnpm db:seed roda duas vezes seguidas sem duplicar dados, e
prisma studio mostra distribuição desigual entre pessoas.
```

---

## P5 — Auth, papéis, visibilidade e auditoria

```
Leia CLAUDE.md, seção de regras de segurança.

Implemente Auth.js v5 com provider Credentials (e-mail + senha). NÃO use OAuth. Não
existe cadastro público, convite ou recuperação de senha por e-mail.

ATENÇÃO — armadilha de runtime, resolva primeiro:
Credentials exige sessão JWT, e o middleware do Next roda em Edge, onde Prisma e
bcrypt não funcionam. Use configuração dividida:
- src/server/auth.config.ts — leve, sem adapter, sem Prisma, sem hash. Só callbacks
  de authorized/jwt/session. É o que o middleware importa.
- src/server/auth.ts — completo, runtime Node. Importa o auth.config, adiciona o
  provider Credentials com verificação de senha, exporta handlers, auth, signIn,
  signOut.
Importar Prisma no middleware quebra o build na Vercel.

1. Hash com bcryptjs, cost 12. Pura JS, sem binário nativo. Senha nunca em texto.

2. Verificação de credencial:
   - Rejeite e-mail fora de ALLOWED_EMAILS antes de qualquer outra coisa
   - Execute bcrypt.compare SEMPRE, inclusive com e-mail inexistente, contra um hash
     fixo descartável. Retorno antecipado vaza quais contas existem por tempo de
     resposta
   - Erro genérico e idêntico nos dois casos: "E-mail ou senha inválidos"
   - Bloqueio progressivo: incremente failedLoginAttempts; a partir de 5, preencha
     lockedUntil com agora + 15 min e recuse mesmo com senha correta. Zere em sucesso
     e atualize lastLoginAt
   - Toda tentativa, sucesso ou falha, vai para o AuditLog

3. Sessão JWT, maxAge 7 dias, atualização por atividade. O papel (OWNER|VIEWER) vai
   no token e é lido no callback de session — nenhuma query vai ao banco só pelo papel.

4. Middleware protegendo tudo exceto /login. Nenhuma outra rota pública.

5. Papéis: OWNER (leitura e escrita), VIEWER (leitura, nunca lê PRIVATE), MANAGER
   (reservado, comportamento de OWNER limitado ao próprio time).

6. src/server/access.ts com requireUser(), requireOwner(), e visibilityFilter(user)
   devolvendo o where do Prisma. TODA leitura de OneOnOne, Feedback, Note e
   TimelineEvent passa por ele. Sem exceção.

7. src/server/audit.ts: writeAudit({ action, entity, entityId, before, after }).
   Toda Server Action de escrita chama.

8. Scripts em scripts/, registrados no package.json:
   - pnpm user:create — pergunta e-mail, nome e papel; gera senha aleatória, imprime
     UMA vez no terminal, grava só o hash
   - pnpm user:password — redefine a senha de um e-mail existente
   São a única forma de criar usuário ou trocar senha. Documente no README.

9. Página /login sóbria, seguindo DESIGN.md: nome do produto, uma linha de
   explicação, campo de e-mail, campo de senha, botão "Entrar". Sem hero, sem
   ilustração, sem link de cadastro, sem "esqueci minha senha", sem copy de
   marketing. Erro em uma linha discreta com o texto genérico do item 2.

10. No shell, mostre discretamente o usuário atual e, quando VIEWER, um indicador de
    "somente leitura" na barra de contexto.

Critério de aceite: logado como VIEWER, nenhum registro PRIVATE aparece em nenhuma
superfície — timeline, busca, command palette, contadores. Escreva um teste que
verifique isso. Segundo critério: seis senhas erradas bloqueiam a conta por 15
minutos e geram seis linhas no AuditLog.
```

---

## P6 — Equipe e cadastro

```
Leia CLAUDE.md e consulte /ui-lab. Não crie componente novo se já existe primitivo.

Implemente /team.

LISTAGEM
DataTable com: pessoa (avatar de iniciais com cor determinística derivada do id +
nome preferido + cargo), senioridade, tempo no time, status, último 1:1, combinados
em aberto, e uma coluna de atenção.

A coluna de atenção usa SeverityDot com a escala graduada, e o tooltip diz
exatamente por que aquela pessoa está sinalizada. Nada de ícone de alerta genérico.

Filtros na barra de contexto: senioridade, status, precisa de atenção. Estado na URL
via searchParams, não em estado local — precisa ser linkável e sobreviver a refresh.

Agrupamento por senioridade com cabeçalho de grupo discreto (Senior, depois Pleno,
depois Junior), controlável por toggle "agrupar por senioridade". É assim que a
hierarquia aparece naturalmente. NÃO ordene por nenhuma métrica de desempenho e não
exiba número que possa ser lido como ranking.

CADASTRO E EDIÇÃO
- Botão "Adicionar pessoa" na barra de contexto, abrindo dialog com: nome completo,
  nome preferido, cargo, senioridade, data de entrada, status, e-mail (opcional).
  Responsabilidades e competências ficam atrás de um "mais detalhes" recolhido.
- Edição do cadastro a partir do header do perfil, via dialog.
- Desativar pessoa: muda status para INACTIVE e preenche deletedAt. NUNCA apagar
  fisicamente — o histórico de gestão precisa sobreviver à saída da pessoa (D10).
- Mudança de senioridade, cargo ou status feita aqui grava um MemberChange e o
  TimelineEvent correspondente, com campo de motivo obrigatório. Não é edição
  silenciosa de cadastro: é evento de carreira.
- Avatar por iniciais. Sem upload nesta fase.

Queries em src/server/queries/members.ts. Nada de query dentro de componente.

Critério de aceite: a listagem carrega em uma única query com os agregados (último
1:1, combinados abertos) — sem N+1. Em telas < 768px vira lista de linhas
empilhadas, não scroll horizontal.
```

---

## P7 — Perfil do analista

```
Leia CLAUDE.md. Esta é a tela mais importante do produto — não a trate como mais
uma página.

Implemente src/app/(app)/team/[memberId]/layout.tsx e a aba de visão geral.

HEADER (sempre visível, altura contida, sem virar banner)
Nome, cargo, senioridade, status, data de entrada com tempo no time calculado,
gestor, último 1:1, próximo acompanhamento. Responsabilidades principais como
MetaLabels. À direita, ações primárias: Registrar 1:1, Dar feedback, Novo combinado,
Anotação, Editar cadastro. Cada uma abre dialog, sem sair da página.

ABAS EM ROTA (não estado local, para serem linkáveis)
Visão geral | Timeline | Combinados | Desenvolvimento | 1:1 e feedbacks

VISÃO GERAL — progressive disclosure com rigor. Responde "o que está acontecendo com
essa pessoa agora", em duas colunas assimétricas no desktop:

Coluna larga:
- Resumo gerencial editável inline (managerSummary)
- Últimos 5 eventos da timeline, compactos, com link para a timeline completa
- Pontos fortes e pontos de desenvolvimento ativos, lado a lado

Coluna estreita:
- Combinados em aberto, com severidade de prazo
- PDIs ativos com progresso
- Mentorias: quem essa pessoa mentora e quem a mentora
- Ritmo: dias desde o último 1:1, último feedback, último registro de qualquer tipo

NÃO coloque gráfico nesta tela. NÃO coloque KPI em card. NÃO repita informação que
já está no header. Os blocos de cumprimento de combinados e de validação de
prioridade entram aqui nas fases P11 e P12 — deixe a coluna estreita preparada para
recebê-los, mas não os crie agora.

Critério de aceite: abrindo a página fria, em menos de 5 segundos de leitura eu
consigo dizer a situação atual, as pendências e o próximo passo daquela pessoa.
```

---

## P8 — Timeline

```
Leia DESIGN.md, seção do elemento assinatura, antes de escrever qualquer CSS.

Implemente /team/[memberId]/timeline.

ANATOMIA — é a única parte do produto onde vale gastar esforço visual.
- Calha esquerda de 96px com a data em IBM Plex Mono, agrupada por mês com cabeçalho
  de mês discreto e sticky
- Régua vertical contínua de 1px em --line percorrendo toda a coluna
- Marcador de 7px sobre a régua, na cor de severidade do evento
- Quando o evento exige ação ou está vencido, o marcador ganha um traço que sangra
  4px para dentro da calha. É o único elemento do produto que quebra a grade, e é
  de propósito.
- Conteúdo à direita: etiqueta mono de 11px com o tipo, título em 13px medium,
  resumo em 13px --ink-secondary com no máximo 3 linhas e expansão inline, tags, e
  o autor discreto

FUNCIONALIDADE
- Filtro por tipo de evento em popover multi-seleção, estado na URL
- Filtro por período: 30 dias, 3 meses, 6 meses, tudo
- Busca textual dentro da timeline daquela pessoa
- Eventos vinculados a um combinado mostram o vínculo e o status atual dele
- Indicador claro de PRIVATE vs SHARED em cada evento, com ação de alternar (só
  OWNER). Alternar atualiza o registro de origem e a TimelineEvent na mesma transação
- Paginação por cursor, 40 por vez, com botão "carregar mais". SEM scroll infinito —
  scroll infinito impede voltar a um ponto conhecido, que é o uso principal aqui

SEM animação de entrada. SEM stagger. SEM fade ao rolar.

Critério de aceite: com 6 meses de histórico a timeline rola sem travar, e eu
consigo reconstruir a trajetória da pessoa lendo de cima a baixo sem abrir nada.
```

---

## P9 — Combinados

```
Leia CLAUDE.md e consulte /ui-lab.

Implemente /agreements e o formulário de criação rápida.

CENTRAL (/agreements)
DataTable com: título, responsável, origem, criado em, prazo (com severidade
graduada), prioridade, status, e um indicador de arrasto quando houver
reagendamentos. Ordenação padrão: vencidos primeiro, depois vencendo, depois por
prazo.

Visualizações em abas, todas com estado na URL:
Atrasados | Vencendo (7 dias) | Em aberto | Concluídos | Todos

Filtros: pessoa, senioridade, origem, prioridade, período de criação.

Severidade de prazo em src/lib/severity.ts: em dia = neutro; <= 3 dias = attention;
vencido <= 7 dias = attention forte; vencido > 7 dias = overdue; vencido > 30 dias =
overdue com rótulo "provavelmente esquecido".

CRIAÇÃO RÁPIDA
Dialog acionável de qualquer lugar. Obrigatórios: título, responsável, prazo. Todo o
resto é opcional, atrás de um "mais detalhes" recolhido. Enter salva. Cmd+Enter salva
e abre outro em branco (para lançar vários seguidos após uma reunião). Origem
pré-preenchida pelo contexto de onde o dialog foi aberto.

Ao criar: originalDueDate e dueDate recebem o MESMO valor. originalDueDate nunca
mais muda (D17).

CONCLUSÃO
Marcar como concluído pede o resultado em campo de uma linha, opcional mas
incentivado. Grava completedAt e escreve TimelineEvent do tipo AGREEMENT_DONE.

DETALHE DO COMBINADO
Ao abrir um combinado, mostre o histórico completo de AgreementCheckins em ordem
cronológica: data da daily, desfecho, impeditivo, novo prazo. É aqui que o arrasto
fica legível.

Server Actions em src/actions/agreements.ts. Toda escrita passa por audit e por
src/server/timeline.ts.

Critério de aceite: criar um combinado do zero leva menos de 15 segundos e no máximo
4 toques de teclado além do texto.
```

---

## P10 — Dailies com rollover e exportação

```
Leia CLAUDE.md. O requisito dominante desta tela é VELOCIDADE. Ela é usada durante
ou imediatamente após a reunião. Se demorar, o sistema é abandonado.

Implemente /dailies, /dailies/new e /dailies/[id].

═══ REGISTRO (/dailies/new) — três seções em sequência vertical ═══

SEÇÃO 1 — REVISÃO DOS COMBINADOS DE ONTEM

Ao abrir a tela, carregue automaticamente os combinados a revisar:
  (a) todos criados na daily anterior, independente de prazo
  (b) mais todos em aberto com dueDate <= hoje
Deduplique. Agrupe por pessoa.

Cada combinado é uma linha com três botões grandes de desfecho:
  Feito  |  Parcial  |  Não feito

- "Feito" → status = DONE, completedAt = data da daily, grava AgreementCheckin com
  outcome DONE. Linha colapsa e sai do caminho.
- "Parcial" ou "Não feito" → abre inline, na mesma linha, sem dialog:
    * Impeditivo — texto OBRIGATÓRIO, uma linha, com select de BlockerReason ao lado
      (opcional, mas é o que alimenta o cumprimento ajustado do P12)
    * Duas ações mutuamente exclusivas:
      → "Reagendar" — seletor de nova data (padrão: próxima daily). Estende o dueDate
        do MESMO Agreement. originalDueDate NÃO muda. Não cria registro novo, não
        muda o status (D12, D17).
      → "Substituir por novo combinado" — título e prazo. O antigo vai para
        CANCELLED, o novo nasce com replacesAgreementId apontando para ele.
    * Em ambos os casos, grava AgreementCheckin.

Se um combinado já tem 3 ou mais reagendamentos, exiba na linha um indicador de
severidade overdue com o texto "arrastado Nx". É o sinal gerencial mais importante
desta tela — não o esconda atrás de hover.

SEÇÃO 2 — PARTICIPANTES E NOTAS

Membros ativos, todos presentes por padrão, desmarcáveis com um clique. Uma linha por
pessoa: nota livre + botão discreto que marca a nota como bloqueio. Tab percorre as
pessoas na ordem.

SEÇÃO 3 — COMBINADOS DE HOJE

Linhas inline: responsável (select), título, prazo (padrão: próxima daily). Enter
adiciona outra linha em branco. Nascem com origin = DAILY e sourceDailyId
preenchidos, e é esse conjunto que a daily de amanhã puxa na Seção 1.

Resumo geral e decisões abaixo, colapsados por padrão.

COMPORTAMENTO GERAL
- Rascunho em localStorage a cada 10 segundos, restaurado se recarregar. Local
  apenas, sem sincronização com servidor.
- Cmd+Enter salva tudo.
- Salvamento em uma única prisma.$transaction: Daily, DailyParticipants,
  AgreementCheckins, atualizações de Agreement, Agreements novos, e um TimelineEvent
  por pessoa que recebeu nota ou teve combinado revisado. Presença sem nota e sem
  combinado NÃO gera evento — presença não é fato de prontuário.

═══ EXPORTAÇÃO PARA WHATSAPP ═══

Implemente src/server/whatsapp.ts. Botão "Copiar para WhatsApp" no fim do formulário
e em /dailies/[id].

Texto puro com formatação nativa do WhatsApp (*negrito*, _itálico_), copiado via
navigator.clipboard com fallback para textarea oculta + execCommand. Confirmação
discreta de "copiado" por 2 segundos.

EXCEÇÃO EXPLÍCITA À REGRA DE EMOJI (D16): a proibição vale para a INTERFACE. Este
texto vai para o WhatsApp, onde emoji é idioma nativo e ajuda a varrer a mensagem no
grupo. Use ✅ ⚠️ 🔴 apenas neste arquivo, em nenhum componente de UI.

Formato:

*Daily — 01/10/2026*

*Combinados de ontem*
✅ Camila — Documentar fluxo de escalonamento
⚠️ Diego — Revisar chamados reabertos
_Impeditivo: aguardando acesso ao painel do cliente_
_Novo prazo: 03/10_

*Combinados de hoje*
• Larissa — Finalizar tutorial de instalação — 02/10
• Vinícius — Mapear chamados recorrentes do cliente Nbusiness — 03/10

*Bloqueios*
🔴 Henrique — sem acesso ao ambiente de homologação

Regras do gerador: omita seções vazias por completo (sem "Nenhum bloqueio"). Use o
nome preferido, nunca o completo. Datas em DD/MM. Sem cabeçalho institucional, sem
assinatura, sem rodapé.

NÃO gere link wa.me: o WhatsApp não aceita texto pré-preenchido para grupos, só para
conversas individuais. Um botão que promete abrir o grupo e falha é pior que copiar.

═══ HISTÓRICO (/dailies) ═══

Lista cronológica compacta: data, presentes, bloqueios, combinados revisados,
combinados criados, primeira linha do resumo. Expandir mostra o detalhe sem sair da
página. Botão de copiar para WhatsApp em cada daily passada.

Critério de aceite: registrar uma daily revisando 5 combinados (3 feitos, 2 com
impeditivo e reagendamento), com notas para 4 pessoas e 3 combinados novos, leva
menos de 3 minutos sem usar o mouse depois do primeiro campo.
```

---

## P11 — Validação de prioridade

```
Leia CLAUDE.md, DESIGN.md e o skill de UI. Consulte /ui-lab — esta tela segue o
mesmo padrão visual e técnico das existentes, sem exceção.

Implemente /priority-validations.

═══ FORMULÁRIO (topo, sempre visível, uma linha de campos) ═══

A tela é de registro rápido e repetitivo: o supervisor valida vários chamados em
sequência. Otimize para isso.

1. URL do chamado — ao colar ou sair do campo, extraia o ID aplicando os
   TicketUrlPattern ativos em ordem, e exiba o ID ao lado do campo em IBM Plex Mono.
   Se nenhum padrão casar, permita digitar o ID manualmente e sinalize discretamente
   que o padrão não reconheceu — nunca bloqueie o registro por isso.
2. Responsável — select de TeamMember ativos, buscável por digitação.
3. Prioridade do analista — select de PriorityLevel ativos, ordenado por rank
   decrescente.
4. Prioridade validada — mesmo select. Desabilitado quando "Devolver" está marcado.
5. Devolver para reanálise — checkbox. Quando marcado, outcome = RETURNED,
   sobrepondo qualquer cálculo, e a prioridade validada é dispensada.
6. Resultado — NÃO é campo editável. StatusPill calculado ao vivo:
     supervisorRank > analystRank → "Elevada"   (attention)
     supervisorRank < analystRank → "Rebaixada" (attention)
     iguais                       → "Mantida"   (calm)
     devolver marcado             → "Devolvida" (overdue)
7. Motivo da alteração — select de ReclassificationReason. APARECE e torna-se
   obrigatório apenas quando o resultado for diferente de "Mantida". Quando o motivo
   for "Outro", abre campo de texto também obrigatório. Valide no zod E no banco.
8. Observação — opcional, uma linha.

Data/hora e usuário supervisor gravados automaticamente, sem campo na tela.
Grave analystRankSnapshot e supervisorRankSnapshot com os ranks vigentes (D14).

Ao salvar: limpa o formulário, devolve o foco ao campo de URL, e a nova linha
aparece na tabela. Cmd+Enter salva. O fluxo precisa suportar 20 chamados seguidos
sem tocar no mouse.

═══ RESUMO DO DIA ═══

Um StatStrip, não seis cards: Avaliados · Mantidos · Alterados · Elevados ·
Rebaixados · Devolvidos. "Alterados" é a soma dos três últimos. Exiba a taxa de
alteração em percentual ao lado de "Alterados". Sem registros no dia, mostre
EmptyState em vez da faixa zerada.

═══ TABELA DO DIA ═══

DataTable: hora, ID do chamado (link para a URL, nova aba), responsável, prioridade
do analista, prioridade validada, resultado (StatusPill), motivo. Mais recente
primeiro. Editar e excluir (soft delete) na linha, discretos.

═══ FILTROS E PERÍODO ═══

Barra de contexto: período (hoje, 7 dias, 30 dias, mês atual, intervalo
personalizado), responsável, resultado, motivo. Estado na URL.
Fora de "hoje", a tabela ganha coluna de data e o resumo reflete o período.

═══ QUERIES PARA RELATÓRIO FUTURO ═══

Não construa telas de relatório. Construa as queries em
src/server/queries/priority-validations.ts, cada uma recebendo intervalo de datas:
  summaryByPeriod(from, to)
  summaryByMember(from, to)              — por analista, com taxa de alteração
  summaryByReason(from, to)              — motivos mais frequentes
  summaryByPriorityTransition(from, to)  — matriz origem × destino
Precisam rodar sobre os índices do schema sem alteração de estrutura.

═══ BLOCO NO PERFIL ═══

Em /team/[memberId], aba de visão geral, coluna estreita: bloco compacto de três
linhas — validações nos últimos 90 dias, taxa de alteração, motivo mais frequente.
Sempre com o total ao lado da taxa (D19).

Inclua ali uma ação "Registrar feedback sobre isto", que abre o formulário de
feedback com a pessoa preenchida e o contexto sugerido — sugerido, nunca escrito
automaticamente.

NÃO escreva TimelineEvent (D15). NÃO exiba como score ou nota. NÃO ordene pessoas
por taxa de alteração (D7).

═══ CONFIGURAÇÃO ═══

Em /settings, CRUD de PriorityLevel (com reordenação de rank),
ReclassificationReason, BlockerReason (com categoria) e TicketUrlPattern. Para
TicketUrlPattern, inclua campo de teste onde o usuário cola uma URL e vê o ID que
seria extraído.

Critério de aceite: validar 10 chamados colando URLs leva menos de 2 minutos.
Alterar a ordem dos PriorityLevel em /settings NÃO muda o resultado de nenhum
registro histórico.
```

---

## P12 — Cumprimento de combinados

```
Leia CLAUDE.md, decisões D17, D18 e D19. Consulte /ui-lab.

Implemente a medição de cumprimento de combinados ao longo do tempo. Nenhuma taxa é
persistida — tudo é calculado em query sobre originalDueDate, completedAt e
AgreementCheckin.

═══ CAMADA DE QUERY — src/server/queries/adherence.ts ═══

Todas recebem (memberId | null, from, to):

getAdherence(memberId, from, to) retornando:
  totalDue        — combinados cujo originalDueDate caiu no período
  doneOnTime      — concluídos com completedAt <= originalDueDate
  doneLate        — concluídos com completedAt > originalDueDate
  stillOpen       — não concluídos e já vencidos
  cancelled
  adherenceRate   — doneOnTime / totalDue
  adjustedTotal   — totalDue menos os cujo último AgreementCheckin tem
                    blockerReason.category = EXTERNAL
  adjustedRate    — doneOnTime / adjustedTotal
  avgReschedules  — média de AgreementCheckins com newDueDate preenchido
  maxReschedules
  chronicCount    — combinados com 3 ou mais reagendamentos

getAdherenceSeries(memberId, months) — a mesma estrutura, agregada por mês, para os
últimos N meses. É o que responde "no decorrer do tempo".

getTeamAdherence(from, to) — o agregado por pessoa, mais o total do time.

getBlockerBreakdown(memberId, from, to) — contagem por BlockerReason e por categoria.
É o que diferencia "não cumpre" de "é bloqueado".

REGRAS DE HONESTIDADE, não negociáveis:
- Nenhuma função retorna taxa sem retornar também o denominador. Quem chamar precisa
  ter o total em mãos (D19).
- Quando totalDue < 5, a taxa é retornada mas marcada com um campo
  lowConfidence: true. A UI é obrigada a sinalizar.
- adjustedRate nunca substitui adherenceRate. As duas aparecem juntas, sempre.

═══ BLOCO NO PERFIL ═══

Em /team/[memberId]/agreements, acima da lista:
- StatStrip com os últimos 90 dias: cumpridos no prazo, com atraso, em aberto
  vencidos, e a taxa com o total ao lado no formato "78% (14 combinados)"
- Ao lado da taxa bruta, a ajustada, com rótulo explícito: "ajustada (excluindo
  bloqueio externo): 91%"
- Sparkline de 6 meses da taxa mensal, com o número do mês corrente ao lado
- Quando chronicCount > 0, uma linha de severidade overdue: "2 combinados arrastados
  3 vezes ou mais" com link para eles
- Breakdown de impeditivos em até 4 linhas, ordenado por frequência

═══ VISÃO DE EQUIPE — /agreements/adherence ═══

DataTable com uma linha por pessoa: nome, senioridade, total de combinados no
período, cumpridos no prazo, taxa bruta, taxa ajustada, arrasto médio, tendência.

A coluna de tendência compara os últimos 30 dias com os 30 anteriores e mostra uma
seta com o delta em pontos percentuais. É a informação mais útil da tela: quem
estava em 60% e foi para 85% merece reconhecimento; quem caiu de 90% para 65% merece
uma conversa. Taxa isolada não mostra nenhum dos dois.

Ordenação padrão: alfabética. É permitido ordenar por taxa, porque você é o gestor e
vai querer — mas o total de combinados aparece SEMPRE na mesma linha, e quem tem
totalDue < 5 recebe marcação visual de amostra insuficiente e é excluído de qualquer
cálculo de média do time.

Seletor de período na barra de contexto: 30 dias, 90 dias, 6 meses, 12 meses,
intervalo personalizado. Estado na URL.

Abaixo da tabela, uma linha de leitura do time: total de combinados, taxa do time,
e o impeditivo mais frequente do período.

NÃO transforme isso em score, nota ou ranking público (D7). NÃO escreva
TimelineEvent para métrica de cumprimento — é agregado, não evento. NÃO exiba essa
tela ou seus números em nenhuma superfície de feedback automaticamente.

Inclua na linha de cada pessoa uma ação "Registrar feedback", que abre o formulário
com a pessoa preenchida e o contexto sugerido. Transformar um padrão em conversa é
ato seu, explícito.

═══ ALERTA ═══

Acrescente a src/server/alerts.ts (será consumido pelo P15):
- "Cumprimento em queda": pessoa cuja taxa dos últimos 30 dias caiu 20 pontos
  percentuais ou mais em relação aos 30 anteriores, com totalDue >= 5 nos dois
  períodos.
- "Combinado crônico": qualquer Agreement em aberto com 3 ou mais reagendamentos.

Critério de aceite: abrindo o perfil do Henrique no seed, a queda de cumprimento é
visível sem eu precisar clicar em nada. Abrindo o do Diego, a taxa ajustada é
claramente maior que a bruta, porque o bloqueio dele é externo.
```

---

## P13 — 1:1 e feedbacks

```
Leia CLAUDE.md.

Implemente /records (índice cruzado), /team/[memberId]/records e os formulários.

1:1 — campos: pessoa, data, duração, assuntos tratados, percepção do colaborador,
percepção do gestor, conquistas, dificuldades, desenvolvimento, próxima revisão, e
bloco de combinados gerados inline.
Progressive disclosure: pessoa, data e assuntos aparecem de cara; o resto em seções
recolhidas. Ninguém preenche 10 campos de uma vez.
Padrão de visibilidade: PRIVATE.

FEEDBACK — campos na ordem do modelo SCI, com rótulos que ajudam a escrever bem:
- Contexto: quando e onde aconteceu
- Comportamento observado: o que a pessoa fez, específico e sem interpretação
- Impacto: o efeito no cliente, no time ou no resultado
- Orientação: o que fica combinado daqui pra frente
Mais: pessoa, data, categoria (6 opções), follow-up opcional, combinado gerado.
Padrão PRIVATE, exceto categoria RECOGNITION, que sugere SHARED — sugere, não impõe.

PAINEL DE CONTEXTO
Ao registrar um 1:1, ofereça pré-carregar num painel lateral somente leitura: os
combinados em aberto daquela pessoa, o último feedback, o PDI ativo, e o que ficou
pendente do 1:1 anterior. É o que torna a tela útil de verdade — você entra no 1:1
vendo o que ficou do último.

ÍNDICE (/records): tabela unificada dos dois tipos, com filtro por tipo, pessoa,
categoria e período. Coluna de follow-up com severidade quando vencido.

Critério de aceite: abrindo o formulário de 1:1 para uma pessoa, eu vejo o que ficou
pendente do encontro anterior sem navegar para outra tela.
```

---

## P14 — Desenvolvimento e PDI

```
Leia CLAUDE.md, seção 5.4 do PLANO-TECNICO.md.

Implemente /development e /team/[memberId]/development.

POR PESSOA
- PDIs ativos e concluídos. Cada plano: competência, situação atual, objetivo,
  evidência esperada, ações com responsável e prazo, progresso, último acompanhamento.
- Ação "registrar acompanhamento" que atualiza lastReviewedAt e escreve na timeline.
  Um PDI sem acompanhamento é um PDI morto — a UI precisa deixar isso visível.
- Competências avaliadas: nível atual vs esperado da senioridade atual, e vs a
  próxima. Barras horizontais discretas de 4px. NÃO radar chart, NÃO gráfico colorido.
- Pontos fortes e de desenvolvimento, com histórico de quando foram observados.

VISÃO GERAL (/development)
- PDIs por status
- PDIs parados (sem acompanhamento há mais de 45 dias) em destaque de severidade
- Mapa de mentorias: quem mentora quem, em qual competência, desde quando. Lista
  agrupada por mentor. NÃO organograma, NÃO grafo.
- Prontidão para próxima senioridade: apenas para quem tem todas as competências no
  nível esperado. Rótulo neutro do tipo "atende ao nível esperado de Pleno em 8 de 10
  competências". NUNCA um score, NUNCA uma porcentagem de prontidão, NUNCA uma
  ordenação entre pessoas.

Deixe CompetencyExpectation preenchível em /settings, mas não preencha a matriz.

Critério de aceite: nenhuma tela desta seção ordena pessoas por desempenho ou exibe
número que possa ser lido como nota.
```

---

## P15 — Hoje e motor de alertas

```
Leia CLAUDE.md, seção 5.7 do PLANO-TECNICO.md.

Primeiro complete src/server/alerts.ts com getAlerts(teamId, userId). Alertas são
DERIVADOS em query, nunca persistidos (D9). Limiares em Settings, com estes padrões:

| Combinado vencido           | dueDate < hoje e status aberto/em andamento |
| Combinado vencendo          | dueDate em até 3 dias |
| Combinado crônico           | 3 ou mais reagendamentos, ainda em aberto |
| Sem 1:1 há muito tempo      | Junior > 21 dias · Pleno > 30 · Senior > 30 |
| Silêncio gerencial          | nenhum registro de qualquer tipo há > 30 dias |
| PDI parado                  | plano ativo sem lastReviewedAt há > 45 dias |
| Follow-up de feedback vencido | followUpAt < hoje sem registro posterior |
| Daily não registrada        | nenhuma Daily nos últimos 2 dias úteis |
| Cumprimento em queda        | taxa dos últimos 30d caiu >= 20pp vs 30d anteriores, com totalDue >= 5 nos dois |
| Prontidão                   | todas as competências no nível da próxima senioridade — informativo, nunca automático |

Depois implemente a home /.

Esta tela responde UMA pergunta: "quem precisa da minha atenção hoje?". NÃO é grade
de cards de KPI. Composição editorial, duas colunas assimétricas:

COLUNA PRINCIPAL — "Precisa de você"
Lista única ordenada por urgência real, misturando os tipos de alerta. Cada linha:
severidade, pessoa, o que aconteceu em uma frase, há quanto tempo, e a ação direta
(resolver, agendar, registrar). Sem nada pendente, um estado vazio honesto — "Nada
vencido hoje", não uma comemoração.

COLUNA LATERAL
- Composição do time: 9 pessoas, 1 Senior / 4 Plenos / 4 Juniors, numa barra
  horizontal segmentada de 6px. Uma linha, não três cards.
- Ritmo de gestão: dias desde a última daily, 1:1 no mês, feedbacks no mês, taxa de
  cumprimento do time no mês. StatStrip, sem card, sem ícone.
- Próximos acompanhamentos: próximos 7 dias
- Últimas movimentações: 8 eventos mais recentes de qualquer pessoa

BARRA DE AÇÕES no topo: Registrar daily · Novo combinado · Validar prioridade ·
Registrar 1:1 · Dar feedback. Texto curto, sem ícone grande.

Acrescente contadores discretos nos itens da sidebar, usando a mesma fonte de dados
de getAlerts.

Critério de aceite: abrindo a home às 9h, em 10 segundos eu sei o que fazer hoje. Se
a tela tiver mais de duas superfícies retangulares delimitadas, refaça.
```

---

## P16 — Busca global

```
Leia CLAUDE.md.

1. Command palette com ⌘K / Ctrl+K usando o componente command já reestilizado.
   Duas funções num só lugar:
   - NAVEGAR: pessoas, páginas, combinados recentes
   - REGISTRAR: Nova daily, Novo combinado, Validar prioridade, Registrar 1:1, Dar
     feedback, Anotação. Com uma pessoa no contexto, o formulário abre já preenchido.
   Digitar o nome de uma pessoa oferece tanto abrir o perfil quanto registrar algo
   para ela. É o caminho de captura mais rápido do produto.

2. Busca no servidor com Postgres full-text search em português:
   - tsvector sobre título e corpo de TimelineEvent, Feedback, OneOnOne, Note,
     Agreement
   - Coluna gerada + índice GIN, criados via migration
   - Dicionário 'portuguese'
   - Resultados agrupados por tipo, com trecho e destaque do termo
   - visibilityFilter aplicado. VIEWER não encontra registro PRIVATE nem por busca.

3. Página /search como fallback para resultados extensos, com os mesmos filtros.

Não instale Algolia, Meilisearch ou serviço externo. Postgres resolve com folga
nesse volume.

Critério de aceite: buscar um termo do corpo de um feedback de 4 meses atrás
encontra o registro em menos de 300ms.
```

---

## P17 — Arquitetura de score

```
Leia a seção 5.5 do PLANO-TECNICO.md e a decisão D5.

ATENÇÃO: nesta fase você NÃO cria fórmula, NÃO calcula score, NÃO exibe número de
desempenho em nenhuma tela de pessoa, e NÃO integra com helpdesk. Se você se pegar
escrevendo uma média ponderada, pare.

1. /settings/metrics — CRUD de MetricDefinition: chave, rótulo, unidade, direção,
   sistema de origem, ativa. Já populado pelo seed com volume, SLA de primeira
   resposta, SLA de atendimento, CSAT, retorno em 72h, recorrência, reabertura,
   backlog e tempo médio — todas sem nenhum resultado.

2. /settings/score — CRUD de ScoreDefinition com versionamento: criar versão nova,
   ativar/desativar, configurar ScoreComponents com peso e faixa de normalização por
   métrica. A soma dos pesos é exibida e validada, mas NÃO calcule nada.

3. Tela de pré-visualização que, dada uma ScoreDefinition, mostra a composição: quais
   métricas entram, com que peso, em que direção. É documentação viva da fórmula, não
   execução dela.

4. Documente em CLAUDE.md, em seção nova, o contrato de importação futura: formato
   esperado de MetricResult, chave de correspondência entre analista do helpdesk e
   TeamMember, granularidade de período, e a obrigatoriedade de sampleSize.

5. Crie src/server/score.ts contendo apenas os tipos e nenhuma implementação, com
   este comentário no topo: métricas operacionais são insumo de conversa, não
   substituto de avaliação, e nenhum score pode ser exibido sem o breakdown que o
   explica.

Critério de aceite: nenhuma tela de pessoa mudou nesta fase.
```

---

## P18 — Mobile, acessibilidade e deploy

```
Leia CLAUDE.md e DESIGN.md.

MOBILE (uso secundário: leitura antes de reunião e captura simples)
- Revise cada tela entre 360px e 768px. Toda DataTable vira lista de linhas
  empilhadas, com os 3 campos mais importantes visíveis e o resto atrás de um toque.
- Alvos de toque de no mínimo 44px em ações. Pode quebrar a densidade de 40px no
  mobile — é a exceção correta.
- A timeline no mobile move a data da calha para o topo de cada entrada.
- Formulários de captura rápida (combinado, anotação, validação de prioridade)
  funcionam bem no celular. Formulários longos (1:1, daily) mostram aviso de que a
  experiência é melhor no desktop, mas continuam funcionais.
- manifest.json para instalação como atalho. SEM service worker, SEM cache offline,
  SEM sincronização.

ACESSIBILIDADE
- Navegação por teclado completa em todas as telas
- Foco visível em tudo, nunca removido
- Contraste AA verificado nos tokens, incluindo os washes de severidade
- prefers-reduced-motion desliga todas as transições
- Severidade nunca comunicada só por cor: sempre há rótulo, posição ou ícone junto

DEPLOY
- Vercel com build command: prisma migrate deploy && next build
- Região de função gru1 se o plano permitir
- Variáveis de ambiente documentadas em .env.example
- Confirme que /ui-lab está bloqueada em produção
- Ative Deployment Protection na Vercel: método Vercel Authentication, escopo
  Standard Protection. Fecha as URLs de preview, que carregam dados de seed com
  nomes e feedbacks. O domínio de produção continua público no plano Hobby — é a
  tela de login que o protege.
- Script de backup: pg_dump semanal documentado no README

FINAL
Atualize CLAUDE.md: preencha "Funcionalidades existentes" com tudo que foi
construído, e reescreva o backlog de curto prazo com o que ficou de fora.

Critério de aceite: pnpm build passa, Lighthouse de acessibilidade acima de 95, e a
aplicação é utilizável de ponta a ponta num iPhone.
```

---

# PARTE E — As checagens que só você faz

## Depois do P1 — `/ui-lab`

`pnpm dev`, abra `http://localhost:3000/ui-lab` e **olhe**. Não leia código.

| Pergunta | Se sim |
|---|---|
| Sombra visível em card? | Reprova |
| Cantos muito arredondados? | Reprova |
| Fonte serifada em algum lugar? | Reprova |
| Datas **não** estão em monoespaçada? | Reprova |
| Linha de tabela com muito ar? | Reprova |
| Azul de seleção parece Bootstrap? | Reprova — tem que ser `#2C4A7C` |
| Parece template genérico de admin? | Reprova |

Reprovou? Aponte específico: *"na DataTable, a linha selecionada está com fundo azul saturado; deve ser `--accent-wash` `#EDF1F6` com barra inset de 2px em `--accent`"*. Vago não corrige.

## Depois do P3 — `schema.prisma`

- [ ] `AgreementStatus` tem exatamente `OPEN`, `IN_PROGRESS`, `DONE`, `CANCELLED`. **Sem `OVERDUE`**
- [ ] `Agreement` tem `originalDueDate` **e** `dueDate`, separados
- [ ] `BlockerReason` tem `category` com `EXTERNAL`, `INTERNAL`, `CAPACITY`
- [ ] `TeamMember` é separado de `User`
- [ ] `Seniority` é `model`, não `enum`
- [ ] `visibility` em `OneOnOne`, `Feedback`, `Note` e `TimelineEvent`
- [ ] Uma tabela `MemberTrait` com `kind` — não duas
- [ ] Não existe `DailyNote` — está em `DailyParticipant`
- [ ] `ScoreResultComponent` e `MetricResult.sampleSize` existem
- [ ] `User` tem `passwordHash`, `failedLoginAttempts`, `lockedUntil`
- [ ] **Não** existem `Account`, `Session`, `VerificationToken`

## Depois do P5 — teste de vazamento

1. `pnpm user:create` duas vezes: uma `OWNER`, uma `VIEWER`
2. Como `OWNER`, crie uma nota `PRIVATE`
3. Saia, entre como `VIEWER`
4. A nota **não pode aparecer** em: timeline, busca, command palette, contadores

Aparecendo em qualquer uma, é bug crítico. Não faça merge.

## Depois do P10 — cronômetro

Registre uma daily revisando 5 combinados, com notas para 4 pessoas e 3 combinados novos, sem mouse depois do primeiro campo. **Acima de 3 minutos é regressão.**

## Depois do P12 — leitura dos dados

Abra o perfil do Henrique: a queda de cumprimento precisa estar visível sem clicar em nada. Abra o do Diego: a taxa ajustada precisa estar claramente acima da bruta, porque o bloqueio dele é externo. Se as duas coisas não saltarem aos olhos, a tela falhou — mesmo que os números estejam certos.

---

# PARTE F — Avisos

**Guarde as senhas.** Sem recuperação de senha, se você esquecer a sua o acesso morre. O `pnpm user:password` resolve, mas só com o `DATABASE_URL` em mãos. No dia em que criar as duas contas, salve no gerenciador.

**O extrator de ID de chamado.** O padrão genérico pega a maior sequência de dígitos da URL — acerta na maioria dos helpdesks. Me mande uma URL real de chamado (pode trocar o número) e eu devolvo o regex exato para cadastrar em `/settings`.

**Reordenar fases.** O `/next-phase` segue a ordem do `PROGRESS.md`. Se quiser a Validação de Prioridade funcionando antes dos módulos de desenvolvimento, mova a linha do P11 para onde quiser — a numeração do prompt não importa, a ordem da tabela sim.
