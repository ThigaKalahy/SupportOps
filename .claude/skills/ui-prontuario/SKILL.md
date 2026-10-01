---
name: ui-prontuario
description: Sistema visual do Prontuário — tokens, tipografia, densidade e restrições negativas absolutas. Use antes de criar ou alterar qualquer componente, página, formulário ou primitivo em /ui-lab. Governa uma ferramenta operacional densa (registro clínico/livro-razão), não uma landing page ou dashboard de marketing.
---

# UI do Prontuário

Fonte da verdade completa em [DESIGN.md](../../../DESIGN.md), na raiz do repositório. Este skill é o resumo acionável para quando você está escrevendo componentes. Em qualquer conflito entre este skill e um instinto genérico de "boa UI" ou um default de shadcn/ui, este skill vence.

## Restrições negativas absolutas

Nunca fazer, sem exceção, sem "só desta vez":

- Sem hero section, sem bento grid, sem `max-w-4xl`/`max-w-5xl` centralizado.
- Sem `py-24`, `py-32` ou qualquer respiro de landing page. Densidade de gestão, não página de vendas.
- Sem scroll-reveal, sem stagger de entrada, sem `IntersectionObserver` para animação decorativa.
- Sem serifa editorial em lugar nenhum. Sem o par `#F4F1EA` + terracota — é o default reconhecível de UI gerada por IA e este produto existe para não parecer isso.
- Sem gradiente ambiente, sem glow, sem blur decorativo atrás de card.
- Sem glassmorphism (vidro fosco, transparência com blur) em nenhum componente.
- Sem emoji na interface.
- Sem ícone acima de 20px.
- Sem gráfico decorativo (nenhum elemento visual que exista só para "parecer dashboard" sem carregar informação).
- Sem imagem de placeholder de banco de imagens (picsum.photos ou equivalente) — dados de demonstração usam nomes e valores reais do domínio, nunca foto genérica.
- Sem faux-OS window chrome (barra de título falsa, botões de semáforo de macOS, moldura de navegador decorativa em torno de screenshot ou componente).
- Sem sombra em card. Sombra só existe em popover, dropdown e dialog, e é `0 1px 2px rgba(16,18,24,0.04)`.
- Sem `rounded-full` fora de avatar.
- Sem remover ou substituir o outline de foco por algo mais sutil.
- Sem componente novo sem primitivo correspondente em `/ui-lab` — se o primitivo não existe lá, criar lá primeiro.

## Tokens

```
--canvas:          #FBFBFC
--surface:         #FFFFFF
--surface-sunken:  #F4F5F7
--ink:             #16181D   (nunca #000)
--ink-secondary:   #5C6270
--ink-tertiary:    #8A909E   só placeholder, desabilitado e marcador de ausência — nunca texto a ser lido
--line:            #E4E6EB
--line-strong:     #CDD1D9
--accent:          #2C4A7C   único acento não semântico — ação primária e seleção
--accent-wash:     #EDF1F6

--calm:              #487756  /  wash #EDF3EF   concluído, em dia
--attention:         #94650C  /  wash #FBF3E2   vencendo, atenção
--attention-strong:  #9E4F14  /  wash #FAEEE4   atenção forte (degrau "laranja")
--overdue:           #A33A32  /  wash #FAECEA   vencido, crítico
--neutral:           #5C6270  /  wash #F4F5F7   aberto, sem prazo
```

A cor de severidade comunica estado e prioridade — nunca decoração. Não usar `--calm`/`--attention`/`--attention-strong`/`--overdue` fora de contexto de status de registro. O degrau laranja é `attention` com `strong` (StatusPill/SeverityDot), não uma quinta severidade. Sem tema escuro no MVP — não inventar tokens escuros.

Tipografia: **IBM Plex Sans** na interface inteira, **IBM Plex Mono** em datas, prazos, contadores, chaves e rótulos de tipo de registro. Escala `11/12/13/15/18/22/28`, corpo a 13px com `line-height: 1.5`. `font-variant-numeric: tabular-nums` global em números. Sentence case em tudo; uppercase só em rótulo mono de 11px com `letter-spacing: 0.06em`.

## Regras de densidade

- Linha de tabela: 40px de altura (32px em modo compacto).
- Raio: 4px em controles, 6px em contêineres.
- Espaçamento interno de componente usa a escala 4/8/12/16; espaçamento entre blocos/seções usa 24/32/48/64 — nunca o inverso.
- Contêiner fluido até 1600px de largura.
- Movimento: 120–160ms, só `opacity`/`transform`, respeitando `prefers-reduced-motion`.
- Hover de linha: `--surface-sunken`. Seleção: `--accent-wash` + barra `inset 2px` de `--accent` na esquerda.

## Regras de componente

- Todo componente novo nasce em `/ui-lab` antes de ser usado em uma tela real — é o catálogo obrigatório de referência do projeto.
- Ícones: Lucide, stroke 1.5, 16px como padrão, nunca acima de 20px.
- Foco visível sempre: `outline: 2px solid var(--accent); outline-offset: 1px`.
- O componente de timeline é o elemento assinatura do produto — calha vertical de 1px, data em mono na margem, etiqueta de tipo em mono 11px, traço de severidade que sangra na régua quando há pendência. É o único lugar do produto autorizado a chamar atenção visualmente. Nenhum outro componente deve competir com ele em intensidade.
- Sidebar: 232px fixa, colapsável para 56px em desktop; drawer em tablet/mobile. Barra de contexto de 48px no lugar de navbar grande.
- Tabela em tela estreita vira lista de linhas empilhadas — nunca scroll horizontal.

## Por que este skill não é um skill genérico de estética

Este skill governa uma **ferramenta operacional densa** — algo reaberto dezenas de vezes por dia por uma única pessoa administrando registros de outras pessoas — e não uma landing page, um dashboard de marketing ou um produto que precisa "impressionar" em um primeiro scroll.

Isso muda o que conta como boa decisão de design. Uma landing page quer respiro, hierarquia dramática e um momento de entrada memorável; este produto quer o oposto: a menor distância possível entre abrir a tela e encontrar a informação, e nenhuma superfície que compita por atenção com o dado. É por isso que as restrições deste skill são absolutas em vez de sugestões de estilo:

- **Sem hero, sem bento grid, sem `max-w-4xl`** — porque isso é vocabulário de página que se lê uma vez, não de ferramenta que se usa o dia inteiro.
- **Sem `py-24`** — porque espaço generoso custa scroll, e scroll custa velocidade de leitura em uma lista que o usuário revisita constantemente.
- **Sem scroll-reveal** — porque animação de entrada é deleite na primeira visita e ruído na vigésima. Este produto não tem "primeira visita" como caso relevante.
- **Sem serifa editorial** — porque o produto não é uma revista nem uma newsletter; é um registro técnico, e a tipografia precisa admitir isso.
- **Sem gradiente ambiente** — porque gradiente e glow comunicam "produto novo e bonito", e este produto quer comunicar "registro confiável e estável", que é uma sensação visual diferente.

Quando uma escolha de design parecer boa em abstrato mas vier do vocabulário de landing page/dashboard de marketing, ela é errada aqui — não porque fica feia, mas porque resolve o problema errado.
