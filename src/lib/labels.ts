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
