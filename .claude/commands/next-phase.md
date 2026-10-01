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
