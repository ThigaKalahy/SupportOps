# DESIGN.md — Sistema visual do Prontuário

Este documento é a fonte da verdade visual do projeto. Qualquer trabalho de UI segue o que está aqui e em [.claude/skills/ui-prontuario/SKILL.md](.claude/skills/ui-prontuario/SKILL.md). Em caso de dúvida entre um instinto genérico de "boa UI" e uma regra deste arquivo, a regra vence.

## Tese

O produto é um **prontuário**, não uma revista nem um dashboard. O vocabulário visual vem do registro clínico e do livro-razão: entrada datada, calha de margem, régua temporal, escala de severidade. Cada escolha abaixo existe para sustentar essa metáfora.

Deliberadamente **não** usamos o creme quente `#F4F1EA` + serifa editorial + acento terracota. Essa combinação virou o default de interface gerada por IA em 2025–2026 — é a "cara de vibecoding" que este projeto evita. A direção é neutro frio, onde âmbar e vermelho de severidade assentam melhor.

## Tokens

```
--canvas:          #FBFBFC   fundo da aplicação
--surface:         #FFFFFF   painéis, linhas de tabela
--surface-sunken:  #F4F5F7   hover de linha, cabeçalho de tabela, estado vazio
--ink:             #16181D   texto primário (nunca #000)
--ink-secondary:   #5C6270   rótulos, metadados
--ink-tertiary:    #8A909E   placeholder, texto desabilitado, marcador de ausência (—). Nunca texto que precise ser lido (contraste 3,2:1)
--line:            #E4E6EB   toda borda e divisor — 1px
--line-strong:     #CDD1D9   separador de seção, foco
--accent:          #2C4A7C   azul-tinta. Ação primária e seleção. Único acento não semântico
--accent-wash:     #EDF1F6   fundo de linha selecionada
```

### Severidade

A cor comunica **apenas** estado e prioridade — nunca decora.

```
--calm:              #487756  /  wash #EDF3EF   concluído, em dia
--attention:         #94650C  /  wash #FBF3E2   vencendo, atenção
--attention-strong:  #9E4F14  /  wash #FAEEE4   atenção forte (degrau "laranja")
--overdue:           #A33A32  /  wash #FAECEA   vencido, crítico
--neutral:           #5C6270  /  wash #F4F5F7   aberto, sem prazo
```

Escala graduada de idade (mesma lógica de backlog): neutro → âmbar → laranja → vermelho, conforme o registro envelhece sem resolução. Implementada em `src/lib/severity.ts`. O laranja não é uma quinta severidade: é `attention` com `strong`, pintado com `--attention-strong`.

Contraste: toda cor forte de severidade passa AA (≥ 4,5:1) sobre o próprio wash, sobre `--surface` e sobre `--surface-sunken`. Revisão de 01/10/2026: `--calm` era `#4B7A5A` (4,41:1) e `--attention` era `#A8730E` (3,71:1); ambos foram escurecidos mantendo o tom. Qualquer token novo de texto passa pela mesma checagem antes de entrar aqui.

### Tema escuro

Fora do MVP. Não há tokens escuros definidos, e não se inventa paleta escura por conta própria — seria deriva visual. Os tokens vivem em `:root`, então um tema escuro futuro entra como um bloco de redefinição dos mesmos nomes, sem tocar em componente.

## Tipografia

- **IBM Plex Sans** — toda a interface. Desenhada para documentação técnica e registro: tem personalidade sem virar editorial, e não é Inter.
- **IBM Plex Mono** — datas, prazos, contadores, chaves, rótulos de tipo de registro. É o que faz a timeline ler como livro-razão.
- Sem serifa em lugar nenhum.
- `font-variant-numeric: tabular-nums` global em números.

### Escala tipográfica

`11 / 12 / 13 / 15 / 18 / 22 / 28` (px). Corpo de UI a 13px, `line-height` 1.5 — densidade de gestão exige isso.

| Tamanho | Uso |
|---|---|
| 11 | Rótulos mono uppercase, metadados mínimos |
| 12 | Texto auxiliar, legendas |
| 13 | Corpo de UI padrão, tabelas |
| 15 | Texto de destaque dentro de conteúdo, subtítulos |
| 18 | Título de seção |
| 22 | Título de página |
| 28 | Número/valor hero (uso raro, ex.: contadores de alerta) |

Sentence case em tudo. Uppercase apenas em rótulos mono de 11px com `letter-spacing: 0.06em`.

## Escala de espaçamento

Base 4px, progressão `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Densidade de gestão prefere os passos menores (4–16) para espaçamento interno de componente; os passos maiores (24–64) só entre blocos e seções, nunca dentro de uma linha de tabela ou de um item de lista.

## Regras de densidade

- Altura de linha de tabela: 40px. Modo compacto opcional: 32px.
- Raio: 4px em controles, 6px em contêineres. `rounded-full` só em avatar.
- Sombra: zero em cards. `0 1px 2px rgba(16,18,24,0.04)` apenas em popover, dropdown e dialog.
- Largura: contêiner fluido até 1600px.
- Sem emoji na UI. Sem gradiente. Sem glow. Sem ícone acima de 20px (padrão: Lucide, stroke 1.5, 16px). Sem gráfico decorativo.

## Hover e seleção

- Hover de linha: `--surface-sunken`.
- Linha selecionada: `--accent-wash` de fundo + barra `inset 2px` de `--accent` na borda esquerda (inset, para não deslocar conteúdo).
- Foco visível: `outline: 2px solid --accent; outline-offset: 1px`. Nunca remover, nunca substituir por apenas mudança de cor de fundo.

## Movimento

- Duração: 120–160ms. Só anima `opacity` e `transform` — nunca `height`, `width` ou propriedades de layout.
- **Nenhum scroll-reveal, nenhum stagger de entrada.** A mesma tela é reaberta dezenas de vezes por dia; animação de entrada vira ruído, não deleite.
- `prefers-reduced-motion` sempre respeitado — quando ativo, remover a transição, não só encurtá-la.

## Layout

- **Desktop (≥1024px):** sidebar fixa de 232px, colapsável para 56px. Sem navbar superior grande — apenas barra de contexto de 48px com breadcrumb, busca e ação primária da tela.
- **Tablet/mobile:** sidebar vira drawer. Tabelas viram lista de linhas empilhadas (não scroll horizontal). Ações secundárias entram em menu de overflow.
- Sidebar com 6 itens + configurações: Hoje · Equipe · Combinados · Dailies · Registros (1:1 e feedbacks) · Desenvolvimento · ⌄ Configurações.

## Elemento assinatura: a calha temporal

A timeline é o único momento de ousadia visual do produto — todo o resto do sistema fica quieto. Medidas:

- **Calha:** 96px de largura total, da borda esquerda da coluna até o início do conteúdo do evento. É onde vivem a régua, a data e o marcador.
- **Régua:** linha vertical de 1px, centralizada na calha, na cor `--line`.
- **Marcador:** 7px de diâmetro, círculo sobre a régua, alinhado ao topo de cada evento.
- **Sangria de severidade:** quando o item está vencido ou exige ação, um traço de 4px de largura em `--attention`, `--attention-strong` ou `--overdue` (conforme o degrau da escala) sangra para dentro da calha a partir da régua, no trecho correspondente àquele evento — não é um ponto ou ícone isolado, é a própria calha que ganha cor no trecho.

Composição:

- Data de cada evento em **IBM Plex Mono**, alinhada à margem esquerda da calha.
- Tipo do registro como etiqueta mono de 11px, uppercase, `letter-spacing: 0.06em` (ex.: `FEEDBACK`, `1:1`, `COMBINADO`).
- Eventos sem pendência não perturbam a calha: régua e marcador permanecem em `--line`, sem sangria, no trecho correspondente.

Esse componente é a referência de "o que é permitido ousar" no produto. Nenhum outro componente deve competir com ele em intensidade visual.
