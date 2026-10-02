/**
 * ÚNICO ponto de tradução en → pt-BR (D6).
 *
 * Código, schema e rotas ficam em inglês; todo texto visível ao usuário sai daqui.
 * Nenhum componente ou Server Action escreve string em pt-BR diretamente.
 *
 * Formato:
 * - `labels`      textos de interface agrupados por área (app, common, ui...).
 * - `enumLabels`  rótulo de cada valor de enum do domínio, por grupo. Cada fase
 *                 que cria um enum no schema acrescenta o grupo correspondente aqui.
 * - `enumLabel()` leitura tipada de `enumLabels`.
 * - `fill()`      interpolação de `{chave}` em textos com valores.
 */

export const labels = {
  app: {
    name: "Prontuário",
    description: "Registro de gestão do time de suporte",
  },
  common: {
    save: "Salvar",
    cancel: "Cancelar",
    close: "Fechar",
    confirm: "Confirmar",
    retry: "Tentar novamente",
    loading: "Carregando",
    search: "Buscar",
    select: "Selecionar",
    noResults: "Nenhum resultado",
    optional: "opcional",
    required: "obrigatório",
    previousMonth: "Mês anterior",
    nextMonth: "Próximo mês",
  },
  nav: {
    today: "Hoje",
    team: "Equipe",
    agreements: "Combinados",
    priorityValidations: "Validação de prioridade",
    dailies: "Dailies",
    records: "Registros",
    development: "Desenvolvimento",
    settings: "Configurações",
    timeline: "Timeline",
  },
  shell: {
    skipToContent: "Pular para o conteúdo",
    mainNavigation: "Navegação principal",
    openNavigation: "Abrir navegação",
    collapseSidebar: "Recolher barra lateral",
    expandSidebar: "Expandir barra lateral",
    breadcrumb: "Você está em",
    searchPlaceholder: "Buscar pessoa, combinado ou ação",
    searchShortcut: "⌘K",
  },
  auth: {
    explanation: "Registro de gestão do time de suporte. Acesso restrito.",
    email: "E-mail",
    password: "Senha",
    submit: "Entrar",
    /** Idêntico para e-mail inexistente, senha errada e conta bloqueada (CLAUDE.md). */
    invalidCredentials: "E-mail ou senha inválidos",
    signOut: "Sair",
    currentUser: "Usuário atual",
    readOnly: "Somente leitura",
    readOnlyHint: "Seu acesso é de leitura. Registros privados do gestor não aparecem para você.",
  },
  access: {
    forbidden: "Ação não permitida para o seu papel.",
  },
  validation: {
    required: "Campo obrigatório.",
    tooShort: "Texto curto demais.",
    tooLong: "Texto longo demais.",
    email: "E-mail inválido.",
    date: "Data inválida. Use DD/MM/AAAA.",
    futureDate: "A data não pode ser no futuro.",
    reasonRequired: "Informe o motivo: mudança de senioridade, cargo ou status é evento de carreira.",
    generic: "Não foi possível salvar. Revise os campos.",
  },
  team: {
    tableLabel: "Pessoas do time",
    peopleCount: "{count} pessoas",
    personCount: "1 pessoa",
    columns: {
      person: "Pessoa",
      seniority: "Senioridade",
      tenure: "No time",
      status: "Status",
      lastOneOnOne: "Último 1:1",
      openAgreements: "Combinados abertos",
      attention: "Atenção",
      actions: "Ações",
    },
    filters: {
      button: "Filtros",
      seniority: "Senioridade",
      allSeniorities: "Todas",
      status: "Status",
      current: "Ativos e afastados",
      inactive: "Inativos",
      needsAttention: "Precisa de atenção",
      groupBySeniority: "Agrupar por senioridade",
      clear: "Limpar filtros",
    },
    empty: {
      filteredTitle: "Ninguém com esses filtros",
      filteredDirection: "Ajuste ou limpe os filtros da barra de contexto para ver o time inteiro.",
    },
    noOneOnOne: "Nenhum",
    noAttention: "Sem pendências",
    add: "Adicionar pessoa",
    edit: "Editar cadastro",
    deactivate: "Desativar pessoa",
    rowActions: "Ações de {name}",
    form: {
      createTitle: "Adicionar pessoa",
      createDescription: "Cadastro de quem entra no time. Responsabilidades e competências são opcionais.",
      editTitle: "Editar cadastro",
      editDescription: "Mudança de senioridade, cargo ou status vira evento de carreira, com motivo.",
      fullName: "Nome completo",
      preferredName: "Nome preferido",
      preferredNameHelp: "Como a pessoa é chamada no dia a dia. Aparece nas listas.",
      position: "Cargo",
      seniority: "Senioridade",
      joinedAt: "Data de entrada",
      joinedAtPlaceholder: "DD/MM/AAAA",
      status: "Status",
      email: "E-mail",
      moreDetails: "Mais detalhes",
      lessDetails: "Menos detalhes",
      responsibilities: "Responsabilidades",
      responsibilitiesHelp: "Marque as que a pessoa assume a partir de hoje.",
      competencies: "Competências avaliadas",
      competenciesHelp: "Nível atual de 1 a 5. Deixe em branco o que não foi avaliado.",
      notAssessed: "—",
      reason: "Motivo da mudança",
      reasonHelp: "Fica registrado na timeline da pessoa.",
      careerChange: "Esta edição muda {fields}. Isso gera um evento de carreira.",
      fieldSeniority: "senioridade",
      fieldPosition: "cargo",
      fieldStatus: "status",
      save: "Salvar",
      create: "Adicionar pessoa",
    },
    deactivateDialog: {
      title: "Desativar {name}?",
      description:
        "A pessoa sai das listagens ativas. Nada é apagado: 1:1, feedbacks, combinados e timeline continuam no histórico.",
      reason: "Motivo da saída",
      confirm: "Desativar pessoa",
    },
  },
  attention: {
    overdue: { one: "1 combinado vencido há {days} dias", other: "{count} combinados vencidos; o mais antigo há {days} dias" },
    dueSoon: { one: "1 combinado vence em até {limit} dias", other: "{count} combinados vencem em até {limit} dias" },
    chronic: {
      one: "1 combinado reagendado {limit} vezes ou mais",
      other: "{count} combinados reagendados {limit} vezes ou mais",
    },
    noOneOnOne: "Nenhum 1:1 registrado desde a entrada, há {days} dias",
    lateOneOnOne: "Sem 1:1 há {days} dias (referência para {seniority}: {limit} dias)",
    stalePlan: "PDI sem acompanhamento há {days} dias",
  },
  timeline: {
    /** Título da linha de 1:1 quando não há assuntos registrados. */
    oneOnOneFallback: "1:1",
    /** Título de mudança de carreira: "Pleno → Sênior". */
    memberChange: "{from} → {to}",
  },
  notFound: {
    title: "Página não encontrada",
    direction: "Este endereço não corresponde a nenhuma página do Prontuário. Confira o link ou volte para Hoje.",
    action: "Ir para Hoje",
  },
  pages: {
    today: {
      subtitle: "Quem precisa da sua atenção hoje.",
      emptyTitle: "Nenhum alerta por enquanto",
      emptyDirection:
        "Combinados vencidos, 1:1 atrasados, PDIs parados e dailies não registradas aparecem aqui, ordenados por urgência, assim que houver registros do time.",
    },
    team: {
      subtitle: "Cadastro das pessoas do time, com senioridade, último 1:1 e combinados em aberto.",
      emptyTitle: "Nenhuma pessoa cadastrada",
      emptyDirection:
        "Cada analista cadastrado ganha um perfil com timeline, combinados, 1:1, feedbacks e plano de desenvolvimento.",
    },
    agreements: {
      subtitle: "Compromissos combinados com o time, com responsável, prazo e histórico de reagendamento.",
      emptyTitle: "Nenhum combinado registrado",
      emptyDirection:
        "Combinados nascem em dailies, 1:1 e feedbacks e aparecem aqui com o prazo original, o prazo atual e quantas vezes foram reagendados.",
    },
    priorityValidations: {
      subtitle: "Prioridade definida pelo analista no chamado e prioridade confirmada pela supervisão.",
      emptyTitle: "Nenhuma validação registrada",
      emptyDirection:
        "Cada validação registra o chamado, o responsável, as duas prioridades e se ela foi mantida, elevada, reduzida ou devolvida para reanálise.",
    },
    dailies: {
      subtitle: "Revisão dos combinados do dia anterior e registro dos novos, por pessoa.",
      emptyTitle: "Nenhuma daily registrada",
      emptyDirection:
        "Ao registrar uma daily, os combinados da anterior e os vencidos entram para revisão automaticamente.",
    },
    records: {
      subtitle: "1:1 e feedbacks de todo o time.",
      emptyTitle: "Nenhum 1:1 ou feedback registrado",
      emptyDirection:
        "1:1 e feedbacks ficam aqui, filtráveis por pessoa, tipo e período. Nascem privados; só o feedback de reconhecimento sugere compartilhar com o gestor.",
    },
    development: {
      subtitle: "Planos de desenvolvimento, competências e acompanhamentos.",
      emptyTitle: "Nenhum plano de desenvolvimento ativo",
      emptyDirection:
        "Planos aparecem aqui com a data do último acompanhamento. Plano sem acompanhamento há mais de 45 dias fica em destaque.",
    },
    settings: {
      subtitle: "Parâmetros que alimentam registros e alertas.",
      emptyTitle: "Nenhum parâmetro cadastrado",
      emptyDirection:
        "Aqui ficam os níveis de prioridade, os motivos de bloqueio e de reclassificação, os padrões de URL de chamado e os limiares dos alertas.",
    },
  },
  command: {
    title: "Paleta de comandos",
    description: "Busque uma ação ou um registro",
    placeholder: "Buscar ação ou registro",
  },
  table: {
    loading: "Carregando registros",
    errorTitle: "Não foi possível carregar os registros",
    emptyTitle: "Nenhum registro",
    selectedRow: "Linha selecionada",
  },
  severity: {
    /** Degrau "laranja" da escala graduada (attention + strong). */
    attentionStrong: "Atenção forte",
  },
  deadline: {
    noDueDate: "Sem prazo",
    onTrack: "Em dia",
    dueToday: "Vence hoje",
    dueInDays: "Vence em {days} dias",
    dueTomorrow: "Vence amanhã",
    overdueOneDay: "Vencido há 1 dia",
    overdueDays: "Vencido há {days} dias",
    probablyForgotten: "Provavelmente esquecido",
  },
  sparkline: {
    summary: "{count} pontos, de {first} a {last}",
    empty: "Sem dados no período",
  },
  uiLab: {
    title: "UI Lab",
    subtitle: "Referência visual obrigatória. Todo componente novo nasce aqui antes de entrar numa tela.",
    states: {
      default: "Padrão",
      hover: "Hover",
      focus: "Foco",
      selected: "Selecionado",
      disabled: "Desabilitado",
      loading: "Carregando",
      empty: "Vazio",
      error: "Erro",
      compact: "Compacto",
    },
  },
} as const;

export const enumLabels = {
  memberStatus: {
    ACTIVE: "Ativo",
    ON_LEAVE: "Afastado",
    OFFBOARDING: "Em desligamento",
    INACTIVE: "Inativo",
  },
  role: {
    OWNER: "Gestor",
    MANAGER: "Gestor de time",
    VIEWER: "Leitura",
  },
  severity: {
    calm: "Em dia",
    attention: "Atenção",
    overdue: "Vencido",
    neutral: "Aberto",
  },
} as const;

type EnumLabels = typeof enumLabels;

export function enumLabel<G extends keyof EnumLabels>(
  group: G,
  value: keyof EnumLabels[G],
): string {
  return enumLabels[group][value] as string;
}

/** Substitui `{chave}` pelos valores informados: fill("Vence em {days} dias", { days: 3 }). */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Escolhe singular ou plural e interpola: plural(labels.attention.overdue, 2, { days: 9 }). */
export function plural(
  forms: { one: string; other: string },
  count: number,
  values: Record<string, string | number> = {},
): string {
  return fill(count === 1 ? forms.one : forms.other, { count, ...values })
}
