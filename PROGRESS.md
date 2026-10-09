# Progresso

| Fase | Status | Commit | Data |
|------|--------|--------|------|
| P0  Fundação documental        | concluída | | |
| P1  Design system              | concluída — aguarda checagem visual | 94e0273 | 01/10/2026 |
| P2  App shell                  | concluída | 377ecce | 01/10/2026 |
| P3  Schema Prisma              | concluída | aa6c80d | 01/10/2026 |
| P4  Seed                       | concluída | b6b6411 | 01/10/2026 |
| P5  Auth e visibilidade        | concluída | d04cfae | 01/10/2026 |
| P6  Equipe e cadastro          | concluída | 9510608 | 01/10/2026 |
| P7  Perfil do analista         | concluída | 2cbe624 | 02/10/2026 |
| P8  Timeline                   | concluída | e308b39 | 02/10/2026 |
| P9  Combinados                 | concluída | 66f1bb1 | 02/10/2026 |
| P10 Dailies com rollover       | concluída | f3c0304 | 02/10/2026 |
| P11 Validação de prioridade    | concluída | e45bc5a | 02/10/2026 |
| P12 Cumprimento de combinados  | concluída | bd143e2 | 02/10/2026 |
| P13 1:1 e feedbacks            | concluída | f946089 | 02/10/2026 |
| P14 Desenvolvimento e PDI      | concluída | ea82549 | 02/10/2026 |
| P15 Hoje e motor de alertas    | concluída | 82bd937 | 03/10/2026 |
| P16 Busca global               | concluída | 42f8738 | 03/10/2026 |
| P17 Arquitetura de score       | concluída | 00866f3 | 03/10/2026 |
| P18 Mobile, a11y e deploy      | concluída — deploy aguarda a conta Vercel (BLOCKERS.md) | 754591e | 03/10/2026 |
| C1  Prazo padrão do combinado  | concluída | 0caa973 | 08/10/2026 |
| P19 Central de atendimento     | código pronto — migration aguarda autorização para rodar no banco de produção | | 08/10/2026 |
| P20 Devolução do desenvolvimento | código pronto — migration aguarda autorização (junto com a do P19) | | 09/10/2026 |
| P21 Em observação             | código pronto — migration aguarda autorização (junto com as do P19 e P20) | | 10/10/2026 |
| P22 Multi-tenancy (banco e acesso) | concluída — ensaiada no branch de teste; migrations aguardam aplicação em produção | 1fba67d | 11/10/2026 |

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

### P4 — Seed (branch `fase/4-seed`)

- **Ficou de fora:** o VIEWER (o ALLOWED_EMAILS tem um só e-mail; decisão sua — criar no P5 com `pnpm user:create`); AuditLog do seed (é carga de demonstração, não ação de usuário); TimelineEvent para AgreementCheckin, MentorshipLink e MemberTrait (o modelo não tem coluna de origem para eles — o arrasto aparece no próprio combinado); Notes (anotações) não foram pedidas e não existem no seed; a checagem visual no Prisma Studio — a distribuição desigual foi verificada por SQL, não abri o Studio.
- **Precisa de revisão humana:** linhas da timeline de combinado, daily, PDI e mudança de carreira nascem SHARED, porque esses registros não têm campo de visibilidade — o VIEWER vai vê-las; confirmar no P5 se é isso mesmo, especialmente as notas individuais de daily. Números finais: 95 combinados (6 a mais que o pedido, para o Henrique ter massa suficiente nas janelas de 30 dias), 68 checkins, 41 dailies, 37 1:1, 51 feedbacks, 14 PDIs, 180 validações, 333 linhas de timeline. O padrão genérico de URL é `(\d+)`: o extrator do P11 precisa aplicar o padrão a todas as ocorrências e ficar com a mais longa. O `package.json#prisma.seed` está deprecado no Prisma 7 (funciona no 6).
- **A próxima fase assume:** banco populado no branch `main` do Neon; usuário OWNER existente sem `passwordHash` — o P5 deve criar `user:password` para definir a senha dele e `user:create` para o VIEWER; seed pode ser reaplicado a qualquer momento sem duplicar.

### P5 — Auth e visibilidade (branch `fase/5-auth`)

- **Ficou de fora:** `AUTH_SECRET` real (bloqueio aberto em BLOCKERS.md — gerar e colar no `.env.local`); senha do OWNER e conta do VIEWER (dependem de você rodar `pnpm user:password` e `pnpm user:create`); superfícies de timeline, busca, command palette e contadores ainda não existem — o teste de visibilidade cobre as funções de leitura que elas vão usar e reprova, por varredura do código, qualquer leitura nova sem `visibilityFilter`; nenhuma Server Action de escrita existe ainda para chamar `requireOwner` + `writeAudit` (o padrão está pronto); o aviso de build do `jose` (dependência do Auth.js) sobre `CompressionStream` no Edge é conhecido e inofensivo.
- **Precisa de revisão humana:** o teste de vazamento da Parte E do manual (OWNER cria nota PRIVATE, VIEWER não vê) — hoje não há tela de criação de nota; o teste automatizado prova a regra com os dados do seed. Decisões tomadas: conta bloqueada recebe o mesmo erro genérico (não revela o bloqueio); falhas durante o bloqueio não renovam os 15 minutos; bloqueio vencido zera o contador; sessão renovada a cada 1 hora de atividade; `user:create` recusa e-mail fora do `ALLOWED_EMAILS` e não cria MANAGER; a sessão expõe papel e organização em `/api/auth/session` (só para quem está logado). Testado de ponta a ponta por HTTP com contas temporárias (apagadas depois): redirecionamento sem sessão, login OWNER/VIEWER, indicador "Somente leitura", senha errada, kill switch derrubando sessão aberta.
- **A próxima fase assume:** toda página em `src/app/(app)` recebe usuário via `requireUser()`; toda Server Action de escrita começa com `requireOwner()` e grava `writeAudit` na mesma transação; toda leitura de 1:1, feedback, nota ou timeline passa por `src/server/queries` com `visibilityFilter` — o `pnpm test` reprova o contrário.

### P6 — Equipe e cadastro (branch `fase/6-team`)

- **Ficou de fora:** clique na linha não abre o perfil ainda (o perfil é o P7; a edição está no menu da linha e o `MemberDialog` já está pronto para o header do perfil); aviso passageiro (toast) de "salvo" — não há primitivo de toast e criar um seria componente novo: o dialog fecha e a lista atualiza; reativar pessoa inativa (não foi pedido); limiares de atenção ainda são constantes em `src/server/alerts.ts` (viram configuração no P15).
- **Precisa de revisão humana:** a cor dos avatares (regra nova registrada no DESIGN.md); os motivos de atenção e seus limiares (padrões da tabela do P15) — Rafael aparece sinalizado por ter combinado vencendo em até 3 dias, o que é verdadeiro, mas talvez barulhento; para o VIEWER o último 1:1 e o alerta de 1:1 só contam 1:1 compartilhado, então ele pode ver "sem 1:1 há X dias" mesmo havendo 1:1 privado — consequência direta da regra de que VIEWER nunca lê PRIVATE. **O portão de fase não roda enquanto houver bloqueio aberto em BLOCKERS.md** (o do AUTH_SECRET): typecheck, lint e build foram rodados diretamente e passaram. Corrigi na DataTable (primitivo do P1) um defeito de colunas fantasmas em telas médias causado por `colSpan` sobre colunas ocultas.
- **A próxima fase assume:** `getMemberForEdit` e `MemberDialog` prontos para o header do perfil; `memberAttention` disponível para o perfil e para o P15; leituras de pessoa com agregados seguem o padrão de uma consulta em `src/server/queries/members.ts`. Verificado no servidor real com contas temporárias (apagadas): ordem, grupos, filtros pela URL, papéis (VIEWER sem ações), tooltip de atenção, cadastro completo pela interface com máscara de data, erros de validação, estados em 360, 900 e 1440px.

### P7 — Perfil do analista (branch `fase/7-profile`)

- **Ficou de fora:** o conteúdo das abas Timeline (P8), Combinados (P9), 1:1 e feedbacks (P13) e Desenvolvimento (P14) — as rotas existem, são linkáveis e dizem que a tela completa ainda não está disponível; nos formulários, o que os prompts dessas fases pedem além do registro em si: combinados gerados dentro do 1:1 e do feedback e o painel de contexto do 1:1 anterior (P13), escolha de responsável e abertura do combinado de qualquer lugar (P9); edição e exclusão dos registros criados; aviso passageiro de "salvo" (não há toast — o dialog fecha e a tela atualiza; no combinado em sequência aparece uma linha "Combinado criado" dentro do próprio dialog); a checagem dos 5 segundos é sua — eu só posso dizer o que a tela mostra.
- **Decisões tomadas sem perguntar (revise):** os botões do cabeçalho gravam registros de verdade já nesta fase, com o mínimo que o P9 e o P13 descrevem — um botão que abre dialog vazio seria stub; o resumo gerencial é visível para o VIEWER (não tem campo de visibilidade; o editor avisa isso) e não gera linha na timeline; "último 1:1" aparece no cabeçalho como data e no Ritmo como dias com a referência da senioridade — o prompt pede os dois, e a repetição ficou só nessa linha; "próximo acompanhamento" = a próxima revisão marcada no último 1:1 (mesmo vencida) ou o próximo follow-up de feedback, o que vier primeiro, com o atraso em dias; a linha de atenção do P6 entrou no cabeçalho — é o que responde "situação e pendências" em 5 segundos; pessoa desativada abre o perfil só para leitura; prazo de combinado no passado é recusado; a próxima revisão do 1:1 e o follow-up do feedback precisam ser depois da data do registro; anotação de hoje guarda o horário real, retroativa fica ao meio-dia.
- **Corrigido de fases anteriores:** /ui-lab respondia 500 em desenvolvimento desde o P6 (FieldGroup com filho função passado por Server Component) — eu não tinha aberto o /ui-lab com sessão no P6; linhas da timeline de 1:1, feedback, daily e conclusão de combinado eram gravadas à meia-noite UTC e apareciam com a data do dia anterior (seed reaplicado); dialogs abertos por estado não devolviam o foco ao botão de origem ao fechar; testes de arquivos diferentes rodavam em paralelo sobre o mesmo banco (o de /team conta 9 pessoas) — agora em série; breadcrumb no celular mostrava uma barra solta antes do nome.
- **Verificado:** 48 testes (15 novos em `tests/profile.test.ts`: cabeçalho, regra do VIEWER em último 1:1, próximo acompanhamento e últimos registros, combinados por prazo com arrasto, PDIs, mentorias, cada escrita com timeline na mesma visibilidade e auditoria, D17, recusa para VIEWER, pessoa desativada); servidor de produção com contas temporárias (apagadas, junto com tudo o que gravaram): perfis do Henrique, Diego e Priscila em 1440, 1024 e 360px, VIEWER sem ações e sem privados, combinado criado com Ctrl+Enter e com Enter, validação de prazo, resumo salvo com Ctrl+Enter, foco inicial no campo principal e devolvido ao botão com Esc (inclusive vindo de item de menu), clique na linha de /team abrindo o perfil, id inexistente → 404. O portão de fase continua sem rodar por causa do bloqueio do AUTH_SECRET; typecheck, lint e build foram rodados direto.
- **A próxima fase assume:** a aba `/team/[memberId]/timeline` existe e só precisa trocar o `PendingTab` pela timeline; `getMemberTimeline` (P5) já pagina por cursor; `occurredAt` de registros datados por dia está ao meio-dia de São Paulo — formatar como timestamp (`DateStamp` padrão) mostra o dia certo.

### P8 — Timeline (branch `fase/8-timeline`)

- **Ficou de fora:** abrir o registro completo a partir da timeline (não há tela de detalhe de 1:1, feedback ou combinado ainda — P9 e P13); editar ou excluir pela timeline; a busca é por trecho de texto no título e no resumo da linha (`contains`), não full-text em português — isso é do P16; o "Carregar mais" acrescenta páginas no cliente, então recarregar a página volta para a primeira página (os filtros sobrevivem, porque estão na URL).
- **Decisões tomadas sem perguntar (revise):** o que sangra — combinado aberto vencendo (âmbar) ou vencido (laranja/vermelho), revisão do 1:1 mais recente não feita, PDI parado há mais de 45 dias; feedback com follow-up vencido NÃO sangra, porque o modelo não registra se o follow-up foi feito (ficaria vermelho para sempre); marcador sem pendência em `--line-strong`, não em `--line` (sumiria sobre a régua) — registrado no DESIGN.md; compartilhar pede confirmação, tornar privado não (é o sentido seguro); "Compartilhado" aparece também em combinado, daily e PDI, com a explicação de que esses registros não têm visibilidade própria; período padrão "Tudo"; tags gravadas em inglês são traduzidas na tela (ex.: `incident` → ocorrência) e a tag que só repete o tipo some; "Carregar mais" é uma Server Action de leitura — o CLAUDE.md reserva Server Actions para escrita, mas a alternativa seria uma rota de API, que o D8 proíbe.
- **Verificado:** 58 testes (10 novos em `tests/timeline.test.ts`: cursor sem repetir nem perder em 42 eventos, 40 por página, ordem; VIEWER sem privado em todas as páginas de todas as pessoas; filtros de tipo, período e busca; sangria só em pendência real — vencidos da Priscila, PDI do Henrique; combinados gerados com o status atual; alternância muda origem e espelho juntos, com auditoria nos dois sentidos; VIEWER não alterna; combinado não alterna). No servidor de produção com contas temporárias (apagadas, sem deixar registro): timelines do Henrique e da Priscila em 1440 e 360px, cabeçalho de mês grudando em 48px ao rolar, "Carregar mais" (40 → 42), filtro de tipos pela URL, busca indo para a URL, modal de compartilhar, alternância ida e volta pela tela, VIEWER sem privados e sem ações. No /ui-lab (desenvolvimento): os três degraus de sangria e a expansão do resumo. O portão de fase segue sem rodar por causa do AUTH_SECRET; typecheck, lint e build rodados direto.
- **A próxima fase assume:** `getTimelinePage` e `TimelineEvent` prontos para reuso; combinados vinculados já mostram status e prazo — o detalhe do combinado (histórico de checkins) do P9 pode virar o destino do clique no vínculo.

### P9 — Combinados (branch `fase/9-agreements`)

- **Ficou de fora:** editar, cancelar, reagendar ou substituir combinado fora da daily — reagendar e substituir são do P10 (com AgreementCheckin); não há edição de título/prazo nem cancelamento avulso, porque o prompt não pede e mexer no prazo fora da daily esconderia o arrasto; paginação da central (são dezenas por mês); o "cronômetro" de 15 segundos é seu — eu medi o fluxo por teclado automatizado, não com uma pessoa.
- **Decisões tomadas sem perguntar (revise):** atalho global **C** para a criação rápida (fora de campos de texto e sem dialog aberto; não existe para o VIEWER); origem padrão "Gestor" em toda tela exceto /dailies (DAILY); aba padrão "Em aberto"; o prazo "em dia" não ganha selo na tabela (só ruído) — os demais degraus sim; arrasto de 3 ou mais vira selo vermelho "arrastado Nx" já na central, o mesmo sinal que o P10 pede na daily; "Concluídos" conta só DONE (cancelados aparecem em "Todos"); a aba Combinados do perfil passou a funcionar (usa a mesma tabela); prazo no passado continua recusado na criação.
- **Verificado:** 71 testes (13 novos em `tests/agreements.test.ts`: escala de prazo em todos os degraus, abas repartindo e contando certo, ordem por urgência, cada filtro, VIEWER vê combinados, URL inválida, detalhe do Diego em ordem com impeditivo externo e prazo original intacto, conclusão com AGREEMENT_DONE e auditoria, conclusão repetida recusada, resultado opcional, responsável obrigatório). No servidor de produção com contas temporárias (apagadas, junto com os 3 combinados criados): criação só com teclado — C, título, Tab, "D" escolhendo o Diego, Tab, prazo, Enter — são 4 toques além do texto; Ctrl+Enter salvando e reabrindo com o foco no título; conclusão pelo teclado (menu → resultado → Enter) gravando DONE, resultado e AGREEMENT_DONE; filtros pela URL; detalhe do Diego com as 4 revisões; aba do perfil; 1440 e 360px; VIEWER sem botão, sem menu e sem atalho.
- **A próxima fase assume:** `useQuickAgreement()` abre a criação rápida de qualquer componente; `DragIndicator`, `DueCell` e `AgreementStatusCell` (`src/components/agreements/agreements-table.tsx`) prontos para a revisão da daily; o detalhe já mostra os checkins que a daily vai gravar.

### P10 — Dailies com rollover e exportação (branch `fase/10-dailies`)

- **Ficou de fora:** editar ou excluir uma daily já salva; registrar daily de outra data (a tela registra a de hoje); aviso quando já existe daily no dia (é possível registrar duas); feriados no cálculo da próxima daily (só pula sábado e domingo); o cronômetro humano da Parte E — o fluxo foi feito só com teclado por automação, não por uma pessoa digitando.
- **Decisões tomadas sem perguntar (revise):** "membros ativos" = Ativo e Em desligamento (Afastado não aparece); na revisão, combinado sem desfecho escolhido simplesmente não é revisado (não grava checkin); reagendar exige data depois da daily, combinado novo ou substituto aceita a própria data; o substituto herda a prioridade do antigo; presença e bloqueio ficam fora do Tab (Alt+A / Alt+B na nota) para o Tab andar de pessoa em pessoa — os atalhos estão escritos na tela; nota marcada como bloqueio é gravada em `DailyParticipant.blocker` (não em `note`); no WhatsApp, Parcial e Não feito usam ⚠️, Bloqueios vêm só das notas marcadas como bloqueio, e o substituto aparece como "Substituído por" (não se repete em "Combinados de hoje"); a linha DAILY de quem só teve revisão diz "Revisão de N combinados: X feitos, Y parciais"; `whatsapp.ts` continua em `src/server` (local fixado pelo CLAUDE.md) mas é função pura, importada também no cliente; o formulário usa estado próprio + o schema zod compartilhado, sem react-hook-form (lista dinâmica com rascunho).
- **Verificado:** 80 testes (9 novos em `tests/dailies.test.ts`: texto do WhatsApp idêntico ao exemplo do prompt, seções vazias omitidas, marcadores do usuário neutralizados, varredura que só aceita emoji em `whatsapp.ts`; o que entra para revisão; VIEWER recusado; validação sem gravar nada; transação completa com Feito, reagendar com prazo original intacto, substituir, combinado novo, uma linha DAILY por pessoa e nenhuma para presença simples, auditoria; a daily seguinte puxa o que esta criou; combinado já encerrado recusa a daily inteira). No servidor de produção com contas temporárias: **daily inteira só com teclado** — 5 revisões (3 feitas, 2 com impeditivo e reagendamento), notas para 4 pessoas (uma como bloqueio), 3 combinados novos, Ctrl+Enter — salva de primeira, ~37 toques além do texto; banco conferido (status, prazos, prazo original, origens, 6 linhas DAILY); copiar para WhatsApp com clique real, texto lido de volta da área de transferência no formato pedido; rascunho salvo, restaurado e descartado; histórico expandindo; 1440 e 360px (o celular precisou de ajuste: a nota passou para a linha de baixo); VIEWER sem registrar e com copiar. Depois: contas e tudo o que gravaram apagados e seed reaplicado.
- **A próxima fase assume:** checkins com `blockerReasonId` e categoria (D18) já gravados pela daily — base do cumprimento ajustado do P12; `getDailyDetail` e `buildDailyWhatsApp` reaproveitáveis.

### Complementos do P9 e do P10 (commit `dfd061e`, no branch `fase/11-priority-validations`)

- **Feito:** editar combinado (título, detalhes, prioridade) e cancelar com motivo, fora da daily; central com 50 linhas por vez; daily de data passada (`?date=DD-MM-AAAA`) com aviso de registro retroativo; aviso de daily já registrada na data; edição de daily salva (resumo, decisões, presença, notas — timeline refeita); feriados nacionais na próxima daily.
- **Ficou de fora, de propósito:** mudar prazo ou responsável fora da daily (esconderia o arrasto e reescreveria o cumprimento de outra pessoa); editar revisões e combinados criados numa daily salva (já mudaram os combinados); excluir daily; Carnaval, Corpus Christi e feriados estaduais/municipais (não são feriado nacional).

### P11 — Validação de prioridade (branch `fase/11-priority-validations`)

- **Ficou de fora:** telas de relatório (o prompt pede só as queries; estão prontas e testadas); o cronômetro humano dos 10 chamados em menos de 2 minutos — o fluxo foi feito só pelo teclado por automação; a checagem visual do /ui-lab (ganhou a seção, mas o /ui-lab só existe em desenvolvimento e eu verifiquei o servidor de produção); edição de nível de prioridade com cor (`PriorityLevel.color` existe no schema, mas o produto não usa cor de prioridade em lugar nenhum); pessoas inativas no filtro de responsável (só ativas); o aviso passageiro de "registrado" é uma linha de status dentro do formulário, não um toast.
- **Decisões tomadas sem perguntar (revise):**
  - **Colar e reconhecer:** colar a URL com ID reconhecido leva o foco direto ao Responsável, e o campo de ID sai do Tab. Sem reconhecimento, o foco vai para o ID.
  - **Prioridade validada:** não vem preenchida com a do analista. Validar é decisão explícita; pré-preencher faria "Mantida" por omissão.
  - **Devolvida exige motivo:** o banco já exigia desde o P3.
  - **"Outro":** virou o flag `requiresDetail` no motivo (migration nova), em vez de comparar o nome. Configurável e conferido por trigger.
  - **Resumo:** segue o período e a pessoa, nunca o filtro de resultado ou motivo.
  - **Edição de validação:** sem troca de prioridade, mantém resultado e ranks gravados (D14). Com troca, grava os ranks atuais.
  - **Exclusão de validação:** é lógica, com confirmação.
  - **Catálogos:** item em uso não se exclui, só se desativa. Nível novo entra no fim, com rank renumerado. A chave do nível é gerada do nome e não muda.
  - **Atalho C:** não dispara mais com o foco dentro de formulário. Antes, "C" de Crítica num checkbox abria o novo combinado.
  - **Bloco do perfil:** aparece também para pessoa sem validação ("Nenhuma validação nos últimos 90 dias"). "Registrar feedback sobre isto" só aparece com dados e para quem escreve.
- **Corrigido de fases anteriores:** selects do Radix recebiam `undefined` ao limpar e mostravam o valor anterior com o estado vazio — o Ctrl+Enter do combinado (P9) e a linha nova da daily (P10) gravavam ou recusavam diferente do que a tela mostrava; `FieldGroup` escondia a ajuda quando o erro era texto vazio.
- **Verificado:**
  - **Testes:** 105 no total. São 18 novos em `tests/priority-validations.test.ts` e 7 dos complementos.
    - extração do ID pelo padrão;
    - resultado ao vivo;
    - "Outro" barrado no zod e no banco;
    - D14 com reordenação real dos níveis: snapshots, resumos e matriz idênticos antes e depois;
    - D15 sem linha na timeline;
    - exclusão lógica;
    - os quatro resumos batendo com a contagem direta;
    - plano de execução com o índice `(organizationId, validatedAt)`;
    - bloco do Otávio com "Impacto superestimado";
    - CRUD de /settings com nome repetido, item em uso e regex inválida.
  - **Servidor de produção, contas temporárias** (apagadas, junto com o que gravaram; seed reaplicado):
    - 10 chamados validados colando URLs e só com teclado: 6 mantidos, 2 elevados, 1 rebaixado com "Outro" + texto e 1 devolvido. Foram 84 toques no total, 73 s de automação com ~25 s de pausas artificiais. O foco voltou à URL a cada registro.
    - Editar e excluir pela tabela; período de 30 dias com filtro e coluna de data; período personalizado; 360px.
    - Configurações: Alta descida e subida pela tela, com os ranks renumerados; testador de URL na página e no dialog.
    - Perfil do Otávio: 52% · 14 de 27, e a sugestão de contexto que só entra no feedback com clique.
    - VIEWER sem formulário, sem ações e com configurações só leitura.
    - Complementos do P9/P10 na tela.
- **A próxima fase assume:** `summaryByMember` e `memberValidationSummary` prontos para o P12 e o P15; `isBusinessDay` para o alerta "daily não registrada nos últimos 2 dias úteis" (P15); `replaceTimelineEvents`/`syncTimelineContent` para as edições do P13/P14.

### P12 — Cumprimento de combinados (branch `fase/12-adherence`)

- **Ficou de fora:** o critério de aceite visual é seu (eu conferi as telas do Henrique e do Diego por captura, não com seus olhos); combinados de pessoas desligadas não entram na visão de equipe nem na taxa do time (o roster é o de pessoas ativas); feriados não mudam as janelas de 30 dias (são dias corridos); a checagem visual do /ui-lab (seção nova, só existe em desenvolvimento).
- **Decisões tomadas sem perguntar (revise):**
  - **Aberto com prazo original hoje:** fica fora do total até amanhã, porque ainda pode ser cumprido no prazo. Sem isso, a taxa do mês corrente nasceria baixa.
  - **Cancelado:** conta no total e não é cumprido, inclusive o substituído na daily.
  - **Ajustada:** tira só o combinado NÃO cumprido no prazo, e olha o último impeditivo **com motivo**, não o último checkin. O combinado do Diego termina num checkin "Feito" sem motivo, então "último checkin" literal nunca excluiria nada. Tirar também o cumprido no prazo faria a taxa passar de 100%.
  - **Tendência:** sem amostra (5+) nas duas janelas, não há seta, só "amostra pequena para tendência". No seed, isso vale para quase todos, exceto o Henrique: são cerca de 2 combinados por pessoa por mês.
  - **Taxa do time:** ignora quem tem menos de 5 combinados e diz quantas pessoas ficaram fora. O total de combinados inclui todas.
  - **Ordem por taxa:** quem tem amostra pequena vai para o fim.
  - **Período padrão da equipe:** 90 dias.
  - **Visão geral do perfil:** também ganhou um bloco compacto, para a queda aparecer sem clique. O alerta aparece ainda no cabeçalho e na coluna de atenção de /team.
  - **Sugestão de feedback:** traz só números, sem juízo.
- **Verificado:**
  - **Testes:** 117 no total, 12 novos em `tests/adherence.test.ts`.
    - regras puras em todos os casos de borda;
    - Henrique 83% (5 de 6) → 50% (3 de 6), −33 p.p., com alerta na consulta de /team;
    - Diego 67% → 100% ajustada, impeditivos só externos;
    - SQL de /team coerente com as consultas para as 9 pessoas;
    - agregado do time sem amostra pequena;
    - série mensal somando o período;
    - VIEWER com os mesmos números;
    - nenhuma escrita;
    - o teste de consulta única de /team continua passando.
  - **Servidor de produção, contas temporárias (apagadas):**
    - Henrique, visão geral: "Cumprimento no prazo caiu de 83% para 50%" no cabeçalho, sem clique, e o bloco com −33 p.p.
    - Diego, aba Combinados: 67% (6 combinados) ao lado de 100% (4 combinados, amostra pequena), crônico em vermelho com link e só impeditivos externos.
    - Equipe: 1440 e 360px, ordem por taxa, 6 meses, "Registrar feedback" abrindo com o contexto vazio e a sugestão à parte; VIEWER sem a ação.
- **Corrigido do processo de verificação (fora do código do app):** as capturas deixavam processos do Edge sem janela vivos; 340 deles somavam 6,7 GB e derrubaram um build por falta de memória. Foram encerrados só os da verificação, e o script agora encerra os seus ao terminar.
- **A próxima fase assume:** `adherenceDropAlert`, `isDropping`, `getAdherenceTrend` e `getTeamAdherence` prontos para o motor de alertas e o "Ritmo de gestão" do P15.

### P13 — 1:1 e feedbacks (branch `fase/13-records`)

- **Ficou de fora:**
  - editar ou excluir 1:1 e feedback já salvos (o índice abre o registro só para leitura);
  - registrar 1:1 ou feedback direto do /records (continua pelo perfil da pessoa);
  - o cabeçalho do perfil continua considerando só follow-up de feedback futuro, e a timeline continua sem sangrar follow-up de feedback vencido (decisão do P8) — o índice novo mostra o vencido;
  - checagem visual do /ui-lab (seção nova, só em desenvolvimento).
- **Decisões tomadas sem perguntar (revise):**
  - **Painel de contexto:** aberto por padrão (o critério de aceite pede ver sem navegar); dá para ocultar.
  - **"Pendente do 1:1 anterior":** a revisão marcada, desenvolvimento, dificuldades, assuntos e os combinados gerados naquele 1:1. Percepções e conquistas ficam fora, para o painel caber.
  - **Quando um follow-up deixa de ser pendente:** a próxima revisão do 1:1 se encerra com qualquer 1:1 posterior (mesma regra do cabeçalho do perfil). O follow-up de feedback se encerra com um 1:1 ou feedback na data ou depois. O modelo não tem campo "feito"; essa é a leitura que o histórico permite.
  - **Combinados gerados:** só título e prazo; responsável fixo na pessoa; prioridade Normal; até 10 por registro; prazo não pode estar no passado.
  - **Feedback:** aceita mais de um combinado gerado (o prompt diz "combinado gerado"), com o mesmo bloco do 1:1.
  - **Período padrão do índice:** 3 meses.
  - **Detalhe do registro:** painel lateral em vez de página nova.
- **Verificado:**
  - **Testes:** 128 no total, 11 novos em `tests/records.test.ts`.
    - regra do follow-up nos dois tipos;
    - combinados gerados no 1:1 e no feedback (origem, vínculo, D17, timeline, auditoria);
    - linha inválida derrubando o 1:1 inteiro;
    - contexto mostrando o que ficou do anterior;
    - VIEWER sem o 1:1 privado no contexto e no índice, e 1:1 privado não encerrando pendência para ele;
    - Henrique com a revisão vencida no contexto;
    - filtros e ordem.
    - O teste estático de visibilidade cobre as leituras novas, e exigiu o filtro escrito em cada chamada.
  - **Servidor de produção, contas temporárias** (apagadas, junto com o 1:1 e o combinado criados):
    - 1:1 do Henrique abre com o painel trazendo o 1:1 de 05/08, a revisão de 19/08 "provavelmente esquecida", desenvolvimento, dificuldades, combinados em aberto, último feedback e PDI;
    - 1:1 salvo pela tela com combinado gerado, aparecendo no índice com o combinado;
    - /records em 1440 e 360px, filtro de reconhecimento, detalhe lateral, aba do perfil;
    - VIEWER sem nenhum registro privado.
- **A próxima fase assume:** `getOneOnOneContext` mostra o PDI ativo com as ações em aberto; o P14 pode reaproveitar `GeneratedAgreements` e `FollowUpCell`.

### P14 — Desenvolvimento e PDI (branch `fase/14-development`)

- **Ficou de fora:**
  - editar os campos de um PDI ou de uma ação depois de criados, e acrescentar ação a um PDI existente;
  - criar ou encerrar mentoria pela interface (o mapa só lê os vínculos do seed);
  - cadastrar e desativar competências (a matriz usa as competências ativas existentes);
  - avaliar o nível de competência continua em Editar cadastro (P6), sem histórico de níveis — o schema guarda um nível por pessoa × competência;
  - checagem visual do /ui-lab (seção nova, só em desenvolvimento).
- **Precisa de revisão humana:**
  - **Matriz de competências:** o P14 manda não preencher, e o seed do P4 a preenchia (30 linhas de demonstração, que eu tinha posto por conta própria). Removi as linhas e tirei do seed. Sem matriz, as barras não têm marca do esperado e ninguém aparece em prontidão até você preencher em Configurações.
  - **Leitura de "prontidão":** "só para quem tem todas as competências no nível esperado" = da senioridade ATUAL; o rótulo conta as da PRÓXIMA.
  - **Escala da idade do PDI:** âmbar 30, laranja 45 (parado), vermelho 90.
  - **Acompanhamento:** exige uma nota do que mudou.
  - **Status:** concluir e cancelar pedem confirmação; pausar e reativar não.
  - **Timeline:** os pontos fortes/de desenvolvimento não entram nela (decisão do P4).
  - **Critério de aceite:** coberto por teste. Nenhuma lista de pessoas é ordenada por desempenho, e as telas não exibem porcentagem nem score.
- **A próxima fase assume:**
  - `planStaleness` e `STALE_PLAN_DAYS` para o alerta "PDI sem acompanhamento" do P15 (o limiar de 45 já está em `ATTENTION_THRESHOLDS.stalePlanDays`);
  - `getDevelopmentOverview` para "Ritmo de gestão";
  - matriz vazia até o gestor preencher.
- **Verificado:**
  - **Testes:** 139 no total, 11 novos em `tests/development.test.ts`.
    - idade do acompanhamento e prontidão em todos os casos;
    - o seed não preenche a matriz;
    - o PDI do Henrique entre os parados;
    - criar PDI com ações e mentor obrigatório;
    - linha da timeline na data certa;
    - acompanhamento zerando o relógio e indo para a timeline;
    - ação no progresso;
    - conclusão com data e linha;
    - arquivo de pontos;
    - matriz gravando, limpando e auditando, com a prontidão em texto neutro e ordem alfabética;
    - VIEWER sem escrita;
    - varredura de porcentagem/score nas telas.
  - **Servidor de produção, contas temporárias (apagadas):**
    - aba do Henrique com PDI parado há 84 dias em laranja;
    - /development com contagens, parados, tabela, mentorias e prontidão avisando da matriz vazia;
    - matriz em Configurações;
    - dialog de novo PDI;
    - acompanhamento abrindo com o foco na nota;
    - 1440 e 360px;
    - VIEWER sem ações.

### P15 — Hoje e motor de alertas (branch `fase/15-today`, inclui complementos das fases anteriores)

- **Ficou de fora:**
  - o critério de aceite humano ("às 9h, em 10 segundos eu sei o que fazer") — conferi por captura em 1440, 1024 e 360px, não com seus olhos;
  - "Registrar acompanhamento" do PDI direto da home (a ação leva à aba Desenvolvimento da pessoa);
  - ação de "resolver" que não seja abrir o registro ou o formulário (concluir combinado continua no detalhe/central);
  - limiares por pessoa; a escala de cor do PDI (30/45/90) e a escala de prazo (vencendo em 3 dias) continuam fixas — só os disparos são configuráveis;
  - complementos que continuam fora: excluir daily, editar revisões de daily, mudar prazo/responsável fora da daily (decisões dos complementos do P9/P10), histórico de níveis de competência, telas de relatório de validação;
  - checagem visual do /ui-lab (seções novas: Hoje, Toast, ações de registro, mentorias, contadores na sidebar — só em desenvolvimento).
- **Decisões tomadas sem perguntar (revise):**
  - **Granularidade:** vencido é uma linha por combinado (ação "Abrir combinado"); vencendo é agrupado por pessoa (seria ruído); combinado vencido e crônico vira uma linha só.
  - **Silêncio gerencial** cobre o "sem 1:1" da mesma pessoa (não repete). "Qualquer registro" = qualquer linha da timeline visível a quem consulta (inclui combinado e daily).
  - **Afastado** não entra em "sem 1:1" nem em silêncio (na home; a coluna de /team continua como era).
  - **Daily:** dias úteis entre a última daily e hoje, sem contar hoje (às 9h a daily do dia ainda não aconteceu); feriados nacionais contam como não úteis.
  - **Prontidão** dispara só quando a pessoa já atende a TODAS as competências esperadas da próxima senioridade (texto do P15), é informativa, vai para o fim e não conta nos contadores. Com a matriz vazia, nunca aparece.
  - **Contadores:** contam o que pede ação (sem "vencendo" e sem informativo); Equipe conta pessoas, não alertas; Validação de prioridade não tem contador (não há alerta dela).
  - **Limiares:** tabela chave/valor (`AlertThreshold`), com faixas mínimas e máximas; gravar o próprio padrão não cria linha.
  - **Home do VIEWER:** mesma lista, só com as ações que são link (sem formulários).
  - **Complementos:** editar 1:1/feedback não refaz os combinados gerados; excluir é lógico e mantém os combinados; editar anotação no mesmo dia mantém o instante original; reativar exige motivo e vira evento de carreira; mentoria não entra na timeline (decisão do P4); competência em uso (nível, PDI, matriz ou mentoria) não se exclui, só se desativa.
- **Corrigido / ajustado:**
  - teste de plano de execução do P11: com ~200 linhas o Postgres às vezes prefere o índice do motivo num merge join (escolha de custo); o teste agora desliga merge join na própria transação para verificar o índice do período.
  - teste de /team "uma consulta só": a listagem recebe os limiares já carregados (no app vêm do layout, em cache por requisição).
  - seed reaplicado em 03/10/2026 (as janelas de 30 dias do Henrique andam com a data).
- **A próxima fase assume:** `getAlerts` e `TodayPanel` prontos; a busca global (P16) pode usar `searchRecords` (visibilidade já aplicada) e a barra de busca inerte da context-bar; `useThresholds` disponível no cliente.
- **Verificado:**
  - **Testes:** 165 no total. Novos: `tests/alerts.test.ts` (17: regra pura em todos os tipos, ordem, agrupamentos, dias úteis, amostra, prontidão, limiares no banco com faixa/padrão/auditoria e efeito em /team, seed lido pelo motor, VIEWER sem vazamento, no máximo duas superfícies delimitadas, nada persistido) e `tests/complements.test.ts` (9).
  - **Servidor de produção, contas temporárias (apagadas):** home em 1440/1024/360 com a sidebar aberta e recolhida, 1:1 aberto pela linha do alerta, "Com quem?" do feedback, limiares, VIEWER sem formulários, editar 1:1 e confirmar exclusão pela timeline (sem excluir).

### P16 — Busca global (branch `fase/16-search`)

- **Ficou de fora:**
  - busca dentro de dailies além das notas por pessoa (o texto de resumo e decisões da daily não está na timeline; só as linhas por pessoa entram em "outros registros");
  - busca em validações de prioridade, PDIs pela tabela própria (entram pelas linhas da timeline), pontos fortes/de desenvolvimento e mudanças de cadastro;
  - anotação não tem tela própria: o resultado leva à timeline da pessoa filtrada pelo título;
  - o cronômetro humano do critério de aceite: medido por teste (`searchAll` no servidor, conexão já aberta) e visto no subtítulo de /search (141 ms na verificação), não com uma pessoa.
- **Decisões tomadas sem perguntar (revise):**
  - **Sem acento:** extensão `unaccent` com wrapper imutável (exigência de coluna gerada). Se o banco de produção não permitir a extensão, a migration falha — no Neon funcionou.
  - **Prefixo:** cada palavra digitada vale como início de palavra ("otav" acha "Otávio"), e todas são exigidas.
  - **Timeline na busca:** 1:1, feedback, anotação e combinado vêm das tabelas (texto inteiro); a timeline só entra para os tipos sem tabela na busca, para não repetir resultado.
  - **Pessoa na digitação:** as ações de registro aparecem para a primeira pessoa encontrada; as demais só "abrir perfil".
  - **⌘K** funciona também com o foco num campo (convenção de paleta); o atalho C continua bloqueado em campos.
- **A próxima fase assume:** `searchAll` e a paleta prontos; o P18 deve conferir o `unaccent` no banco de produção e o tempo da busca na Vercel (região gru1).
- **Verificado:**
  - **Testes:** 174 no total, 10 novos em `tests/search.test.ts` (consulta sem operador, destaque sem acento e por radical, filtros da URL, os cinco índices GIN e o plano usando o índice, critério de aceite com um termo só do corpo de um feedback de ~4 meses em menos de 300 ms, VIEWER sem PRIVATE nem na contagem, registro novo encontrável na hora e sem acento, pessoas sem acento, nenhum serviço externo). A varredura estática de visibilidade cobre o SQL novo.
  - **Servidor de produção, contas temporárias (apagadas):** paleta vazia, com pessoa no contexto, digitando nome ("otav") e termo ("relatorio atlas"), "beatriz" ↓ Enter abrindo o 1:1 com ela, "Dar feedback" → "com quem?", celular (360px) pelo ícone, VIEWER sem ações de registro; /search com grupos, 360px, VIEWER sem o feedback privado, e o clique no resultado abrindo o feedback no painel de /records.

### P17 — Arquitetura de score (branch `fase/17-score`)

- **Ficou de fora (de propósito, D5):** qualquer fórmula, cálculo, normalização implementada, número de desempenho, importação ou integração com helpdesk. O contrato da importação futura está no CLAUDE.md ("Contrato de importação de métricas") e os tipos em `src/server/score.ts`. Também ficou de fora a checagem visual do /ui-lab (nenhum primitivo novo nesta fase).
- **Decisões tomadas sem perguntar (revise):**
  - **Métricas do seed:** as nove do prompt, com chaves em inglês (`ticket_volume`, `sla_first_response`, `sla_resolution`, `csat`, `return_72h`, `recurrence_rate`, `reopen_rate`, `backlog`, `handle_time`), unidades (%, nota, min, chamados) e direções que eu escolhi — **volume ficou "maior é melhor"**, e retorno em 72h, recorrência, reabertura e backlog "menor é melhor". As duas métricas antigas do seed sem par (tempo de primeira resposta e chamados resolvidos) saíram.
  - **Chave da métrica** não muda depois de criada (é o que casa a importação).
  - **Pesos em %**, com uma casa decimal; ativar exige soma exata de 100 e ao menos uma métrica.
  - **Versionamento:** uma versão ativa por nome (ativar outra desativa a anterior); versão ativa ou com resultado não se edita nem se exclui; rascunho inativo sem resultado edita e exclui; "Nova versão" copia composição e notas.
  - **Métrica desativada** não entra em composição nova, mas continua nas versões que já a tinham (marcada).
  - **Contrato (documentado, não implementado):** correspondência pelo e-mail do `TeamMember`, período = mês civil fechado, reimportação do mesmo mês substitui, `sampleSize` obrigatório (0 = sem amostra, valor não exibido).
  - **Subtítulo de Configurações** passou a ser geral ("Catálogos, limiares e cadastros...").
- **Critério de aceite:** nenhuma tela de pessoa mudou — `git diff master` vazio em `/team`, componentes de pessoa, timeline, desenvolvimento, registros e as queries do perfil; um teste estático reprova qualquer tela de pessoa que leia métrica ou score.
- **A próxima fase assume:** seed com as nove métricas (reaplicado em 03/10/2026); nenhum `ScoreDefinition` no seed.
- **Verificado:**
  - **Testes:** 181 no total, 7 novos em `tests/score.test.ts` (seed com as nove e nada calculado; soma de pesos sem erro de ponto flutuante; chave válida, única e fixa; métrica em uso não se exclui; ciclo completo de versões com 100%, trava, cópia, uma ativa por nome, exclusão só de rascunho e auditoria; `score.ts` só com tipos; nenhum código grava resultado; nenhuma tela de pessoa lê métrica/score).
  - **Servidor de produção, contas temporárias e definição de exemplo (apagadas):** /settings/metrics com a chave travada na edição, lista de definições, versão ativa travada e rascunho com 80% (ativar desabilitado), dialog de incluir métrica, pré-visualização em 1440 e 360px, VIEWER sem nenhuma ação.

### P18 — Mobile, acessibilidade e deploy (branch `fase/18-deploy`)

- **Ficou de fora / depende de você:**
  - **o deploy em si**: criar o projeto na Vercel, cadastrar as variáveis e ligar a Deployment Protection (Vercel Authentication, Standard Protection) — registrado em BLOCKERS.md com o passo a passo; o repositório está pronto (`vercel.json`, `.env.example`, README);
  - **"utilizável de ponta a ponta num iPhone"**: verifiquei em 360/390/768px por captura e o Lighthouse emula celular, mas não usei um iPhone real (atalho, teclado, Safari);
  - **backup executado**: o `pg_dump` não está instalado nesta máquina; o script foi testado só no caminho de erro (mensagem clara). Precisa do cliente PostgreSQL 18+;
  - **navegação por teclado completa**: as fases anteriores verificaram os fluxos principais por teclado; nesta fase não refiz o percurso tela a tela — o Lighthouse/axe não acusou nada, mas não substitui o teste humano;
  - tabelas de matriz (competências) e composição de score continuam com rolagem horizontal própria no celular (são grades, não DataTable).
- **Decisões tomadas sem perguntar (revise):**
  - **`--ink-tertiary`** não mudou de cor (escurecer a ponto de passar AA o deixaria quase igual ao secundário); passou a ser só placeholder nativo, desabilitado e ícone. Texto informativo, "—" e placeholder de select usam `--ink-secondary`. DESIGN.md e a skill foram atualizados.
  - **Lista empilhada:** título + 2 campos à vista (ex.: combinados → prazo e responsável; equipe → último 1:1 e combinados abertos; cumprimento → total e taxa, nunca a taxa sem o total); o resto em "Mais detalhes".
  - **44px só em ponteiro grosso** (celular/tablet): o desktop mantém a densidade.
  - **Timeline no celular:** data DD/MM no topo da entrada (o mês já está no cabeçalho), calha de 24px só com a régua e o traço de pendência.
  - **Gravidade em texto** na coluna de atenção da equipe ("Vencido", "Atenção forte", "Atenção") ao lado do ponto; na home, a gravidade já vem na frase e na posição.
  - **Ícone:** "P" branco sobre `--accent`, sem fonte (desenhado em SVG).
  - **Previews**: recomendado usar o branch `dev` do Neon, para um preview nunca rodar migration no banco de produção.
  - **Lighthouse** rodado via `npx lighthouse@12` (ferramenta temporária, não entrou nas dependências).
- **Corrigido:**
  - título de combinado/PDI/cumprimento como link inline passava da largura no celular e cobria o menu da linha (agora bloco truncado);
  - lista empilhada vazia era `role="list"` sem itens; cabeçalho de mês h3 sem h2; `aria-label` do botão de visibilidade divergia do texto; abas de período com `aria-controls` para painel inexistente; link no meio de texto só pela cor;
  - aba ativa fora da área visível nas abas que rolam (Configurações no celular); tabela de limiares com rolagem horizontal no celular.
- **Verificado:**
  - **Testes:** 209 no total, 28 novos em `tests/a11y.test.ts` (20 pares de contraste AA, terciário só onde é isento, reduced-motion, 44px em ponteiro grosso, foco nunca removido sem substituto, manifest sem service worker, manifest/ícones fora do login, /ui-lab 404 em produção, `lang="pt-BR"`).
  - **Lighthouse, acessibilidade (mobile):** 100 em Hoje, Equipe, perfil, timeline, combinados, nova daily, validação, registros, desenvolvimento (time e pessoa), busca, limiares, métricas, score e login; VIEWER: Hoje e timeline 100.
  - **Servidor de produção, contas temporárias (apagadas):** 14 telas em 360px, equipe e combinados em 768px, equipe e limiares em 390px, manifest/ícones respondendo sem login, `/ui-lab` 404 autenticado.

### C1 — Prazo padrão do combinado (branch `fase/c1-prazo-combinado`)

- Combinado da daily nasce com a data da daily (Seção 3 e reagendar/substituir na Seção 1); criação rápida nasce com hoje. Prazo hoje é neutro e fica fora do alerta "vencendo" e dos próximos acompanhamentos da home; WhatsApp omite o prazo igual à data da daily. Nenhum dado alterado.
- Testes que leem o banco não rodaram (o banco é o de produção, com o beta); `tests/due-default.test.ts` cobre as regras sem banco.

### P19 — Central de atendimento (branch `fase/19-centrals`)

- **Ficou de fora / depende de você:**
  - **a migration `20261008120000_centrals` NÃO foi aplicada**: o único banco configurado é o de produção (beta em uso). Ela é aditiva (tabela nova, duas colunas nulas, índices, sem backfill) e roda com `pnpm db:migrate:deploy` ou no build da Vercel — precisa da sua autorização. Sem ela, as telas que leem central falham;
  - **nenhuma verificação no navegador**: sem a migration aplicada e sem banco de teste, não abri as telas. O critério de aceite ("central alfa" com "Central Alfa" cadastrada não duplica) está coberto pela regra pura (slug) e pelo servidor (busca por `organizationId_slug` antes de criar + unique no banco), não por clique;
  - a central não aparece no detalhe do combinado, na timeline, na busca nem na paleta (não pedido);
  - editar combinado não troca a central (a edição continua só título, detalhes e prioridade).
- **Decisões tomadas sem perguntar (revise):**
  - **CRUD pelo catálogo genérico** de /settings (kind `central`): editar, desativar (isActive = false + deletedAt), reativar e excluir só sem uso. Renomear recalcula o slug e recusa se colidir com outra central (inclusive desativada).
  - **Central desativada digitada no formulário**: o combobox não reativa; avisa "A central X está desativada. Reative em Configurações → Centrais".
  - **Texto digitado sem escolher**: ao sair do campo, se o nome normalizado for o de uma central ativa, ela é escolhida (com o aviso "usando a central já cadastrada"); se não, o texto fica com o aviso "Central não gravada" — não cria sozinho.
  - **Filtro de central** em /agreements e /priority-validations com "Sem central informada" e as desativadas marcadas; em /priority-validations o filtro de central também recorta o resumo (como a pessoa).
  - **Arquivo** `src/components/ui/CentralCombobox.tsx` em PascalCase, como pedido, embora os demais primitivos sejam kebab-case.
  - **Importação**: cabeçalho "nome"/"central" na primeira linha é ignorado; nome repetido dentro da própria colagem conta como "já existe"; até 2.000 linhas por vez.
- **Verificado:** typecheck, lint e build; 42 testes sem banco (`tests/centrals.test.ts`, `tests/due-default.test.ts`, `tests/a11y.test.ts`). Os testes que leem o banco não rodaram.

### P20 — Devolução do desenvolvimento (branch `fase/20-dev-returns`, a partir do P19 não comitado)

- **Ficou de fora / depende de você:**
  - **as migrations do P19 e do P20 NÃO foram aplicadas** (o único banco é o de produção, com o beta). As duas são aditivas; rodam com `pnpm db:migrate:deploy` ou no build da Vercel. Sem elas, o app não sobe neste computador (o cliente do Prisma já tem as tabelas novas);
  - **nenhuma verificação no navegador e nenhum teste com banco**; o critério de aceite (colar a URL de um chamado validado traz o contexto e grava `priorityValidationId`) está implementado (`getTicketContext` + `latestValidationFor`) mas não foi exercitado;
  - `getTeamDevReturns` existe sem tela (como os resumos do P11);
  - os limiares dos dois alertas ficam no código (`DEV_RETURN_ALERTS`), não em /settings/thresholds.
- **Decisões tomadas sem perguntar (revise):**
  - **`requiresDetail` em `DevReturnReason`** (campo além da lista do prompt): marca o "Outro" sem depender do texto do rótulo, como em `ReclassificationReason`; trigger no banco igual ao do P11.
  - **Catálogo inicial pela migration**, em cada organização existente — o banco de produção não roda seed.
  - **Período padrão 30 dias** em /dev-returns (devolução chega dias depois; "hoje" quase sempre viria vazio).
  - **Resumo recortado por período, analista e central**; motivo, categoria e "apenas em aberto" recortam só a tabela (filtrar por Processo faria o resumo dizer sempre 0 atribuíveis).
  - **Categoria na tabela como selo**: Analista em âmbar, Processo neutro. É sinal de "treinável", não de gravidade — revise se o âmbar pesa demais.
  - **Seção "Prioridade alterada e devolvido"** abaixo da tabela de /dev-returns (a query `getReturnOverlap` pedia uma superfície; não havia uma definida).
  - **Analista pré-selecionado** só se ainda estiver vazio e se a pessoa da validação estiver ativa; central só se ativa.
  - **Afastado (ON_LEAVE)** pode receber devolução registrada (chamado devolvido depois do afastamento); o select do formulário mostra só ativos e em desligamento, como na validação.
- **Verificado:** typecheck, lint e build; testes sem banco: `tests/dev-returns.test.ts` (10), `tests/centrals.test.ts`, `tests/due-default.test.ts`, `tests/a11y.test.ts`. Os testes com banco não rodaram (`tests/alerts.test.ts` e `tests/priority-validations.test.ts` foram ajustados aos tipos novos).

### P21 — Em observação (branch `fase/21-watch`, a partir do P20 não comitado)

- **Ficou de fora / depende de você:**
  - **as migrations do P19, P20 e P21 NÃO foram aplicadas**; o app neste computador não sobe até elas rodarem (`pnpm db:migrate:deploy`);
  - **nenhuma verificação no navegador e nenhum teste com banco**: os critérios de aceite estão cobertos por regra pura e leitura de código (`tests/watch.test.ts`), não por clique;
  - o alternador de visibilidade fica no painel de /watch; na timeline, a linha WATCH mostra o cadeado como as outras, sem o botão de alternar;
  - o vínculo de validação e devolução leva à lista (sem âncora para a linha);
  - nas linhas da Seção 1 e 3 da daily o ícone fica fora do Tab, sem atalho de teclado (só a nota tem Alt+O).
- **Decisões tomadas sem perguntar (revise):**
  - **Cadências na tabela `AlertThreshold`** (chave/valor que já existia), editadas em /settings/thresholds — não há tabela "Settings" única.
  - **Formulário ainda não salvo**: a observação é criada na hora (um clique, sem sair) com a pessoa e ganha o vínculo (dailyId, agreementId, oneOnOneId, feedbackId) quando o formulário é salvo; se o formulário nunca for salvo, a observação fica só com a pessoa.
  - **Revisão da Seção 1** liga ao combinado (agreementId), não à daily.
  - **Grau inicial**: fogo alto na nota e na revisão Parcial/Não feito da daily; médio no resto.
  - **Esfriar/Esquentar conta como revisão** (atualiza `lastReviewedAt` e `reviewCount`, além de `heatChangedAt`).
  - **Um alerta por observação na home**, o mais forte: fogo alto frio > sem revisão > parada.
  - **Contador da sidebar** = observações em fogo alto ativas (não os alertas).
  - **Observação sem pessoa** aparece na home como alerta do time (como a daily).
- **Verificado:** typecheck, lint e build; testes sem banco: `tests/watch.test.ts` (14), `tests/dev-returns.test.ts`, `tests/centrals.test.ts`, `tests/due-default.test.ts`, `tests/a11y.test.ts` — 66 no total. `tests/visibility.test.ts` (estático + banco) passou a cobrir WatchItem, mas não rodou (lê o banco).

### C2 — PDF da daily (08/10/2026, branch `fase/21-watch`, depois do commit 682017a)

- **Ficou de fora:** PDF do formulário ainda não salvo (só da daily registrada); o PDF não tem link clicável para o chamado ou o registro; nenhuma verificação no navegador do download real (o arquivo foi gerado e conferido pelo teste e por leitura do PDF de exemplo).
- **Decisões tomadas (revise):** observação já presente na daily entra no bloco final só com o título e "aparece acima"; fogo baixo sai sem contexto; contexto cortado em 180 caracteres; quem esteve presente sem nenhum registro aparece numa linha só ("Sem anotação nesta daily"); título "Daily do Suporte — DD/MM/AAAA".
- **Verificado:** typecheck, lint, build; `tests/daily-report.test.ts` (6) e `tests/watch.test.ts`.

### P22 — Multi-tenancy no banco e no acesso (branch `fase/22-multi-team`)

- **Ficou de fora / depende de você:**
  - **migrations não aplicadas em produção.** Ensaio em 09/10/2026 no branch Neon `migracao-multi-time` (cópia dos dados reais): as três aplicaram, `db:verify-teams` sem nenhum `teamId` nulo, 1 time com os 3 módulos, o OWNER com MANAGER + `isPlatformAdmin`. Depois o branch foi limpo dos dados reais e virou o banco de teste (só o seed): `pnpm test` 273/273, inclusive `tests/isolation.test.ts` inteira.
  - O ensaio achou e corrigiu: `catalogUsage` ecoava id de outro time com contagem 0 (agora só devolve ids com uso no time); o gate de módulo do catálogo rodava depois da validação do zod (agora antes). Os testes antigos de VIEWER passaram a esperar `ForbiddenError` do núcleo.
  - tela de seleção e troca de time (P23), criação de times e concessão de acesso pela interface (P24), visão consolidada (proibida, D35), remoção de `User.role`.
  - com um único time, o comportamento deve ser o de antes; isso não foi conferido no navegador.
- **Decisões tomadas sem perguntar (revise):**
  - `AlertThreshold` também ganhou `teamId` (chave `(teamId, key)`): é tabela de apoio e D31 não deixa exceção, mas o prompt não a listava.
  - Unicidades de catálogo (senioridade, central, competência, nível de prioridade, responsabilidade, métrica, score) passaram de organização para time na migration C — sem isso o segundo time não conseguiria ter "Pleno" nem a própria central.
  - `grantedByUserId`, `changedByUserId` e `createdByUserId` são opcionais: nulo = feito pela migration (não inventar autor). `Team.createdAt` do time existente fica com o instante da migration. `AuditLog.teamId` histórico fica nulo (login não tem time).
  - Server Actions montam o contexto (`requireWriteContext`/`requireTeamContext`); queries e núcleos o recebem. Os núcleos também chamam `requireManager` (defesa em profundidade e o que o teste exercita, já que Server Action exige requisição do Next).
  - Cookie de time sem acesso com o usuário tendo um único time: resolve para o time dele (seção 7 do prompt), em vez de lançar (seção 4). Com mais de um time, lança.
  - Rota de módulo desligado responde 404 (`notFound`), não erro 500; query e núcleo lançam `ModuleDisabledError`.
  - Sessão/JWT deixaram de carregar `role`. `pnpm user:create` concede TeamAccess (gestor = MANAGER, leitura = VIEWER) para a conta nova entrar; o provisionamento completo é o P24.
  - `pnpm test` passou a usar `.env.test`: os testes com banco nunca mais apontam para produção.
- **Verificado:** typecheck, lint e build; parte estrutural de `tests/isolation.test.ts` (7 testes). Migrations A e C geradas por `prisma migrate diff`; B escrita à mão (bloco DO com as falhas explícitas). Produção conferida só com leitura antes de escrever a B: 1 organização, 1 time, 1 usuário OWNER, migrations do P19–P21 aplicadas.

