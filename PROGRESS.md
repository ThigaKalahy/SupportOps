# Progresso

| Fase | Status | Commit | Data |
|------|--------|--------|------|
| P0  Fundação documental        | concluída | | |
| P1  Design system              | concluída — aguarda checagem visual | 94e0273 | 01/10/2026 |
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

### P1 — Design system (branch `fase/1-design-system`)

- **Ficou de fora:** modo escuro (decidido: fora do MVP, registrado no DESIGN.md); limiares da escala de idade (`ageSeverity` exige limiares por módulo — cada fase informa os seus, ex.: 45 dias no P14); verificação no navegador — /ui-lab foi validado só por HTTP 200, CSS compilado e varredura do código, sem olhar a tela nem o console de hidratação.
- **Ajustes pós-fase (aprovados pelo Thiago):** `--attention` #A8730E → #94650C e `--calm` #4B7A5A → #487756 para passar AA; token novo `--attention-strong` #9E4F14 / wash #FAEEE4 para o degrau laranja (prop `strong` em StatusPill e SeverityDot); `--ink-tertiary` restrito a placeholder, desabilitado e marcador de ausência; exemplo do BLOCKERS.md recuado para não disparar o phase-gate; `jq` 1.8.2 já instalado — hooks passam a valer após reabrir o VS Code.
- **Precisa de revisão humana:** a checagem da Parte E em `pnpm dev` → /ui-lab, incluindo os tons novos de âmbar, laranja e verde; as decisões tomadas sem pedir — subset `latin` junto com `latin-ext` (só `latin-ext` jogaria ASCII para a fonte do sistema), outline de foco deslocado para dentro (`-2px`) em linhas de tabela e no campo da paleta para não ser cortado, tooltip com 400ms de atraso, polegar da ScrollArea com `rounded-full` (regra global de barra de rolagem), SeverityDot desenhado como círculo SVG em vez de `rounded-full`.
- **A próxima fase assume:** primitivos em `src/components/ui/` (consultar /ui-lab antes de criar qualquer coisa); tokens só via classes do tema (`bg-canvas`, `text-ink-secondary`, `bg-overdue-wash`, `max-w-page`...); texto visível só via `src/lib/labels.ts`; datas via `src/lib/dates.ts` distinguindo timestamp de data de negócio; `/` ainda responde 404 — o P2 cria `src/app/(app)/page.tsx`.
