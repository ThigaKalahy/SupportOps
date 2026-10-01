/**
 * Dados de demonstração do /ui-lab. São fixtures (conteúdo de exemplo do
 * domínio), não texto de interface — por isso não vivem em labels.ts.
 * Nomes e valores realistas; nunca lorem ipsum, nunca foto de banco de imagens.
 */

export interface LabAgreement {
  id: string
  title: string
  owner: string
  origin: string
  createdAt: Date
  dueDate: Date | null
  resolved: boolean
  reschedules: number
}

export const sectionCopy = {
  tokens: { title: "Tokens", description: "Cores estruturais e de severidade, exatamente como no DESIGN.md." },
  typography: { title: "Tipografia", description: "IBM Plex Sans na interface, IBM Plex Mono em datas, prazos, contadores e rótulos." },
  shape: { title: "Raio e sombra", description: "4px em controles, 6px em contêineres. Sombra só em popover, dropdown e dialog." },
  buttons: { title: "Button", description: "32px (sm) e 36px (padrão). Ação destrutiva em cor de perigo." },
  controls: { title: "Campos", description: "Input, Textarea e Select com FieldGroup." },
  checkbox: { title: "Checkbox e Label", description: "" },
  status: { title: "Status e metadados", description: "StatusPill, SeverityDot, Badge, MetaLabel e DateStamp." },
  deadline: { title: "Escala de prazo", description: "src/lib/severity.ts aplicada a prazos reais a partir de hoje." },
  pageHeader: { title: "PageHeader", description: "" },
  emptyState: { title: "EmptyState", description: "Título, uma linha de direção, no máximo uma ação." },
  statStrip: { title: "StatStrip", description: "Substitui a grade de cards de KPI. Toda métrica mostra a cobertura." },
  sparkline: { title: "Sparkline", description: "SVG inline, 1px, 24px de altura, sem eixo e sem legenda." },
  dataTable: { title: "DataTable", description: "Linhas de 40px, cabeçalho sticky, seleção com barra de 2px. Abaixo de 768px vira lista empilhada." },
  tabs: { title: "Tabs", description: "" },
  overlays: { title: "Sobreposições", description: "Dialog, Sheet, DropdownMenu, Popover, Tooltip e Command." },
  calendar: { title: "Calendar", description: "" },
  misc: { title: "Avatar, Separator e ScrollArea", description: "" },
} as const

export const demo = {
  buttonPrimary: "Registrar 1:1",
  buttonSecondary: "Editar cadastro",
  buttonGhost: "Ver timeline",
  buttonDestructive: "Desativar pessoa",
  buttonLink: "Abrir combinado",
  iconButton: "Adicionar anotação",
  fieldTitle: "Título do combinado",
  fieldTitlePlaceholder: "Ex.: Revisar macro de reembolso",
  fieldTitleHelp: "Uma frase que a pessoa reconheça sem contexto.",
  fieldTitleError: "Informe o título do combinado.",
  fieldNotes: "Observações",
  fieldNotesPlaceholder: "Contexto, links de chamado, o que foi acordado",
  fieldOwner: "Responsável",
  fieldOwnerPlaceholder: "Selecione a pessoa",
  fieldSeniority: "Senioridade",
  checkboxShared: "Compartilhar com o gestor",
  checkboxReviewed: "Revisado na daily",
  checkboxPartial: "Combinados da semana",
  checkboxRequired: "Ciência do analista",
  pageTitle: "Combinados",
  pageSubtitle: "14 em aberto · 3 vencidos",
  pageAction: "Novo combinado",
  emptyTitle: "Nenhum combinado em aberto",
  emptyDirection: "Combinados criados em dailies e 1:1 aparecem aqui com o prazo e o responsável.",
  emptyAction: "Novo combinado",
  tableLabel: "Combinados em aberto",
  tableEmptyTitle: "Nenhum combinado vencido",
  tableEmptyDirection: "Quando um prazo passar sem conclusão, o combinado aparece nesta lista.",
  tableError: "A conexão com o banco expirou. Os dados não foram alterados.",
  colTitle: "Combinado",
  colOwner: "Responsável",
  colOrigin: "Origem",
  colCreated: "Criado em",
  colDue: "Prazo",
  colStatus: "Situação",
  colDrag: "Arrasto",
  dragged: "arrastado {n}x",
  statOpen: "Combinados em aberto",
  statOverdue: "Vencidos",
  statCompletion: "Cumpridos no prazo",
  statCompletionCoverage: "de 31 combinados",
  statCsat: "CSAT",
  statCsatCoverage: "6 avaliações",
  statDaily: "Última daily",
  sparkLabel: "Combinados abertos por semana",
  tabsOverview: "Visão geral",
  tabsTimeline: "Timeline",
  tabsAgreements: "Combinados",
  tabsDevelopment: "Desenvolvimento",
  tabsRecords: "1:1 e feedbacks",
  tabsArchived: "Arquivados",
  period30: "30 dias",
  period90: "3 meses",
  period180: "6 meses",
  periodAll: "Tudo",
  dialogTrigger: "Abrir dialog",
  dialogTitle: "Desativar Henrique Lopes?",
  dialogDescription:
    "O cadastro sai das listagens ativas e o histórico de gestão permanece intacto. Dá para reativar depois.",
  dialogConfirm: "Desativar pessoa",
  sheetTrigger: "Abrir sheet",
  sheetTitle: "Henrique Lopes",
  sheetDescription: "Analista de suporte · Pleno",
  dropdownTrigger: "Ações",
  dropdownLabel: "Registro",
  dropdownEdit: "Editar",
  dropdownShare: "Compartilhar com o gestor",
  dropdownReschedule: "Reagendar prazo",
  dropdownCancel: "Cancelar combinado",
  popoverTrigger: "Filtrar por tipo",
  popoverTitle: "Tipos de evento",
  popoverDescription: "Mostrar apenas os tipos marcados.",
  tooltipTrigger: "Passe o mouse",
  tooltipText: "Sem 1:1 há 34 dias",
  commandTrigger: "Abrir paleta",
  commandGroupPeople: "Pessoas",
  commandGroupActions: "Ações",
  commandNewAgreement: "Novo combinado",
  commandNewDaily: "Registrar daily",
  scrollTitle: "Anotações recentes",
} as const

export const people = [
  "Henrique Lopes",
  "Diego Martins",
  "Ana Ribeiro",
  "Carla Mendes",
  "Bruno Teixeira",
  "Júlia Campos",
  "Rafael Nunes",
  "Patrícia Gomes",
  "Lucas Ferraz",
] as const

export const seniorities = ["Júnior", "Pleno", "Sênior"] as const

export const eventTypes = ["Feedback", "1:1", "Combinado", "Daily", "Anotação"] as const

export const notes = [
  "Pediu para acompanhar a migração de macros na próxima sprint.",
  "Reduziu o tempo de primeira resposta depois do ajuste de fila.",
  "Combinou revisar os chamados reabertos toda sexta.",
  "Mencionou cansaço com o plantão de fim de semana.",
  "Assumiu a documentação do fluxo de reembolso.",
  "Ajudou a Júlia no atendimento de um cliente enterprise.",
  "Quer se preparar para a promoção a Sênior em 2027.",
  "Ficou de mapear os chamados sem categoria.",
] as const

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

/** Combinados com prazos relativos a hoje, cobrindo todos os degraus da escala. */
export function buildAgreements(today: Date): LabAgreement[] {
  return [
    { id: "a1", title: "Revisar macro de reembolso com o time de billing", owner: "Henrique Lopes", origin: "Daily", createdAt: addDays(today, -40), dueDate: addDays(today, -35), resolved: false, reschedules: 4 },
    { id: "a2", title: "Documentar fluxo de escalonamento para N2", owner: "Diego Martins", origin: "1:1", createdAt: addDays(today, -20), dueDate: addDays(today, -12), resolved: false, reschedules: 1 },
    { id: "a3", title: "Mapear chamados sem categoria do último mês", owner: "Ana Ribeiro", origin: "Daily", createdAt: addDays(today, -9), dueDate: addDays(today, -2), resolved: false, reschedules: 0 },
    { id: "a4", title: "Acompanhar cliente enterprise até o fechamento do incidente", owner: "Carla Mendes", origin: "Incidente", createdAt: addDays(today, -3), dueDate: today, resolved: false, reschedules: 0 },
    { id: "a5", title: "Preparar apresentação de boas práticas de tom de voz", owner: "Bruno Teixeira", origin: "Feedback", createdAt: addDays(today, -5), dueDate: addDays(today, 2), resolved: false, reschedules: 0 },
    { id: "a6", title: "Revisar chamados reabertos da semana", owner: "Júlia Campos", origin: "Daily", createdAt: addDays(today, -1), dueDate: addDays(today, 10), resolved: false, reschedules: 0 },
    { id: "a7", title: "Atualizar base de conhecimento sobre integração com ERP", owner: "Rafael Nunes", origin: "Gestor", createdAt: addDays(today, -15), dueDate: null, resolved: false, reschedules: 0 },
    { id: "a8", title: "Fechar pendências do plantão de fim de semana", owner: "Patrícia Gomes", origin: "Daily", createdAt: addDays(today, -12), dueDate: addDays(today, -4), resolved: true, reschedules: 0 },
  ]
}

export { addDays }
