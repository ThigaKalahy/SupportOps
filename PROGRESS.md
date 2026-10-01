# Progresso

| Fase | Status | Commit | Data |
|------|--------|--------|------|
| P0  Fundação documental        | concluída | | |
| P1  Design system              | concluída — aguarda checagem visual | 94e0273 | 01/10/2026 |
| P2  App shell                  | concluída | 377ecce | 01/10/2026 |
| P3  Schema Prisma              | concluída | (hash) | 01/10/2026 |
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

### P1 — Design system (branch `fase/1-design-system`)

- **Ficou de fora:** modo escuro (decidido: fora do MVP, registrado no DESIGN.md); limiares da escala de idade (`ageSeverity` exige limiares por módulo — cada fase informa os seus, ex.: 45 dias no P14); verificação no navegador — /ui-lab foi validado só por HTTP 200, CSS compilado e varredura do código, sem olhar a tela nem o console de hidratação.
- **Ajustes pós-fase (aprovados pelo Thiago):** `--attention` #A8730E → #94650C e `--calm` #4B7A5A → #487756 para passar AA; token novo `--attention-strong` #9E4F14 / wash #FAEEE4 para o degrau laranja (prop `strong` em StatusPill e SeverityDot); `--ink-tertiary` restrito a placeholder, desabilitado e marcador de ausência; exemplo do BLOCKERS.md recuado para não disparar o phase-gate; `jq` 1.8.2 já instalado — hooks passam a valer após reabrir o VS Code.
- **Precisa de revisão humana:** a checagem da Parte E em `pnpm dev` → /ui-lab, incluindo os tons novos de âmbar, laranja e verde; as decisões tomadas sem pedir — subset `latin` junto com `latin-ext` (só `latin-ext` jogaria ASCII para a fonte do sistema), outline de foco deslocado para dentro (`-2px`) em linhas de tabela e no campo da paleta para não ser cortado, tooltip com 400ms de atraso, polegar da ScrollArea com `rounded-full` (regra global de barra de rolagem), SeverityDot desenhado como círculo SVG em vez de `rounded-full`.
- **A próxima fase assume:** primitivos em `src/components/ui/` (consultar /ui-lab antes de criar qualquer coisa); tokens só via classes do tema (`bg-canvas`, `text-ink-secondary`, `bg-overdue-wash`, `max-w-page`...); texto visível só via `src/lib/labels.ts`; datas via `src/lib/dates.ts` distinguindo timestamp de data de negócio; `/` ainda responde 404 — o P2 cria `src/app/(app)/page.tsx`.

### P2 — App shell (branch `fase/2-app-shell`)

- **Ficou de fora:** busca da barra de contexto oculta abaixo de 768px (inerte até o P16; em 360px não cabe junto do breadcrumb); abertura do drawer e navegação por teclado ponta a ponta não foram exercitadas por clique/teclado — verificadas pela ordem do DOM, pelos estados forçados no /ui-lab e por screenshots headless do Edge em 360, 768, 900, 1280 e 1920px; nenhuma página tem ação primária ainda (botão sem função seria falso — o slot existe e está no /ui-lab).
- **Precisa de revisão humana:** abrir o drawer em tela < 1024px e percorrer a navegação com Tab; o contorno de foco em linha de tabela aparece só em cima e embaixo (o Chrome não desenha as laterais do outline em `<tr>`); correção feita na DataTable do P1 — a soma das larguras fixas fazia a coluna flexível sumir em contêiner estreito, agora há `hideBelow` e `w-full min-w-0`.
- **A próxima fase assume:** páginas novas entram em `src/app/(app)/` e herdam o shell; ação primária via `<ContextActions>`; sub-rotas de `/team/[memberId]` aparecem no breadcrumb pelos rótulos de `nav-config.ts` (segmento dinâmico é omitido — o P7 deve injetar o nome da pessoa); o P3 depende do banco Neon já provisionado e de `DATABASE_URL`/`DIRECT_URL` no `.env.local`.

### P3 — Schema Prisma (branch `fase/3-schema-prisma`)

- **Ficou de fora:** seed (é do P4 — o prompt do P3 lista valores de seed, mas proíbe criar seed nesta fase); tabela de limiares de alerta "em Settings" citada no P15 e no PLANO-TECNICO (não está na lista do P3; o P15 cria por migration nova); `server-only` no `db.ts` (biblioteca fora da stack — o arquivo só documenta que é de servidor).
- **Precisa de revisão humana:** decisões que tomei onde o prompt não dizia — `AuditLog.userId` e `entityId` opcionais (login com e-mail inexistente não tem usuário); `MemberChange.fromValue` opcional (primeira atribuição); `Agreement.completedAt` como `@db.Date` (é a data da daily); `Note.occurredAt` e `DevelopmentPlan.lastReviewedAt` como `timestamptz`; valores de `DevelopmentAction.status` = OPEN/IN_PROGRESS/DONE/CANCELLED; `MemberCompetency` com uma linha por pessoa × competência (sem histórico de níveis); `MemberResponsibility` com chave incluindo `assignedAt`; `Daily` sem unicidade por data; CHECKs e trigger além dos pedidos (supervisor obrigatório fora de RETURNED, outcome coerente com ranks, mentor ≠ mentorado, `sampleSize >= 0`, `originalDueDate` imutável); `ScoreDefinition.isActive` nasce `false`; linhas da timeline apagadas em cascata com o registro de origem. O índice GIN foi declarado também no schema — só no SQL manual, o Prisma tentava removê-lo em toda migration nova (era por isso que o `migrate dev` travava pedindo nome de migration).
- **A próxima fase assume:** banco migrado e vazio no branch `main` do Neon; `db` de `src/server/db.ts` como cliente padrão; o P4 precisa configurar `prisma.seed` no package.json para o `db:seed` funcionar, e resolver o bloqueio aberto em BLOCKERS.md (são oito ou nove motivos de reclassificação?). O P18 deve usar `prisma migrate deploy` sem `--env-file` no build da Vercel.

