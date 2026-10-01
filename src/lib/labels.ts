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
