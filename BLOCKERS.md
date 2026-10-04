# Bloqueios aguardando o Thiago

## [x] Connection strings do Neon ausentes no .env.local
Resolvido em 01/10/2026: `DATABASE_URL` (pooler) e `DIRECT_URL` (direta) preenchidos, ambos em `sa-east-1` com `sslmode=require`; conexão testada com sucesso pelas duas URLs; banco vazio.
Fase: P3
Preciso de: valores reais de `DATABASE_URL` (conexão com pooler) e `DIRECT_URL` (conexão direta) no `.env.local`. Hoje as duas chaves existem, mas contêm os marcadores `"<pooled do Neon>"` e `"<direct do Neon>"`.
Onde consigo:
1. console.neon.tech → projeto do Prontuário (região AWS São Paulo, `aws-sa-east-1`).
2. Selecione o branch `dev` — o `prisma migrate dev` cria e apaga um banco de sombra; não rode contra o `main`.
3. Botão "Connect" → copie a string com "Connection pooling" ligado para `DATABASE_URL` e a string com ele desligado para `DIRECT_URL`. As duas terminam em `?sslmode=require`.
4. Cole no `.env.local`, sem aspas angulares. Não precisa me mostrar os valores.
Enquanto isso: o P3 inteiro fica parado — schema, primeira migration, CHECK constraints e índice GIN só valem se validados contra o banco real. P4 em diante dependem do P3.

## [x] Lista de motivos de reclassificação: "nove" ou oito?
Resolvido em 01/10/2026: seed com os oito listados, "Outro" por último. Um nono pode ser acrescentado depois em /settings (P11).
Decisão relacionada (P4): o ALLOWED_EMAILS tem um só e-mail; o seed cria apenas o OWNER, e o VIEWER será criado no P5 por `pnpm user:create`.
Fase: P3 (o seed em si é do P4)
Preciso de: confirmar a lista de `ReclassificationReason`. O prompt diz "exatamente estes nove, nesta ordem", mas lista oito: Impacto superestimado; Impacto subestimado; Ausência de contingência não considerada; Cliente único tratado como impacto geral; Urgência comercial confundida com criticidade técnica; Evidência insuficiente; Critério de prioridade aplicado incorretamente; Outro.
Onde consigo: responder qual é o nono motivo, ou confirmar que são oito.
Enquanto isso: não bloqueia o schema do P3; bloqueia o seed do P4.

## [x] Prompt do P3 manda ler o PLANO-TECNICO.md, que está congelado
Resolvido em 01/10/2026: o modelo implementado é o do prompt do P3; a seção 5 do PLANO-TECNICO.md foi lida só como contexto.
Fase: P3
Preciso de: confirmar a fonte do modelo de dados. O P3 pede "Leia a seção 5 do PLANO-TECNICO.md por completo", mas o próprio PLANO-TECNICO.md e o CLAUDE.md dizem que ele é histórico e não deve ser consultado para implementar. Pela precedência (CLAUDE.md > MANUAL-COMPLETO.md > PLANO-TECNICO.md), vou implementar exatamente o modelo descrito no prompt do P3 e usar a seção 5 só como contexto de raciocínio, nunca para acrescentar campo ou tabela.
Onde consigo: responder "ok" ou corrigir.
Enquanto isso: não bloqueia, se a leitura acima estiver certa.

## [x] AUTH_SECRET do .env.local ainda é um marcador
Resolvido em 02/10/2026: `AUTH_SECRET` com 32 bytes aleatórios em base64 (conferido sem exibir o valor) e senha do OWNER definida. Fica para quando houver o e-mail: o VIEWER (passo 4 abaixo) — não bloqueia nenhuma fase.
Fase: P5
Preciso de: um valor aleatório real em `AUTH_SECRET` no `.env.local`. Hoje o valor contém `<...>`. Sem ele, o login não funciona (os testes do P5 rodaram com um segredo temporário passado só ao processo, nunca gravado).
Onde consigo:
1. No terminal, na raiz do projeto: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Cole o resultado em `AUTH_SECRET=` no `.env.local`. Não precisa me mostrar.
3. Defina a sua senha: `pnpm user:password` com o seu e-mail (o seed criou sua conta sem senha). Guarde a senha — só aparece uma vez.
4. Quando tiver o e-mail do VIEWER: acrescente-o ao `ALLOWED_EMAILS` e rode `pnpm user:create` com papel VIEWER.
Enquanto isso: o código do P5 está pronto e testado, mas ninguém consegue entrar no app local. As fases seguintes dependem de login.

## [ ] Deploy na Vercel (conta, variáveis e Deployment Protection)
Fase: P18
Preciso de: que você faça o deploy na sua conta da Vercel — eu não tenho acesso nem devo criar conta ou autorizar integração em seu nome. Tudo no repositório já está pronto (`vercel.json` com build e região `gru1`, `.env.example`, README "Deploy na Vercel").
Onde consigo:
1. vercel.com → Add New → Project → importe o repositório (Next.js detectado; não altere os comandos, o `vercel.json` manda).
2. Settings → Environment Variables (Production e Preview): `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` (gere um novo para produção), `ALLOWED_EMAILS`, `DEFAULT_ORG_SLUG=suporte`. Não defina `AUTH_URL` nem `TZ`. Recomendo apontar Preview para o branch `dev` do Neon.
3. Settings → Deployment Protection → Vercel Authentication, escopo Standard Protection.
4. Faça o deploy e me avise: eu confiro `/ui-lab` (404), o login, a busca e a home no domínio de produção.
5. No plano Hobby, a região `gru1` pode exigir ajuste em Settings → Functions se o `vercel.json` não for aceito — me diga o que a Vercel mostrar.
Enquanto isso: o produto roda localmente e todo o código do P18 está comitado; só o deploy e a proteção dos previews dependem de você. Nenhuma fase fica bloqueada (o P18 é a última).

<!--
FORMATO — o Claude Code adiciona blocos assim e PARA (sem o recuo, que só existe
aqui para o exemplo não ser lido como bloqueio real pelo phase-gate):

    ## [ ] Título curto
    Fase: P3
    Preciso de: <o que exatamente>
    Onde consigo: <passo a passo>
    Enquanto isso: <o que fica bloqueado>
-->
