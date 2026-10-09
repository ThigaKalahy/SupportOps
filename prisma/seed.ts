/**
 * Seed de demonstração do Prontuário: ~6 meses de histórico de um time real
 * de suporte, com padrões narrativos que exercitam os motores de alerta e de
 * cumprimento. Distribuição uniforme não testaria nada.
 *
 * Execução: `pnpm db:seed` (Node ≥ 22.6, que roda TypeScript nativamente).
 *
 * Idempotência: todo registro de demonstração tem id com prefixo `seed_`.
 * Cada execução apaga SOMENTE esses ids e recria tudo numa única transação.
 * Organização, usuário e catálogos (senioridades, motivos, níveis...) são
 * atualizados por upsert, nunca apagados. Um registro real que dependa de
 * dado do seed faz a exclusão falhar (FK) e a transação inteira é desfeita.
 *
 * Datas são relativas a "hoje" (São Paulo), para os alertas fazerem sentido em
 * qualquer dia em que o seed rodar. A aleatoriedade usa semente fixa.
 */
import { PrismaClient, type Prisma } from "@prisma/client"

import { todayBusinessDate } from "../src/lib/dates.ts"
import { DEFAULT_DEV_RETURN_REASONS } from "../src/lib/dev-returns.ts"
import { MODULE_KEYS } from "../src/lib/modules.ts"
import { recordTimelineEvents, timelineEventFor, type TimelineEventInput } from "../src/server/timeline.ts"

const prisma = new PrismaClient()

/* ════════════════════════════ Aleatoriedade fixa ════════════════════════════ */

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20261001)
const between = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
const chance = (p: number) => rng() < p
function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)]
  if (item === undefined) throw new Error("pick() em lista vazia")
  return item
}
function at<T>(items: readonly T[], index: number): T {
  const item = items[index]
  if (item === undefined) throw new Error(`Índice ${index} fora da lista`)
  return item
}

/* ═══════════════════════════════ Datas ═══════════════════════════════ */

const TODAY = todayBusinessDate()
const PERIOD_DAYS = 182
/** Duas semanas em que o gestor esteve fora: quase nenhum registro. */
const AWAY = { from: -80, to: -67 }

/** Data de negócio (meia-noite UTC) a `offset` dias de hoje. */
function day(offset: number): Date {
  const d = new Date(TODAY)
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}
const isWeekend = (offset: number) => {
  const wd = day(offset).getUTCDay()
  return wd === 0 || wd === 6
}
/** Recua até o dia útil mais próximo (sexta, se cair no fim de semana). */
function weekday(offset: number): number {
  let o = offset
  while (isWeekend(o)) o -= 1
  return o
}
/** Instante em horário de São Paulo (UTC−3) no dia `offset`. */
function instant(offset: number, hour: number, minute = 0): Date {
  const d = day(offset)
  d.setUTCHours(hour + 3, minute, 0, 0)
  return d
}
const inAway = (offset: number) => offset >= AWAY.from && offset <= AWAY.to

const workdays: number[] = []
for (let o = -PERIOD_DAYS; o <= 0; o++) if (!isWeekend(o)) workdays.push(o)

/* ═══════════════════════════════ Catálogos ═══════════════════════════════ */

const ORG_ID = "seed_org"
const TEAM_ID = "seed_team"

const SENIORITIES = [
  { id: "seed_sen_junior", key: "JUNIOR", label: "Júnior", order: 1 },
  { id: "seed_sen_pleno", key: "PLENO", label: "Pleno", order: 2 },
  { id: "seed_sen_senior", key: "SENIOR", label: "Sênior", order: 3 },
] as const
type SeniorityKey = (typeof SENIORITIES)[number]["key"]
const seniorityId = (key: SeniorityKey) => `seed_sen_${key.toLowerCase()}`

const BLOCKER_REASONS = [
  { id: "seed_br_terceiro", label: "Dependência de terceiro", category: "EXTERNAL" },
  { id: "seed_br_cliente", label: "Aguardando cliente", category: "EXTERNAL" },
  { id: "seed_br_acesso", label: "Falta de acesso ou permissão", category: "EXTERNAL" },
  { id: "seed_br_volume", label: "Volume operacional", category: "CAPACITY" },
  { id: "seed_br_ausencia", label: "Ausência (férias/licença)", category: "CAPACITY" },
  { id: "seed_br_prioridade", label: "Prioridade alterada", category: "CAPACITY" },
  { id: "seed_br_informacao", label: "Falta de informação", category: "INTERNAL" },
  { id: "seed_br_escopo", label: "Escopo mal definido", category: "INTERNAL" },
  { id: "seed_br_outro", label: "Outro", category: "INTERNAL" },
] as const
type BlockerReasonId = (typeof BLOCKER_REASONS)[number]["id"]

const PRIORITY_LEVELS = [
  { id: "seed_pl_critica", key: "CRITICA", label: "Crítica", rank: 4 },
  { id: "seed_pl_alta", key: "ALTA", label: "Alta", rank: 3 },
  { id: "seed_pl_media", key: "MEDIA", label: "Média", rank: 2 },
  { id: "seed_pl_baixa", key: "BAIXA", label: "Baixa", rank: 1 },
] as const

/** Oito motivos, na ordem do prompt do P3 (decisão registrada em BLOCKERS.md). */
const RECLASSIFICATION_REASONS = [
  "Impacto superestimado",
  "Impacto subestimado",
  "Ausência de contingência não considerada",
  "Cliente único tratado como impacto geral",
  "Urgência comercial confundida com criticidade técnica",
  "Evidência insuficiente",
  "Critério de prioridade aplicado incorretamente",
  "Outro",
].map((label, i) => ({ id: `seed_rr_${i + 1}`, label, order: i + 1, requiresDetail: label === "Outro" }))
const REASON = {
  overestimated: "seed_rr_1",
  underestimated: "seed_rr_2",
  noContingency: "seed_rr_3",
  singleClient: "seed_rr_4",
  commercialUrgency: "seed_rr_5",
  noEvidence: "seed_rr_6",
  wrongCriteria: "seed_rr_7",
} as const

const TICKET_URL_PATTERNS = [
  {
    id: "seed_tp_generico",
    label: "Genérico — maior sequência de dígitos da URL",
    // O extrator do P11 aplica o padrão a todas as ocorrências e fica com a mais longa.
    regex: "(\\d+)",
    captureGroup: 1,
    order: 1,
  },
]

const COMPETENCIES = [
  { id: "seed_cp_hardware", name: "Diagnóstico de hardware", category: "Técnica" },
  { id: "seed_cp_escrita", name: "Comunicação escrita com cliente", category: "Relacionamento" },
  { id: "seed_cp_escalonamento", name: "Escalonamento", category: "Processo" },
  { id: "seed_cp_documentacao", name: "Documentação técnica", category: "Processo" },
  { id: "seed_cp_autonomia", name: "Autonomia em chamado complexo", category: "Técnica" },
  { id: "seed_cp_log", name: "Análise de log", category: "Técnica" },
  { id: "seed_cp_critico", name: "Atendimento a cliente crítico", category: "Relacionamento" },
  { id: "seed_cp_priorizacao", name: "Priorização de chamados", category: "Processo" },
  { id: "seed_cp_redes", name: "Conectividade e redes", category: "Técnica" },
  { id: "seed_cp_fila", name: "Gestão da própria fila", category: "Processo" },
] as const
type CompetencyId = (typeof COMPETENCIES)[number]["id"]

const RESPONSIBILITIES = [
  ["seed_rs_plantao", "Plantão de fim de semana", "Escala quinzenal, sábado e domingo das 8h às 14h."],
  ["seed_rs_n2", "Fila N2", "Chamados escalonados pelo N1 com diagnóstico inicial."],
  ["seed_rs_kb", "Base de conhecimento", "Revisão e publicação de artigos de solução."],
  ["seed_rs_enterprise", "Clientes enterprise", "Ponto focal dos 14 contratos enterprise."],
  ["seed_rs_erp", "Integração com ERP", "Chamados de integração fiscal e de estoque."],
  ["seed_rs_hardware", "Hardware e periféricos", "Garantia, troca e diagnóstico de equipamentos."],
  ["seed_rs_onboarding", "Onboarding de analistas", "Acompanhamento das duas primeiras semanas de quem entra."],
  ["seed_rs_sla", "Monitoramento de SLA", "Acompanha chamados próximos de estourar o prazo."],
  ["seed_rs_triagem", "Triagem de chamados", "Classificação e prioridade inicial dos chamados novos."],
  ["seed_rs_reaberturas", "Relatório de reaberturas", "Levantamento semanal de chamados reabertos."],
  ["seed_rs_telefone", "Atendimento por telefone", "Linha de urgência em horário comercial."],
  ["seed_rs_publico", "Contratos de órgãos públicos", "Chamados com prazo contratual e auditoria."],
] as const

const METRIC_DEFINITIONS = [
  // As nove métricas do P17, cadastradas e SEM nenhum resultado (importação é futura).
  { id: "seed_md_volume", key: "ticket_volume", label: "Volume de chamados", unit: "chamados", direction: "HIGHER_IS_BETTER" },
  { id: "seed_md_sla_first", key: "sla_first_response", label: "SLA de primeira resposta", unit: "%", direction: "HIGHER_IS_BETTER" },
  { id: "seed_md_sla_resolution", key: "sla_resolution", label: "SLA de atendimento", unit: "%", direction: "HIGHER_IS_BETTER" },
  { id: "seed_md_csat", key: "csat", label: "CSAT", unit: "nota", direction: "HIGHER_IS_BETTER" },
  { id: "seed_md_return72", key: "return_72h", label: "Retorno em 72h", unit: "%", direction: "LOWER_IS_BETTER" },
  { id: "seed_md_recurrence", key: "recurrence_rate", label: "Recorrência", unit: "%", direction: "LOWER_IS_BETTER" },
  { id: "seed_md_reopen", key: "reopen_rate", label: "Reabertura", unit: "%", direction: "LOWER_IS_BETTER" },
  { id: "seed_md_backlog", key: "backlog", label: "Backlog", unit: "chamados", direction: "LOWER_IS_BETTER" },
  { id: "seed_md_tma", key: "handle_time", label: "Tempo médio de atendimento", unit: "min", direction: "LOWER_IS_BETTER" },
] as const

/* ═══════════════════════════════ Pessoas ═══════════════════════════════ */

interface Person {
  key: string
  fullName: string
  preferredName: string
  seniority: SeniorityKey
  joinedAt: string
  position: string
}

/** Exatamente as nove pessoas do time. */
const PEOPLE = [
  { key: "rafael", fullName: "Rafael Bittencourt", preferredName: "Rafael", seniority: "SENIOR", joinedAt: "2022-03-14", position: "Analista de suporte" },
  { key: "camila", fullName: "Camila Nakagawa", preferredName: "Camila", seniority: "PLENO", joinedAt: "2022-08-01", position: "Analista de suporte" },
  { key: "diego", fullName: "Diego Sarmento", preferredName: "Diego", seniority: "PLENO", joinedAt: "2023-01-09", position: "Analista de suporte" },
  { key: "priscila", fullName: "Priscila Vasconcelos", preferredName: "Priscila", seniority: "PLENO", joinedAt: "2023-05-15", position: "Analista de suporte" },
  { key: "henrique", fullName: "Henrique Toledo", preferredName: "Henrique", seniority: "PLENO", joinedAt: "2023-09-04", position: "Analista de suporte" },
  { key: "larissa", fullName: "Larissa Fontoura", preferredName: "Larissa", seniority: "JUNIOR", joinedAt: "2025-02-10", position: "Analista de suporte" },
  { key: "vinicius", fullName: "Vinícius Amorim", preferredName: "Vinícius", seniority: "JUNIOR", joinedAt: "2025-04-07", position: "Analista de suporte" },
  { key: "beatriz", fullName: "Beatriz Caldeira", preferredName: "Beatriz", seniority: "JUNIOR", joinedAt: "2025-07-14", position: "Analista de suporte" },
  { key: "otavio", fullName: "Otávio Rezende", preferredName: "Otávio", seniority: "JUNIOR", joinedAt: "2025-10-06", position: "Analista de suporte" },
] as const satisfies readonly Person[]
type PersonKey = (typeof PEOPLE)[number]["key"]
const memberId = (key: PersonKey) => `seed_m_${key}`

/* ═══════════════════════════════ Conteúdo ═══════════════════════════════ */

const DAILY_SUMMARIES = [
  "Fila em 84 chamados, 6 perto de estourar SLA. Rafael pega os de integração.",
  "Segunda puxada: 112 chamados abertos depois do fim de semana. Prioridade nos enterprise.",
  "Fila estável. Revisamos os reabertos da semana passada.",
  "Incidente no gateway de pagamento desde 8h40; dois analistas dedicados.",
  "Volume baixo. Aproveitar para atualizar artigos da base.",
  "Atualização do ERP do cliente Fortes saiu ontem; esperar pico de chamados fiscais.",
  "Treinamento do Otávio na fila N1 segue; Camila acompanha.",
  "SLA de primeira resposta em 92% na semana. Meta é 95%.",
  "Três chamados de garantia parados aguardando fornecedor.",
  "Pico de chamados de impressora fiscal depois da mudança de NFC-e.",
  "Fila em 67. Combinamos revisar a triagem das prioridades altas.",
  "Cliente da prefeitura cobrou retorno formal; Priscila responde até 14h.",
]
const DAILY_DECISIONS = [
  "Chamados de integração vão direto para a fila N2.",
  "Plantão de sábado fica com Diego e Vinícius.",
  "Artigos de NFC-e passam por revisão antes de publicar.",
  "Escalonar para infra qualquer timeout acima de 30s no gateway.",
  null,
  null,
  null,
]
const DAILY_NOTES: Partial<Record<PersonKey, string[]>> = {
  rafael: [
    "Fechou o incidente do gateway; causa foi certificado expirado no balanceador.",
    "Vai revisar com o Henrique os logs do cliente Mercantil.",
    "Pegou os dois chamados enterprise que estavam sem dono.",
  ],
  camila: [
    "Terminou a revisão dos artigos de NFC-e.",
    "Acompanhou o Otávio em três atendimentos por telefone.",
    "Escalonou o chamado da Fortes para o time do ERP com evidência completa.",
  ],
  diego: [
    "Fornecedor do ERP ainda não respondeu sobre a API de notas.",
    "Ficou com o plantão de sábado; 11 chamados, nenhum crítico.",
    "Documentou o passo a passo de reinstalação do agente de coleta.",
  ],
  priscila: [
    "Respondeu o ofício da prefeitura dentro do prazo.",
    "Tem três chamados de garantia esperando o fornecedor.",
  ],
  henrique: [
    "Ainda sem conclusão sobre a lentidão do cliente Mercantil.",
    "Pediu ajuda para ler os logs do serviço de sincronização.",
  ],
  larissa: [
    "Resolveu sozinha o chamado de integração da Lojas Paraná.",
    "Primeira semana sem nenhum chamado reaberto.",
    "Montou o checklist de diagnóstico de impressora fiscal.",
    "Assumiu dois chamados enterprise com acompanhamento da Camila.",
  ],
  vinicius: [
    "Zerou a fila de chamados de senha antes das 10h.",
    "Teve dúvida na classificação de um chamado de rede; resolveu com o Diego.",
  ],
  beatriz: [
    "Fez o primeiro atendimento de cliente enterprise com a Priscila junto.",
    "Ainda insegura com chamados de rede; pediu material.",
  ],
  otavio: [
    "Abriu quatro chamados como Alta que eram Média; conversamos na hora.",
    "Primeira semana inteira na fila N1.",
    "Pediu para acompanhar o plantão de sábado.",
  ],
}
const DAILY_BLOCKERS: Partial<Record<PersonKey, string[]>> = {
  diego: ["Sem retorno do fornecedor do ERP sobre a API de notas."],
  priscila: ["Fornecedor de garantia não confirmou a coleta dos equipamentos."],
  henrique: ["Sem acesso de leitura ao servidor de logs do cliente Mercantil."],
  beatriz: ["Sem permissão no painel do roteador do cliente."],
}

/** Títulos de combinado: concretos, como um gestor escreveria na daily. */
const AGREEMENT_TITLES: Record<PersonKey, string[]> = {
  rafael: [
    "Revisar com infra o alerta de certificado do balanceador",
    "Documentar a causa raiz do incidente do gateway",
    "Montar roteiro de atendimento para cliente crítico",
    "Revisar os 5 artigos mais acessados da base",
    "Fechar a pendência de faturamento do cliente Mercantil",
    "Treinar a fila N2 em leitura de log de sincronização",
    "Propor critério de escalonamento para timeout no gateway",
    "Revisar a triagem de prioridade da semana com o Otávio",
  ],
  camila: [
    "Publicar os artigos revisados de NFC-e",
    "Acompanhar o Otávio em 5 atendimentos por telefone",
    "Reescrever a macro de reembolso com o novo prazo",
    "Levantar chamados reabertos do cliente Fortes",
    "Fechar o checklist de onboarding da fila N1",
    "Responder a pesquisa de satisfação do cliente Atlas",
    "Revisar o roteiro de escalonamento para o ERP",
    "Organizar a passagem de turno do plantão",
  ],
  diego: [
    "Documentar reinstalação do agente de coleta",
    "Testar o script de limpeza de cache no cliente Rota Sul",
    "Revisar os chamados de plantão do fim de semana",
    "Atualizar o artigo de configuração de VPN",
    "Mapear os chamados de integração sem categoria",
    "Ajudar o Vinícius com os chamados de rede",
    "Revisar o tempo de primeira resposta da fila N2",
    "Enviar o relatório de incidentes de julho ao cliente Atlas",
    "Padronizar o formulário de abertura de chamado de integração",
  ],
  priscila: [
    "Responder o ofício da prefeitura sobre o prazo contratual",
    "Abrir a garantia dos 3 terminais do cliente Bom Preço",
    "Atualizar a planilha de SLA dos contratos públicos",
    "Montar o material de rede para a Beatriz",
    "Revisar os chamados críticos do contrato da prefeitura",
    "Conferir os números de série antes de pedir troca em garantia",
    "Fechar o relatório trimestral do contrato da secretaria",
    "Acompanhar a Beatriz no primeiro atendimento enterprise",
  ],
  henrique: [
    "Fechar o diagnóstico da lentidão do cliente Mercantil",
    "Ler os logs de sincronização com o Rafael",
    "Documentar os testes de rede do cliente Mercantil",
    "Revisar os 12 chamados abertos há mais de 10 dias",
    "Atualizar o artigo de configuração de certificado digital",
    "Responder o cliente Mercantil com o plano de ação",
    "Passar os chamados de hardware antigos para a Priscila",
    "Estudar o módulo de logs do curso interno",
    "Revisar os chamados reabertos de setembro",
    "Montar a lista de pendências do cliente Mercantil",
    "Atualizar a planilha de SLA da fila N2",
    "Responder os chamados críticos parados há mais de 2 dias",
    "Revisar com o Rafael o log de sincronização da Mercantil",
    "Documentar o teste de latência do cliente Mercantil",
    "Fechar os chamados de certificado vencido da semana",
    "Revisar o relatório de reaberturas antes de enviar",
  ],
  larissa: [
    "Fazer o curso interno de leitura de log",
    "Montar checklist de diagnóstico de impressora fiscal",
    "Revisar a escrita das respostas com a Camila",
    "Assumir um chamado de integração do início ao fim",
    "Documentar a solução do chamado da Lojas Paraná",
    "Acompanhar a Camila em dois atendimentos enterprise",
    "Atualizar o artigo de troca de bobina da impressora fiscal",
    "Revisar os próprios chamados reabertos do mês",
    "Conduzir sozinha um atendimento enterprise",
    "Propor melhoria no checklist de triagem",
    "Escrever o artigo de configuração de leitor de código de barras",
    "Treinar a Beatriz no checklist de impressora fiscal",
    "Fechar os chamados de integração da semana sem escalonar",
  ],
  vinicius: [
    "Estudar o material de rede com o Diego",
    "Zerar os chamados de senha pendentes",
    "Revisar a classificação dos chamados de rede da semana",
    "Fazer o plantão de sábado acompanhado",
    "Atualizar o artigo de redefinição de senha",
    "Responder os chamados em aberto há mais de 3 dias",
    "Treinar atendimento por telefone com a Camila",
    "Documentar a configuração de impressora de rede",
    "Revisar as macros de primeira resposta",
  ],
  beatriz: [
    "Estudar o material de rede da Priscila",
    "Acompanhar a Priscila em um atendimento enterprise",
    "Revisar as respostas escritas com a Camila",
    "Fazer o checklist de impressora fiscal com a Larissa",
    "Classificar os chamados de rede da semana",
    "Escrever a primeira solução para a base de conhecimento",
    "Responder os chamados de senha pendentes",
    "Revisar os chamados reabertos do mês",
  ],
  otavio: [
    "Reler o critério de prioridade de chamado",
    "Revisar com o Rafael os chamados classificados como Alta",
    "Acompanhar o plantão de sábado",
    "Fazer a trilha de onboarding da fila N1",
    "Responder os chamados de senha sem ajuda",
    "Revisar as próprias reclassificações da semana",
    "Treinar atendimento por telefone com a Camila",
    "Documentar o primeiro chamado resolvido sozinho",
    "Estudar os 10 artigos mais acessados da base",
  ],
}
const AGREEMENT_OUTCOMES = [
  "Feito e revisado na daily.",
  "Concluído; artigo publicado.",
  "Feito, com pequena pendência registrada no chamado.",
  "Entregue e validado com o cliente.",
  null,
  null,
]
const BLOCKER_TEXTS: Record<BlockerReasonId, string[]> = {
  seed_br_terceiro: [
    "Fornecedor do ERP não respondeu o chamado aberto na segunda.",
    "Infra ainda não liberou o acesso ao servidor de logs.",
  ],
  seed_br_cliente: ["Cliente não mandou o print do erro.", "Cliente não confirmou a janela para a visita técnica."],
  seed_br_acesso: ["Sem permissão de administrador no painel do cliente."],
  seed_br_volume: ["Fila passou de 120 chamados na terça; priorizou atendimento.", "Semana de pico depois da atualização fiscal."],
  seed_br_ausencia: ["Ficou dois dias de atestado."],
  seed_br_prioridade: ["Incidente do cliente enterprise tomou a semana."],
  seed_br_informacao: ["Faltou o número de série dos equipamentos para abrir a garantia.", "Não achou a documentação da versão antiga do agente."],
  seed_br_escopo: ["Não ficou claro se o artigo cobre também o fluxo de devolução."],
  seed_br_outro: ["Treinamento obrigatório de LGPD ocupou a tarde."],
}

/* ═══════════════════════════ Estrutura de coleta ═══════════════════════════ */

const timeline: TimelineEventInput[] = []
let ownerId = ""

/* ═══════════════════════════════ Dailies ═══════════════════════════════ */

interface DailyRow {
  id: string
  offset: number
}

function buildDailies() {
  const offsets: number[] = []
  const usable = workdays.filter((o) => o <= -1 && !inAway(o))
  usable.forEach((o, i) => {
    if (i % 3 === 0) offsets.push(o)
  })
  // A daily mais recente é sempre a do último dia útil (o time está em uso).
  const lastWorkday = usable[usable.length - 1]
  if (lastWorkday !== undefined && !offsets.includes(lastWorkday)) offsets.push(lastWorkday)

  const dailies: Prisma.DailyCreateManyInput[] = []
  const participants: Prisma.DailyParticipantCreateManyInput[] = []
  const rows: DailyRow[] = []

  offsets.forEach((offset, i) => {
    const id = `seed_daily_${String(i + 1).padStart(3, "0")}`
    rows.push({ id, offset })
    dailies.push({
      id,
      teamId: TEAM_ID,
      date: day(offset),
      summary: pick(DAILY_SUMMARIES),
      decisions: pick(DAILY_DECISIONS),
      authorUserId: ownerId,
      createdAt: instant(offset, 9, 25),
    })

    // Notas individuais em parte das dailies: 1 a 3 pessoas por daily.
    const withNote = new Set<PersonKey>()
    const notesToday = chance(0.65) ? between(1, 3) : 0
    for (let n = 0; n < notesToday; n++) withNote.add(pick(PEOPLE).key)

    for (const person of PEOPLE) {
      // Camila de férias por duas semanas; Vinícius com atestado pontual.
      const onVacation = person.key === "camila" && offset >= -125 && offset <= -112
      const sick = person.key === "vinicius" && (offset === weekday(-30) || offset === weekday(-29))
      const present = !onVacation && !sick
      let note: string | null = null
      let blocker: string | null = null
      if (present && withNote.has(person.key)) {
        const options = DAILY_NOTES[person.key]
        if (options?.length) note = pick(options)
        const blockers = DAILY_BLOCKERS[person.key]
        if (blockers?.length && chance(0.3)) blocker = pick(blockers)
      }
      participants.push({ teamId: TEAM_ID, dailyId: id, memberId: memberId(person.key), present, note, blocker })
      const event = timelineEventFor.dailyParticipation({
        dailyId: id,
        memberId: memberId(person.key),
        date: instant(offset, 9, 30),
        note,
        blocker,
        authorUserId: ownerId,
      })
      if (event) timeline.push(event)
    }
  })

  return { dailies, participants, rows }
}

/* ═══════════════════════════════ 1:1 ═══════════════════════════════ */

interface OneOnOneContent {
  topics: string
  memberPerception: string
  managerPerception: string
  wins: string | null
  difficulties: string | null
  development: string | null
}

/** Distribuição desigual de propósito: Henrique e Beatriz quase sem 1:1. */
const ONE_ON_ONE_OFFSETS: Record<PersonKey, number[]> = {
  rafael: [-170, -138, -104, -62, -35, -12],
  camila: [-160, -100, -55, -26, -6],
  diego: [-150, -96, -45, -15],
  priscila: [-165, -120, -90, -50, -18],
  henrique: [-140, -58],
  larissa: [-175, -145, -112, -60, -33, -9],
  vinicius: [-158, -100, -52, -14],
  beatriz: [-130, -43],
  otavio: [-120, -61, -20],
}

const GENERIC_ONE_ON_ONES: OneOnOneContent[] = [
  {
    topics: "Carga do plantão e divisão dos chamados enterprise",
    memberPerception: "Acha que o plantão está pesado quando cai junto com fechamento de mês.",
    managerPerception: "Entrega consistente; precisa avisar antes quando a fila aperta.",
    wins: "Fechou o mês sem chamado estourando SLA.",
    difficulties: "Plantão coincidindo com pico fiscal.",
    development: "Combinar rodízio do plantão com mais antecedência.",
  },
  {
    topics: "Retorno sobre a revisão de artigos da base",
    memberPerception: "Gosta de escrever, mas sente falta de tempo reservado para isso.",
    managerPerception: "Artigos mais claros que a média; vale reservar 2h por semana.",
    wins: "Artigo de VPN virou o mais acessado do mês.",
    difficulties: null,
    development: "Reservar bloco fixo na agenda para documentação.",
  },
  {
    topics: "Escalonamentos para o time do ERP",
    memberPerception: "Os chamados voltam sem resposta e o cliente cobra dele.",
    managerPerception: "Escala com evidência boa; o gargalo é o fornecedor, não ele.",
    wins: null,
    difficulties: "Dependência do fornecedor do ERP.",
    development: "Registrar prazo de retorno do fornecedor no próprio chamado.",
  },
  {
    topics: "Interesse em assumir a triagem",
    memberPerception: "Quer variar e entender melhor o critério de prioridade.",
    managerPerception: "Tem bom julgamento de impacto; pode testar a triagem duas manhãs por semana.",
    wins: "Nenhuma reclassificação na última quinzena.",
    difficulties: null,
    development: "Acompanhar a triagem com o Rafael antes de assumir.",
  },
  {
    topics: "Atendimento a cliente difícil da semana",
    memberPerception: "Ficou abalado com a ligação do cliente da prefeitura.",
    managerPerception: "Manteve o tom e registrou tudo; fez o certo.",
    wins: "Cliente fechou o chamado com nota 5 depois.",
    difficulties: "Lidar com cobrança agressiva por telefone.",
    development: "Roteiro para ligação de cliente insatisfeito.",
  },
  {
    topics: "Metas do semestre e próxima avaliação",
    memberPerception: "Quer clareza do que falta para a próxima senioridade.",
    managerPerception: "Está perto em técnica; falta autonomia em chamado complexo.",
    wins: null,
    difficulties: null,
    development: "Pegar um chamado complexo por quinzena do início ao fim.",
  },
  {
    topics: "Organização da própria fila",
    memberPerception: "Perde tempo alternando entre telefone e chamados escritos.",
    managerPerception: "Concordo; testar blocos de telefone de manhã.",
    wins: "Fila pessoal abaixo de 15 chamados a semana toda.",
    difficulties: "Muitas interrupções por telefone.",
    development: "Testar blocos de atendimento por telefone por duas semanas.",
  },
  {
    topics: "Mentoria com quem chegou recentemente",
    memberPerception: "Gosta de ensinar, mas não quer perder o ritmo da própria fila.",
    managerPerception: "Mentoria está funcionando; reduzir a meta de chamados dele em 10% no período.",
    wins: "A pessoa mentorada já fecha chamados de senha sozinha.",
    difficulties: null,
    development: null,
  },
  {
    topics: "Feedback sobre o incidente do gateway",
    memberPerception: "Achou que demoramos para envolver infra.",
    managerPerception: "Ele tem razão; o critério de escalonamento estava vago.",
    wins: "Comunicação com os clientes durante o incidente foi elogiada.",
    difficulties: "Critério de escalonamento para infra.",
    development: "Ajudar a escrever o critério de timeout.",
  },
  {
    topics: "Volta das férias e repasse de pendências",
    memberPerception: "Voltou com 20 chamados herdados e se sentiu sem contexto.",
    managerPerception: "Repasse foi fraco; ajustar o modelo de passagem de turno.",
    wins: null,
    difficulties: "Passagem de chamados sem histórico.",
    development: null,
  },
]

const ONE_ON_ONE_OVERRIDES: Partial<Record<PersonKey, OneOnOneContent[]>> = {
  larissa: [
    {
      topics: "Primeiros meses na fila e dúvidas de integração",
      memberPerception: "Ainda depende da Camila para chamados de integração.",
      managerPerception: "Aprende rápido; precisa ganhar confiança para fechar sozinha.",
      wins: "Nenhum chamado reaberto no mês.",
      difficulties: "Chamados de integração fiscal.",
      development: "PDI de comunicação escrita e leitura de log.",
    },
    {
      topics: "Escrita das respostas ao cliente",
      memberPerception: "Sente que escreve demais e o cliente não lê.",
      managerPerception: "Respostas já estão mais curtas; manter o modelo de três parágrafos.",
      wins: "Elogio do cliente Lojas Paraná pela clareza.",
      difficulties: null,
      development: "Revisar 5 respostas por semana com a Camila.",
    },
    {
      topics: "Checklist de impressora fiscal",
      memberPerception: "Quer que o checklist vire padrão do time.",
      managerPerception: "Ótima iniciativa; reduziu o tempo de diagnóstico do time.",
      wins: "Checklist adotado pela fila N1.",
      difficulties: null,
      development: "Transformar o checklist em artigo da base.",
    },
    {
      topics: "Chamados de integração sem escalonar",
      memberPerception: "Está fechando a maioria sem ajuda e quer mais desafio.",
      managerPerception: "Pronta para pegar chamados enterprise com acompanhamento leve.",
      wins: "Fechou 9 de 10 chamados de integração sem escalonar.",
      difficulties: null,
      development: "Assumir dois clientes enterprise.",
    },
    {
      topics: "Conversa sobre a próxima senioridade",
      memberPerception: "Pergunta o que falta para Pleno.",
      managerPerception: "Competências já no nível de Pleno; avaliar no próximo ciclo.",
      wins: "Conduziu sozinha o atendimento enterprise da Atlas.",
      difficulties: null,
      development: "Fechar o PDI de autonomia e treinar a Beatriz.",
    },
    {
      topics: "Mentoria da Beatriz e fechamento do PDI",
      memberPerception: "Está gostando de ensinar o checklist.",
      managerPerception: "Só falta uma ação para concluir o PDI.",
      wins: "Beatriz já usa o checklist sozinha.",
      difficulties: null,
      development: null,
    },
  ],
  henrique: [
    {
      topics: "Diagnóstico do cliente Mercantil",
      memberPerception: "Diz que o problema é do cliente e não há o que fazer.",
      managerPerception: "Chamado aberto há três semanas sem plano; precisa de um próximo passo concreto.",
      wins: null,
      difficulties: "Leitura de log de sincronização.",
      development: "PDI de análise de log com o Rafael.",
    },
    {
      topics: "Combinados atrasados e plano de análise de log",
      memberPerception: "Sente que não tem tempo para estudar.",
      managerPerception: "Combinados escorregando há dois meses; PDI sem avanço.",
      wins: null,
      difficulties: "Atrasos recorrentes nos combinados.",
      development: "Retomar o PDI com uma ação por semana.",
    },
  ],
  beatriz: [
    {
      topics: "Primeiros chamados de rede",
      memberPerception: "Insegura com chamados de rede e com medo de errar com o cliente.",
      managerPerception: "Pergunta bem antes de agir; só precisa de material de base.",
      wins: "Fechou os primeiros chamados de senha sem ajuda.",
      difficulties: "Conectividade e redes.",
      development: "Material de rede da Priscila.",
    },
    {
      topics: "Acompanhamento do material de rede",
      memberPerception: "Já entende o básico de DNS e DHCP.",
      managerPerception: "Evoluiu; marcar o próximo 1:1 em duas semanas.",
      wins: "Classificou corretamente os chamados de rede da semana.",
      difficulties: null,
      development: "Primeiro atendimento enterprise acompanhada.",
    },
  ],
}

function buildOneOnOnes() {
  const rows: Prisma.OneOnOneCreateManyInput[] = []
  const byMember: Partial<Record<PersonKey, { id: string; offset: number }[]>> = {}
  let generic = 0
  for (const person of PEOPLE) {
    const overrides = ONE_ON_ONE_OVERRIDES[person.key]
    ONE_ON_ONE_OFFSETS[person.key].forEach((rawOffset, i) => {
      const offset = weekday(rawOffset)
      const content = overrides?.[i] ?? at(GENERIC_ONE_ON_ONES, generic++ % GENERIC_ONE_ON_ONES.length)
      const id = `seed_1on1_${person.key}_${i + 1}`
      const visibility = chance(0.25) ? "SHARED" : "PRIVATE"
      rows.push({
        teamId: TEAM_ID,
        id,
        memberId: memberId(person.key),
        date: day(offset),
        durationMinutes: pick([30, 30, 45, 45, 60]),
        ...content,
        nextReviewAt: day(offset + pick([14, 21, 30])),
        visibility,
        authorUserId: ownerId,
        createdAt: instant(offset, 16, 10),
        updatedAt: instant(offset, 16, 10),
      })
      ;(byMember[person.key] ??= []).push({ id, offset })
      timeline.push(
        timelineEventFor.oneOnOne({
          id,
          memberId: memberId(person.key),
          date: instant(offset, 15, 30),
          topics: content.topics,
          managerPerception: content.managerPerception,
          visibility,
          authorUserId: ownerId,
        }),
      )
    })
  }
  return { rows, byMember }
}

/* ═══════════════════════════════ Feedbacks ═══════════════════════════════ */

type FeedbackCategory = "RECOGNITION" | "DEVELOPMENT" | "BEHAVIOR" | "TECHNICAL" | "PERFORMANCE" | "FORMAL"
type FeedbackSpec = [
  offset: number,
  category: FeedbackCategory,
  context: string,
  behavior: string,
  impact: string,
  guidance: string | null,
  followUpIn: number | null,
]

const FEEDBACKS: Record<PersonKey, FeedbackSpec[]> = {
  rafael: [
    [-168, "TECHNICAL", "Incidente do gateway, manhã de terça", "Identificou o certificado expirado no balanceador em 20 minutos lendo os logs de TLS.", "Pagamentos voltaram antes do pico do almoço.", null, null],
    [-131, "RECOGNITION", "Mentoria do Henrique", "Reservou duas tardes para ler logs de sincronização junto com o Henrique.", "Henrique fechou o primeiro diagnóstico com evidência.", null, null],
    [-97, "BEHAVIOR", "Daily de quinta", "Interrompeu a fala do Vinícius duas vezes para dar a resposta.", "Vinícius parou de expor as dúvidas na daily.", "Deixar o Vinícius terminar e perguntar antes de responder.", 21],
    [-58, "RECOGNITION", "Cliente Atlas", "Conduziu a reunião de causa raiz com o cliente sem jargão técnico.", "Cliente renovou o contrato de suporte premium.", null, null],
    [-30, "DEVELOPMENT", "Critério de escalonamento", "Escreveu o critério de timeout para infra, mas não divulgou para a fila N1.", "N1 continuou escalonando por e-mail.", "Apresentar o critério na daily e publicar na base.", 14],
    [-7, "RECOGNITION", "Triagem com o Otávio", "Revisou com o Otávio, chamado a chamado, as classificações da semana.", "Otávio entendeu a diferença entre urgência comercial e criticidade.", null, null],
  ],
  camila: [
    [-155, "RECOGNITION", "Artigos de NFC-e", "Revisou os 8 artigos de NFC-e antes da mudança fiscal.", "Chamados de NFC-e caíram 30% na semana da mudança.", null, null],
    [-108, "DEVELOPMENT", "Volta das férias", "Deixou 20 chamados sem nota de passagem antes de sair.", "Quem assumiu precisou reabrir contato com 6 clientes.", "Usar o modelo de passagem de turno antes de ausências.", 30],
    [-72, "TECHNICAL", "Escalonamento para o ERP", "Escalonou o chamado da Fortes com log, versão e passos para reproduzir.", "Fornecedor respondeu em 4 horas em vez de dias.", null, null],
    [-45, "RECOGNITION", "Mentoria da Larissa", "Revisou cinco respostas por semana da Larissa durante dois meses.", "Larissa passou a receber elogio por clareza.", null, null],
    [-22, "PERFORMANCE", "Fila de setembro", "Manteve a fila pessoal abaixo de 15 chamados mesmo com a mentoria.", "Nenhum chamado dela estourou SLA no mês.", null, null],
    [-4, "BEHAVIOR", "Reunião com o cliente Fortes", "Assumiu compromisso de prazo com o cliente sem consultar o ERP.", "Prazo prometido depende de terceiro.", "Prometer prazo só depois de confirmar com o fornecedor.", 14],
  ],
  diego: [
    [-162, "TECHNICAL", "Plantão de sábado", "Reinstalou o agente de coleta em 4 lojas por acesso remoto.", "Evitou visita técnica no domingo.", null, null],
    [-118, "RECOGNITION", "Documentação", "Documentou o passo a passo de reinstalação do agente.", "N1 resolve o problema sem escalonar.", null, null],
    [-64, "DEVELOPMENT", "Fornecedor do ERP", "Esperou duas semanas pelo fornecedor sem cobrar nem avisar o cliente.", "Cliente ligou para a diretoria.", "Cobrar o fornecedor a cada 3 dias e registrar no chamado.", 20],
    [-36, "RECOGNITION", "Ajuda ao Vinícius", "Explicou ao Vinícius a lógica de DHCP com um caso real da fila.", "Vinícius classificou os chamados de rede corretamente na semana.", null, null],
    [-11, "DEVELOPMENT", "Relatório de incidentes", "Mandou o relatório de julho ao cliente Atlas com dados errados de agosto.", "Precisou reenviar e explicar ao cliente.", "Conferir o período antes de enviar relatório.", 10],
  ],
  priscila: [
    [-171, "RECOGNITION", "Contrato da prefeitura", "Respondeu o ofício da prefeitura dentro do prazo contratual, com evidências.", "Evitou multa contratual.", null, null],
    [-126, "TECHNICAL", "Garantia de terminais", "Pediu troca em garantia sem conferir o número de série.", "Fornecedor recusou; atrasou a troca em uma semana.", "Conferir número de série antes de abrir garantia.", 14],
    [-88, "RECOGNITION", "Material de rede", "Montou o material de rede para a Beatriz com exemplos reais.", "Beatriz ganhou autonomia em chamados simples de rede.", null, null],
    [-55, "PERFORMANCE", "Chamados críticos do contrato público", "Fechou os 7 chamados críticos do contrato dentro do SLA.", "Auditoria do contrato sem apontamento.", null, null],
    [-28, "DEVELOPMENT", "Combinados antigos", "Deixou dois combinados vencidos há mais de um mês sem atualização.", "Ninguém sabe se as garantias foram abertas.", "Atualizar ou cancelar os combinados na próxima daily.", 7],
    [-9, "BEHAVIOR", "Atendimento com a Beatriz", "Deixou a Beatriz conduzir o atendimento enterprise e só interveio no final.", "Beatriz ganhou confiança com o cliente.", null, null],
  ],
  henrique: [
    [-160, "TECHNICAL", "Cliente Mercantil", "Fechou o chamado de lentidão sem identificar a causa.", "Chamado reaberto em dois dias.", "Só encerrar com causa identificada ou plano registrado.", 14],
    [-128, "FORMAL", "SLA de primeira resposta", "Deixou três chamados críticos sem primeira resposta por mais de 4 horas.", "Descumprimento do SLA contratual com o cliente Mercantil.", "Registro formal. Primeira resposta de crítico em até 1 hora.", 30],
    [-101, "DEVELOPMENT", "Análise de log", "Pediu ajuda ao Rafael para ler log, mas não fez o curso combinado.", "Continua dependente para diagnóstico.", "Concluir o módulo de logs do curso interno.", 21],
  ],
  larissa: [
    [-176, "DEVELOPMENT", "Respostas escritas", "Respostas longas, com explicação técnica que o cliente não pediu.", "Clientes respondem perguntando de novo.", "Modelo de três parágrafos: o que houve, o que fizemos, o que o cliente faz.", 21],
    [-150, "TECHNICAL", "Chamado de integração", "Escalonou para N2 um chamado que o checklist resolvia.", "N2 devolveu o chamado no mesmo dia.", "Rodar o checklist completo antes de escalonar.", 14],
    [-122, "RECOGNITION", "Lojas Paraná", "Resolveu sozinha o chamado de integração da Lojas Paraná.", "Cliente agradeceu por escrito.", null, null],
    [-96, "RECOGNITION", "Checklist de impressora fiscal", "Montou o checklist de diagnóstico de impressora fiscal por iniciativa própria.", "Tempo de diagnóstico do time caiu de 40 para 15 minutos.", null, null],
    [-66, "PERFORMANCE", "Chamados de integração", "Fechou 9 de 10 chamados de integração do mês sem escalonar.", "Menos carga na fila N2.", null, null],
    [-48, "RECOGNITION", "Clareza com cliente", "Resposta ao cliente Atlas citada como exemplo pelo próprio cliente.", "Cliente pediu que ela seguisse no contrato.", null, null],
    [-31, "RECOGNITION", "Atendimento enterprise", "Conduziu sozinha o atendimento enterprise da Atlas.", "Primeiro atendimento enterprise sem acompanhamento.", null, null],
    [-16, "BEHAVIOR", "Mentoria da Beatriz", "Ensinou o checklist para a Beatriz deixando ela executar.", "Beatriz já usa o checklist sozinha.", null, null],
    [-5, "RECOGNITION", "Semana de pico", "Manteve a qualidade das respostas na semana de pico fiscal.", "Nenhum chamado reaberto na semana.", null, null],
  ],
  vinicius: [
    [-152, "DEVELOPMENT", "Chamados de rede", "Classificou chamados de rede como senha para fechar mais rápido.", "Três clientes ficaram sem solução real.", "Classificar pelo problema, não pela solução mais rápida.", 14],
    [-115, "RECOGNITION", "Fila de senhas", "Zerou a fila de chamados de senha antes das 10h por uma semana.", "Liberou o time para os chamados de integração.", null, null],
    [-84, "BEHAVIOR", "Daily", "Parou de expor dúvidas na daily depois de ser interrompido.", "Dúvidas viraram retrabalho no chamado.", "Trazer as dúvidas para o 1:1 se a daily não for o lugar.", 21],
    [-47, "TECHNICAL", "Impressora de rede", "Documentou a configuração de impressora de rede com prints.", "Artigo usado por toda a fila N1.", null, null],
    [-25, "RECOGNITION", "Plantão acompanhado", "Fez o primeiro plantão de sábado acompanhado sem nenhuma pendência.", "Pode entrar no rodízio do plantão.", null, null],
    [-8, "DEVELOPMENT", "Macros de primeira resposta", "Usou a macro genérica em chamados que pediam resposta específica.", "Clientes responderam pedindo detalhe.", "Ajustar a macro ao caso antes de enviar.", 14],
  ],
  beatriz: [
    [-138, "DEVELOPMENT", "Atendimento por telefone", "Desligou a ligação sem confirmar o número do chamado.", "Cliente precisou ligar de novo.", "Confirmar número do chamado e próximo passo antes de encerrar.", 14],
    [-104, "RECOGNITION", "Chamados de senha", "Fechou os primeiros chamados de senha sem ajuda.", "Primeira semana com fila própria.", null, null],
    [-70, "TECHNICAL", "Rede", "Confundiu problema de DNS com falha do roteador.", "Visita técnica desnecessária agendada.", "Seguir o material de rede antes de agendar visita.", 14],
    [-40, "RECOGNITION", "Classificação de rede", "Classificou corretamente todos os chamados de rede da semana.", "Nenhuma reclassificação.", null, null],
    [-12, "BEHAVIOR", "Atendimento enterprise", "Fez o primeiro atendimento enterprise com calma, mesmo com o cliente irritado.", "Cliente encerrou a ligação satisfeito.", null, null],
  ],
  otavio: [
    [-110, "DEVELOPMENT", "Triagem", "Classificou como Alta chamados de um único cliente pequeno.", "Fila de Alta inflada; chamados críticos de verdade esperaram.", "Reler o critério de prioridade antes de classificar.", 14],
    [-77, "TECHNICAL", "Atendimento por telefone", "Resolveu a troca de senha pelo telefone sem abrir chamado.", "Atendimento sem registro.", "Todo atendimento por telefone vira chamado.", 7],
    [-52, "DEVELOPMENT", "Reclassificações", "Seguiu classificando urgência comercial como criticidade técnica.", "Supervisão reclassificou 1 em cada 2 chamados dele.", "Revisar com o Rafael os chamados de Alta toda sexta.", 21],
    [-27, "RECOGNITION", "Primeiro chamado sozinho", "Resolveu e documentou o primeiro chamado de integração sozinho.", "Artigo publicado na base.", null, null],
    [-6, "DEVELOPMENT", "Critério de prioridade", "Ainda superestima impacto quando o cliente insiste por telefone.", "Taxa de reclassificação segue acima do time.", "Perguntar quantos usuários estão parados antes de classificar.", 14],
  ],
}

function buildFeedbacks() {
  const rows: Prisma.FeedbackCreateManyInput[] = []
  for (const person of PEOPLE) {
    FEEDBACKS[person.key].forEach(([rawOffset, category, context, behavior, impact, guidance, followUpIn], i) => {
      const offset = weekday(rawOffset)
      const id = `seed_fb_${person.key}_${i + 1}`
      // Reconhecimento costuma ser compartilhado; o resto nasce privado.
      const visibility = category === "RECOGNITION" ? (chance(0.85) ? "SHARED" : "PRIVATE") : chance(0.15) ? "SHARED" : "PRIVATE"
      rows.push({
        teamId: TEAM_ID,
        id,
        memberId: memberId(person.key),
        date: day(offset),
        category,
        context,
        behavior,
        impact,
        guidance,
        followUpAt: followUpIn === null ? null : day(weekday(offset + followUpIn)),
        visibility,
        authorUserId: ownerId,
        createdAt: instant(offset, 17, 5),
        updatedAt: instant(offset, 17, 5),
      })
      timeline.push(
        timelineEventFor.feedback({
          id,
          memberId: memberId(person.key),
          date: instant(offset, 17, 0),
          category,
          behavior,
          impact,
          visibility,
          authorUserId: ownerId,
        }),
      )
    })
  }
  return rows
}

/* ═══════════════════════════════ Combinados ═══════════════════════════════ */

/** Probabilidade de cumprir no prazo ao longo do período (t de 0 a 1). */
const ON_TIME_PROFILE: Record<PersonKey, (t: number) => number> = {
  rafael: () => 1,
  camila: () => 0.85,
  diego: () => 0.8,
  priscila: () => 0.78,
  henrique: (t) => 0.9 - 0.25 * t, // 90% → 65%
  larissa: (t) => 0.6 + 0.3 * t, // 60% → 90%
  vinicius: () => 0.75,
  beatriz: () => 0.72,
  otavio: () => 0.7,
}
/**
 * Agenda explícita para quem tem curva narrativa: com 10 a 16 combinados por
 * pessoa, sortear por probabilidade não garante a curva. [criado, prazo, no prazo?]
 * Henrique: 100% nos quatro primeiros meses, 5/6 entre 60 e 31 dias atrás e 3/6 nos últimos 30
 * (queda de 33 pontos com ≥ 5 combinados vencidos em cada janela — dispara o
 * alerta de cumprimento em queda do P15).
 * Larissa: 50% nos dois primeiros meses, 67% nos dois seguintes, 100% nos dois últimos.
 */
const AGREEMENT_SCHEDULE: Partial<Record<PersonKey, [created: number, due: number, onTime: boolean][]>> = {
  henrique: [
    [-172, -164, true], [-150, -142, true], [-128, -120, true], [-106, -98, true],
    [-66, -59, true], [-62, -55, true], [-57, -50, true], [-52, -45, true], [-46, -39, false], [-41, -34, true],
    [-35, -28, true], [-31, -24, false], [-27, -20, true], [-22, -15, false], [-17, -10, true], [-13, -6, false],
  ],
  larissa: [
    [-176, -168, false], [-160, -152, true], [-146, -138, false], [-132, -124, true], [-118, -110, true], [-104, -96, true],
    [-88, -81, false], [-63, -56, true], [-60, -53, true], [-46, -39, true], [-32, -25, true], [-18, -11, true], [-6, 4, true],
  ],
}

/** Motivos mais prováveis de impeditivo por pessoa. */
const BLOCKER_BIAS: Partial<Record<PersonKey, BlockerReasonId[]>> = {
  henrique: ["seed_br_informacao", "seed_br_escopo", "seed_br_outro", "seed_br_volume"],
  diego: ["seed_br_terceiro", "seed_br_cliente"],
  priscila: ["seed_br_terceiro", "seed_br_informacao"],
}
const ALL_BLOCKERS = BLOCKER_REASONS.map((b) => b.id)

interface AgreementDraft {
  row: Prisma.AgreementCreateManyInput & { id: string; memberId: string; title: string; createdAt: Date }
  checkins: Prisma.AgreementCheckinCreateManyInput[]
}

function buildAgreements(dailies: DailyRow[], oneOnOnes: Partial<Record<PersonKey, { id: string; offset: number }[]>>) {
  const drafts: AgreementDraft[] = []
  let checkinSeq = 0
  const dailyOffsets = dailies.map((d) => d.offset)
  const dailyAt = (offset: number) => dailies.find((d) => d.offset === offset)
  /** Primeira daily estritamente depois de `after` e até `until` (inclusive). */
  const firstDaily = (after: number, until = 0) => dailyOffsets.find((o) => o > after && o <= until)
  const nearestDailyBefore = (offset: number) => [...dailyOffsets].reverse().find((o) => o <= offset)

  function checkin(agreementId: string, dailyOffset: number, outcome: "DONE" | "PARTIAL" | "NOT_DONE", personKey: PersonKey, reasonId?: BlockerReasonId, newDue?: number) {
    const daily = dailyAt(dailyOffset)
    if (!daily) throw new Error(`Sem daily em ${dailyOffset}`)
    const reason = outcome === "DONE" ? undefined : (reasonId ?? pick(BLOCKER_BIAS[personKey] ?? ALL_BLOCKERS))
    return {
      teamId: TEAM_ID,
      id: `seed_ci_${String(++checkinSeq).padStart(3, "0")}`,
      agreementId,
      dailyId: daily.id,
      outcome,
      blockerText: reason ? pick(BLOCKER_TEXTS[reason]) : null,
      blockerReasonId: reason ?? null,
      newDueDate: newDue === undefined ? null : day(newDue),
      authorUserId: ownerId,
      createdAt: instant(dailyOffset, 9, 40),
    } satisfies Prisma.AgreementCheckinCreateManyInput
  }

  for (const person of PEOPLE) {
    const titles = AGREEMENT_TITLES[person.key]
    const n = titles.length
    let accumulator = 0.5 // distribui os acertos de forma exata, não por sorteio
    const schedule = AGREEMENT_SCHEDULE[person.key]
    if (schedule && schedule.length !== n) throw new Error(`Agenda de ${person.key} com ${schedule.length} itens para ${n} títulos`)
    titles.forEach((title, i) => {
      const t = n === 1 ? 0 : i / (n - 1)
      const id = `seed_ag_${person.key}_${i + 1}`
      const planned = schedule?.[i]
      const createdOffset = nearestDailyBefore(planned ? planned[0] : -176 + Math.round(t * 170)) ?? -176
      const origin = chance(0.6)
        ? "DAILY"
        : pick(["ONE_ON_ONE", "MEETING", "INCIDENT", "MANAGER", "FEEDBACK"] as const)
      const source1on1 = origin === "ONE_ON_ONE" ? oneOnOnes[person.key]?.find((o) => Math.abs(o.offset - createdOffset) < 25) : undefined
      const effectiveOrigin = origin === "ONE_ON_ONE" && !source1on1 ? "MANAGER" : origin
      const originalDue = planned ? weekday(planned[1]) : weekday(createdOffset + between(4, 12))
      const priority = chance(0.2) ? "HIGH" : chance(0.15) ? "LOW" : "NORMAL"

      const row: AgreementDraft["row"] = {
        teamId: TEAM_ID,
        id,
        memberId: memberId(person.key),
        title,
        description: null,
        origin: effectiveOrigin,
        sourceDailyId: effectiveOrigin === "DAILY" ? (dailyAt(createdOffset)?.id ?? null) : null,
        sourceOneOnOneId: source1on1?.id ?? null,
        createdAt: instant(createdOffset, 9, 35),
        originalDueDate: day(originalDue),
        dueDate: day(originalDue),
        priority,
        status: "OPEN",
        authorUserId: ownerId,
        updatedAt: instant(createdOffset, 9, 35),
      }
      const draft: AgreementDraft = { row, checkins: [] }
      drafts.push(draft)

      if (originalDue >= 0) {
        // Ainda no prazo: aberto ou em andamento.
        row.status = chance(0.5) ? "IN_PROGRESS" : "OPEN"
        return
      }

      let onTime: boolean
      if (planned) {
        onTime = planned[2]
      } else {
        accumulator += ON_TIME_PROFILE[person.key](t)
        onTime = accumulator >= 1
        if (onTime) accumulator -= 1
      }

      if (onTime) {
        const doneAt = firstDaily(createdOffset, originalDue)
        if (doneAt !== undefined && chance(0.4)) {
          draft.checkins.push(checkin(id, doneAt, "DONE", person.key))
          row.completedAt = day(doneAt)
        } else {
          row.completedAt = day(weekday(originalDue - between(0, 2)))
        }
        row.status = "DONE"
        row.outcome = pick(AGREEMENT_OUTCOMES)
        return
      }

      // Atrasado: 1 ou 2 reagendamentos, depois concluído (ou ainda aberto).
      let due = originalDue
      const reschedules = chance(0.7) ? 1 : 2
      for (let r = 0; r < reschedules; r++) {
        const when = firstDaily(due - 1)
        if (when === undefined) break
        const newDue = weekday(when + between(4, 8))
        draft.checkins.push(checkin(id, when, chance(0.5) ? "PARTIAL" : "NOT_DONE", person.key, undefined, newDue))
        due = newDue
      }
      row.dueDate = day(due)
      const doneAt = firstDaily(due - 1)
      if (doneAt !== undefined) {
        draft.checkins.push(checkin(id, doneAt, "DONE", person.key))
        row.completedAt = day(doneAt)
        row.status = "DONE"
        row.outcome = pick(AGREEMENT_OUTCOMES)
      } else {
        row.status = due < 0 ? "OPEN" : "IN_PROGRESS"
      }
    })
  }

  /* ── Diego: um combinado arrastado 4 vezes, sempre por dependência de terceiro ── */
  {
    const id = "seed_ag_diego_erp"
    const createdOffset = nearestDailyBefore(-44) ?? -44
    let due = weekday(createdOffset + 7)
    const row: AgreementDraft["row"] = {
      teamId: TEAM_ID,
      id,
      memberId: memberId("diego"),
      title: "Validar com o fornecedor do ERP o retorno da API de notas fiscais",
      description: "Cliente Rota Sul está emitindo nota em contingência desde a atualização. Depende do fornecedor liberar a correção.",
      origin: "DAILY",
      sourceDailyId: dailyAt(createdOffset)?.id ?? null,
      createdAt: instant(createdOffset, 9, 35),
      originalDueDate: day(due),
      dueDate: day(due),
      priority: "HIGH",
      status: "IN_PROGRESS",
      authorUserId: ownerId,
      updatedAt: instant(createdOffset, 9, 35),
    }
    const draft: AgreementDraft = { row, checkins: [] }
    for (let r = 0; r < 4; r++) {
      const when = firstDaily(due - 1)
      if (when === undefined) throw new Error("Faltam dailies para o arrasto do Diego")
      const newDue = r === 3 ? weekday(Math.max(when + 6, 3)) : weekday(when + 5)
      draft.checkins.push(checkin(id, when, "NOT_DONE", "diego", "seed_br_terceiro", newDue))
      due = newDue
    }
    row.dueDate = day(due)
    drafts.push(draft)
  }

  /* ── Priscila: dois combinados vencidos há mais de 40 dias, esquecidos ── */
  for (const [i, spec] of [
    { created: -62, due: -46, title: "Abrir a garantia dos 2 notebooks da secretaria de saúde" },
    { created: -58, due: -43, title: "Enviar ao fornecedor a lista de terminais com defeito do cliente Bom Preço" },
  ].entries()) {
    const createdOffset = nearestDailyBefore(spec.created) ?? spec.created
    drafts.push({
      row: {
        teamId: TEAM_ID,
        id: `seed_ag_priscila_vencido_${i + 1}`,
        memberId: memberId("priscila"),
        title: spec.title,
        description: null,
        origin: "DAILY",
        sourceDailyId: dailyAt(createdOffset)?.id ?? null,
        createdAt: instant(createdOffset, 9, 35),
        originalDueDate: day(weekday(spec.due)),
        dueDate: day(weekday(spec.due)),
        priority: "NORMAL",
        status: "OPEN",
        authorUserId: ownerId,
        updatedAt: instant(createdOffset, 9, 35),
      },
      checkins: [],
    })
  }

  /* ── Dois combinados substituídos (escopo mudou), via replacesAgreementId ── */
  const replacements = [
    {
      person: "camila" as const,
      old: { created: -95, due: -85, title: "Reescrever todos os artigos de NFC-e" },
      neu: { created: -84, due: -74, title: "Reescrever só os 3 artigos de NFC-e com mais reabertura", doneAt: -76 },
    },
    {
      person: "vinicius" as const,
      old: { created: -50, due: -40, title: "Documentar a configuração de todas as impressoras de rede" },
      neu: { created: -39, due: 4, title: "Documentar a impressora de rede do modelo usado por 80% dos clientes", doneAt: null },
    },
  ]
  replacements.forEach(({ person, old, neu }, i) => {
    const oldId = `seed_ag_${person}_substituido_${i + 1}`
    const oldCreated = nearestDailyBefore(old.created) ?? old.created
    const newCreated = nearestDailyBefore(neu.created) ?? neu.created
    drafts.push({
      row: {
        teamId: TEAM_ID,
        id: oldId,
        memberId: memberId(person),
        title: old.title,
        description: null,
        origin: "DAILY",
        sourceDailyId: dailyAt(oldCreated)?.id ?? null,
        createdAt: instant(oldCreated, 9, 35),
        originalDueDate: day(weekday(old.due)),
        dueDate: day(weekday(old.due)),
        priority: "NORMAL",
        status: "CANCELLED",
        outcome: "Escopo grande demais para o prazo; substituído por um recorte menor.",
        authorUserId: ownerId,
        updatedAt: instant(newCreated, 9, 35),
      },
      checkins: [],
    })
    drafts.push({
      row: {
        teamId: TEAM_ID,
        id: `seed_ag_${person}_substituto_${i + 1}`,
        memberId: memberId(person),
        title: neu.title,
        description: "Substitui o combinado anterior com escopo reduzido.",
        origin: "DAILY",
        sourceDailyId: dailyAt(newCreated)?.id ?? null,
        createdAt: instant(newCreated, 9, 40),
        originalDueDate: day(weekday(neu.due)),
        dueDate: day(weekday(neu.due)),
        priority: "NORMAL",
        status: neu.doneAt === null ? "IN_PROGRESS" : "DONE",
        completedAt: neu.doneAt === null ? null : day(weekday(neu.doneAt)),
        outcome: neu.doneAt === null ? null : "Três artigos revisados e publicados.",
        replacesAgreementId: oldId,
        authorUserId: ownerId,
        updatedAt: instant(newCreated, 9, 40),
      },
      checkins: [],
    })
  })

  // Trabalho em dupla: alguns combinados têm participante além do responsável.
  const participants: Prisma.AgreementParticipantCreateManyInput[] = []
  const pairs: [string, PersonKey][] = [
    ["seed_ag_larissa_6", "camila"],
    ["seed_ag_henrique_2", "rafael"],
    ["seed_ag_beatriz_2", "priscila"],
    ["seed_ag_beatriz_4", "larissa"],
    ["seed_ag_vinicius_1", "diego"],
    ["seed_ag_otavio_2", "rafael"],
  ]
  for (const [agreementId, person] of pairs) {
    if (drafts.some((d) => d.row.id === agreementId)) participants.push({ teamId: TEAM_ID, agreementId, memberId: memberId(person) })
  }

  for (const { row } of drafts) {
    const base = {
      id: row.id,
      memberId: row.memberId,
      title: row.title,
      description: row.description ?? null,
      origin: row.origin,
      createdAt: row.createdAt,
      completedAt: (row.completedAt as Date | null | undefined) ?? null,
      outcome: row.outcome ?? null,
      authorUserId: ownerId,
    }
    timeline.push(timelineEventFor.agreementCreated(base))
    if (base.completedAt) timeline.push(timelineEventFor.agreementDone({ ...base, completedAt: base.completedAt }))
  }

  return {
    agreements: drafts.map((d) => d.row),
    checkins: drafts.flatMap((d) => d.checkins),
    participants,
  }
}

/* ═══════════════════════════ Pessoas: detalhes ═══════════════════════════ */

const TRAITS: Record<PersonKey, [kind: "STRENGTH" | "DEVELOPMENT", text: string, offset: number, active: boolean][]> = {
  rafael: [
    ["STRENGTH", "Diagnóstico rápido em incidente, lendo log antes de opinar.", -170, true],
    ["STRENGTH", "Explica causa raiz para cliente sem jargão.", -60, true],
    ["DEVELOPMENT", "Responde pelos outros na daily em vez de deixar falarem.", -97, true],
  ],
  camila: [
    ["STRENGTH", "Escrita clara e revisão cuidadosa de artigos.", -155, true],
    ["STRENGTH", "Mentoria paciente com quem chega.", -45, true],
    ["DEVELOPMENT", "Passagem de chamados antes de ausências.", -108, false],
  ],
  diego: [
    ["STRENGTH", "Resolve por acesso remoto o que outros mandariam para visita.", -162, true],
    ["DEVELOPMENT", "Cobra pouco fornecedor e deixa o cliente sem notícia.", -64, true],
  ],
  priscila: [
    ["STRENGTH", "Domina os contratos públicos e os prazos de auditoria.", -171, true],
    ["STRENGTH", "Material de apoio bem feito para quem está aprendendo.", -88, true],
    ["DEVELOPMENT", "Deixa combinados antigos sem atualização.", -28, true],
  ],
  henrique: [
    ["STRENGTH", "Conhece bem o histórico do cliente Mercantil.", -150, true],
    ["DEVELOPMENT", "Leitura de log e diagnóstico com evidência.", -160, true],
    ["DEVELOPMENT", "Encerra chamado sem causa identificada.", -160, true],
  ],
  larissa: [
    ["DEVELOPMENT", "Respostas longas demais para o cliente.", -176, false],
    ["STRENGTH", "Iniciativa: criou o checklist de impressora fiscal.", -96, true],
    ["STRENGTH", "Escrita objetiva, elogiada por cliente.", -48, true],
    ["STRENGTH", "Ensina deixando a outra pessoa executar.", -16, true],
  ],
  vinicius: [
    ["STRENGTH", "Velocidade em chamados simples.", -115, true],
    ["DEVELOPMENT", "Classifica pelo caminho mais rápido, não pelo problema.", -152, true],
    ["DEVELOPMENT", "Guarda dúvidas em vez de perguntar.", -84, true],
  ],
  beatriz: [
    ["STRENGTH", "Calma com cliente irritado.", -12, true],
    ["DEVELOPMENT", "Conectividade e redes.", -138, true],
  ],
  otavio: [
    ["STRENGTH", "Disposição para aprender; pede para acompanhar plantão.", -100, true],
    ["DEVELOPMENT", "Superestima impacto quando o cliente insiste.", -52, true],
  ],
}

const MEMBER_RESPONSIBILITIES: Record<PersonKey, [id: string, primary: boolean][]> = {
  rafael: [["seed_rs_n2", true], ["seed_rs_enterprise", false], ["seed_rs_triagem", false]],
  camila: [["seed_rs_kb", true], ["seed_rs_onboarding", false], ["seed_rs_erp", false]],
  diego: [["seed_rs_erp", true], ["seed_rs_plantao", false]],
  priscila: [["seed_rs_publico", true], ["seed_rs_hardware", false]],
  henrique: [["seed_rs_sla", true], ["seed_rs_reaberturas", false]],
  larissa: [["seed_rs_hardware", true], ["seed_rs_enterprise", false]],
  vinicius: [["seed_rs_telefone", true], ["seed_rs_plantao", false]],
  beatriz: [["seed_rs_telefone", true]],
  otavio: [["seed_rs_triagem", true]],
}

/** Nível atual por competência, na ordem de COMPETENCIES. Larissa já no nível de Pleno. */
const COMPETENCY_LEVELS: Record<PersonKey, number[]> = {
  rafael: [4, 5, 4, 4, 5, 5, 5, 4, 4, 4],
  camila: [3, 4, 4, 4, 3, 3, 3, 3, 3, 4],
  diego: [4, 3, 3, 4, 3, 3, 3, 3, 4, 3],
  priscila: [4, 3, 3, 3, 3, 2, 4, 3, 3, 3],
  henrique: [3, 2, 3, 2, 2, 2, 3, 3, 3, 2],
  larissa: [3, 3, 3, 3, 3, 3, 3, 3, 2, 3],
  vinicius: [2, 2, 2, 2, 1, 1, 1, 2, 2, 2],
  beatriz: [2, 2, 2, 1, 1, 1, 1, 2, 1, 2],
  otavio: [1, 2, 1, 1, 1, 1, 1, 1, 1, 2],
}

const MENTORSHIPS: [mentor: PersonKey, mentee: PersonKey, competency: CompetencyId | null, start: number, end: number | null, note: string][] = [
  ["camila", "larissa", "seed_cp_escrita", -170, -40, "Revisão semanal de respostas escritas."],
  ["camila", "otavio", "seed_cp_escrita", -110, null, "Atendimento por telefone e registro de chamado."],
  ["diego", "vinicius", "seed_cp_redes", -150, null, "Chamados de rede com casos reais da fila."],
  ["priscila", "beatriz", "seed_cp_redes", -135, null, "Material de rede e primeiro atendimento enterprise."],
  ["larissa", "beatriz", "seed_cp_hardware", -30, null, "Checklist de impressora fiscal."],
  ["rafael", "henrique", "seed_cp_log", -160, null, "Leitura de log de sincronização."],
  ["rafael", "diego", "seed_cp_critico", -120, -60, "Condução de reunião de causa raiz com cliente."],
  ["rafael", "priscila", "seed_cp_escalonamento", -100, null, "Critério de escalonamento para infra."],
]

const PROMOTIONS: [person: PersonKey, from: SeniorityKey, to: SeniorityKey, offset: number, reason: string][] = [
  ["rafael", "PLENO", "SENIOR", -140, "Conduz incidentes e mentoria do time há dois ciclos; competências no nível Sênior em todas as avaliações."],
  ["priscila", "JUNIOR", "PLENO", -110, "Assumiu sozinha os contratos públicos e fechou o semestre sem apontamento de auditoria."],
]

interface PlanSpec {
  person: PersonKey
  competency: CompetencyId | null
  currentSituation: string
  objective: string
  expectedEvidence: string
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "DONE" | "CANCELLED"
  started: number
  due: number | null
  completed: number | null
  lastReviewed: number | null
  progressNote: string | null
  actions: [description: string, owner: "MEMBER" | "MANAGER" | "MENTOR", mentor: PersonKey | null, due: number | null, status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED", completed: number | null][]
}

const PLANS: PlanSpec[] = [
  {
    person: "larissa", competency: "seed_cp_escrita", status: "DONE", started: -175, due: -100, completed: -98, lastReviewed: -98,
    currentSituation: "Respostas longas, com detalhe técnico que o cliente não pediu.",
    objective: "Responder clientes em até três parágrafos objetivos.",
    expectedEvidence: "Nenhuma resposta devolvida pelo cliente pedindo esclarecimento por um mês.",
    progressNote: "Concluído: clientes passaram a elogiar a clareza.",
    actions: [
      ["Revisar 5 respostas por semana com a Camila", "MENTOR", "camila", -120, "DONE", -118],
      ["Adotar o modelo de três parágrafos", "MEMBER", null, -140, "DONE", -138],
    ],
  },
  {
    person: "larissa", competency: "seed_cp_autonomia", status: "ACTIVE", started: -95, due: 20, completed: null, lastReviewed: -6,
    currentSituation: "Fecha chamados de integração, mas ainda chama ajuda em cliente enterprise.",
    objective: "Conduzir atendimentos enterprise do início ao fim sem acompanhamento.",
    expectedEvidence: "Três atendimentos enterprise conduzidos sozinha com nota 4 ou 5.",
    progressNote: "Duas de três evidências; falta um atendimento enterprise.",
    actions: [
      ["Acompanhar a Camila em dois atendimentos enterprise", "MEMBER", null, -70, "DONE", -68],
      ["Conduzir sozinha o atendimento enterprise da Atlas", "MEMBER", null, -35, "DONE", -31],
      ["Escrever o artigo de leitor de código de barras", "MEMBER", null, -10, "DONE", -12],
      ["Conduzir mais um atendimento enterprise sozinha", "MEMBER", null, 15, "IN_PROGRESS", null],
    ],
  },
  {
    person: "henrique", competency: "seed_cp_log", status: "ACTIVE", started: -158, due: -40, completed: null, lastReviewed: -82,
    currentSituation: "Depende do Rafael para ler log de sincronização e diagnosticar lentidão.",
    objective: "Diagnosticar com evidência os chamados de lentidão do cliente Mercantil.",
    expectedEvidence: "Dois diagnósticos fechados com causa identificada no log.",
    progressNote: "Sem avanço desde o último acompanhamento.",
    actions: [
      ["Concluir o módulo de logs do curso interno", "MEMBER", null, -120, "OPEN", null],
      ["Ler logs de sincronização com o Rafael toda quinta", "MENTOR", "rafael", -100, "IN_PROGRESS", null],
      ["Fechar o diagnóstico do cliente Mercantil", "MEMBER", null, -60, "OPEN", null],
    ],
  },
  {
    person: "rafael", competency: "seed_cp_critico", status: "DONE", started: -180, due: -120, completed: -125, lastReviewed: -125,
    currentSituation: "Já atende bem cliente crítico; falta conduzir reunião de causa raiz.",
    objective: "Conduzir reuniões de causa raiz com cliente enterprise.",
    expectedEvidence: "Duas reuniões conduzidas com ata enviada ao cliente.",
    progressNote: "Concluído antes da promoção.",
    actions: [["Conduzir a reunião de causa raiz do incidente do gateway", "MEMBER", null, -150, "DONE", -155]],
  },
  {
    person: "rafael", competency: null, status: "DRAFT", started: -10, due: null, completed: null, lastReviewed: null,
    currentSituation: "Faz mentoria informal de três pessoas sem agenda definida.",
    objective: "Estruturar a mentoria técnica do time.",
    expectedEvidence: "Agenda quinzenal de mentoria acordada com cada mentorado.",
    progressNote: null,
    actions: [["Propor formato de mentoria quinzenal", "MEMBER", null, 20, "OPEN", null]],
  },
  {
    person: "camila", competency: "seed_cp_escalonamento", status: "ACTIVE", started: -70, due: 30, completed: null, lastReviewed: -12,
    currentSituation: "Escalona bem para o ERP, mas promete prazo antes de confirmar com o fornecedor.",
    objective: "Escalonar com prazo confirmado e comunicação ao cliente.",
    expectedEvidence: "Nenhum prazo prometido ao cliente sem confirmação do fornecedor por dois meses.",
    progressNote: "Melhorou; um deslize na reunião da Fortes.",
    actions: [
      ["Revisar o roteiro de escalonamento para o ERP", "MEMBER", null, -40, "DONE", -42],
      ["Registrar prazo do fornecedor no chamado antes de responder o cliente", "MEMBER", null, 10, "IN_PROGRESS", null],
    ],
  },
  {
    person: "camila", competency: "seed_cp_documentacao", status: "DONE", started: -170, due: -130, completed: -132, lastReviewed: -132,
    currentSituation: "Artigos de NFC-e desatualizados antes da mudança fiscal.",
    objective: "Revisar os artigos de NFC-e antes da mudança.",
    expectedEvidence: "Artigos publicados antes da data da mudança.",
    progressNote: "Concluído no prazo.",
    actions: [["Revisar os 8 artigos de NFC-e", "MEMBER", null, -140, "DONE", -150]],
  },
  {
    person: "diego", competency: "seed_cp_escalonamento", status: "ACTIVE", started: -60, due: 25, completed: null, lastReviewed: -20,
    currentSituation: "Espera o fornecedor sem cobrar e o cliente fica sem notícia.",
    objective: "Manter cliente e fornecedor atualizados em todo chamado dependente de terceiro.",
    expectedEvidence: "Atualização registrada a cada 3 dias nos chamados com fornecedor.",
    progressNote: "Cobrando o fornecedor do ERP com regularidade.",
    actions: [
      ["Cobrar o fornecedor a cada 3 dias e registrar no chamado", "MEMBER", null, null, "IN_PROGRESS", null],
      ["Revisar com o Rafael um chamado dependente de terceiro por semana", "MENTOR", "rafael", 10, "OPEN", null],
    ],
  },
  {
    person: "priscila", competency: "seed_cp_hardware", status: "ACTIVE", started: -120, due: 15, completed: null, lastReviewed: -30,
    currentSituation: "Abre garantia sem conferir dados e o fornecedor recusa.",
    objective: "Zerar recusas de garantia por erro de cadastro.",
    expectedEvidence: "Nenhuma garantia recusada por dado errado em dois meses.",
    progressNote: "Nenhuma recusa desde agosto; faltam os combinados antigos.",
    actions: [
      ["Criar checklist de abertura de garantia", "MEMBER", null, -90, "DONE", -92],
      ["Revisar as garantias pendentes com o fornecedor", "MEMBER", null, -40, "OPEN", null],
    ],
  },
  {
    person: "priscila", competency: "seed_cp_critico", status: "PAUSED", started: -80, due: null, completed: null, lastReviewed: -60,
    currentSituation: "Quer conduzir reunião de causa raiz com a prefeitura.",
    objective: "Conduzir a próxima reunião trimestral do contrato da prefeitura.",
    expectedEvidence: "Ata da reunião enviada pela própria Priscila.",
    progressNote: "Pausado até a próxima reunião trimestral.",
    actions: [["Acompanhar o Rafael na reunião de causa raiz", "MENTOR", "rafael", null, "OPEN", null]],
  },
  {
    person: "vinicius", competency: "seed_cp_redes", status: "ACTIVE", started: -145, due: 10, completed: null, lastReviewed: -16,
    currentSituation: "Classifica chamados de rede como senha para fechar rápido.",
    objective: "Diagnosticar e classificar corretamente chamados de rede simples.",
    expectedEvidence: "Uma quinzena sem reclassificação de chamado de rede.",
    progressNote: "Uma semana sem reclassificação; manter mais uma.",
    actions: [
      ["Estudar o material de rede com o Diego", "MENTOR", "diego", -100, "DONE", -98],
      ["Documentar a configuração de impressora de rede", "MEMBER", null, -45, "DONE", -47],
      ["Classificar sozinho os chamados de rede por duas semanas", "MEMBER", null, 5, "IN_PROGRESS", null],
    ],
  },
  {
    person: "vinicius", competency: "seed_cp_fila", status: "CANCELLED", started: -160, due: -120, completed: null, lastReviewed: -130,
    currentSituation: "Fila pessoal acima de 30 chamados.",
    objective: "Manter a fila pessoal abaixo de 15 chamados.",
    expectedEvidence: "Quatro semanas abaixo de 15 chamados.",
    progressNote: "Cancelado: a fila foi redistribuída com a entrada do Otávio.",
    actions: [["Separar blocos de atendimento por telefone", "MEMBER", null, -140, "CANCELLED", null]],
  },
  {
    person: "beatriz", competency: "seed_cp_redes", status: "ACTIVE", started: -130, due: 20, completed: null, lastReviewed: -38,
    currentSituation: "Confunde falha de DNS com problema de roteador.",
    objective: "Diagnosticar chamados simples de rede sem agendar visita desnecessária.",
    expectedEvidence: "Nenhuma visita técnica desnecessária por um mês.",
    progressNote: "Classificação de rede correta nas últimas semanas.",
    actions: [
      ["Estudar o material de rede da Priscila", "MENTOR", "priscila", -100, "DONE", -102],
      ["Fazer o primeiro atendimento enterprise acompanhada", "MEMBER", null, -15, "DONE", -12],
      ["Aplicar o checklist de rede em todos os chamados da quinzena", "MEMBER", null, 10, "IN_PROGRESS", null],
    ],
  },
  {
    person: "otavio", competency: "seed_cp_priorizacao", status: "ACTIVE", started: -58, due: 30, completed: null, lastReviewed: -9,
    currentSituation: "Metade dos chamados que classifica como Alta é reclassificada pela supervisão.",
    objective: "Aplicar o critério de prioridade sem confundir urgência comercial com criticidade.",
    expectedEvidence: "Taxa de reclassificação próxima à do time por um mês.",
    progressNote: "Melhorou nas duas últimas semanas, ainda acima do time.",
    actions: [
      ["Reler o critério de prioridade de chamado", "MEMBER", null, -50, "DONE", -52],
      ["Revisar com o Rafael os chamados classificados como Alta toda sexta", "MENTOR", "rafael", null, "IN_PROGRESS", null],
      ["Perguntar quantos usuários estão parados antes de classificar", "MEMBER", null, 15, "IN_PROGRESS", null],
    ],
  },
]

/* ═══════════════════════ Validação de prioridade ═══════════════════════ */

/** [quantidade, taxa de alteração] nos últimos 90 dias. */
const VALIDATION_PROFILE: Record<PersonKey, [count: number, changeRate: number]> = {
  rafael: [22, 0.05],
  camila: [18, 0.11],
  diego: [18, 0.11],
  priscila: [17, 0.12],
  henrique: [17, 0.18],
  larissa: [20, 0.15],
  vinicius: [22, 0.2],
  beatriz: [20, 0.2],
  otavio: [26, 0.5],
}
const VALIDATION_NOTES = [
  "Um único cliente afetado, com contingência manual.",
  "Loja inteira sem emitir nota; mantém crítica.",
  "Cliente insistiu por telefone, mas o sistema está operando.",
  "Afeta todos os caixas da rede; sobe para crítica.",
  "Falta print e horário do erro.",
  null,
  null,
  null,
]

function buildValidations() {
  const rows: Prisma.PriorityValidationCreateManyInput[] = []
  const days = workdays.filter((o) => o >= -89 && o <= 0)
  // Ausência do gestor: só um terço das validações no período.
  const weightOf = (o: number) => (inAway(o) ? 0.3 : 1)
  const totalWeight = days.reduce((s, o) => s + weightOf(o), 0)
  let ticket = 48210
  let seq = 0

  const levelByRank = (rank: number) => {
    const level = PRIORITY_LEVELS.find((l) => l.rank === rank)
    if (!level) throw new Error(`rank ${rank}`)
    return level
  }

  // Monta a agenda: cada validação recebe um dia útil ponderado.
  const agenda: { person: PersonKey; offset: number }[] = []
  for (const person of PEOPLE) {
    const [count] = VALIDATION_PROFILE[person.key]
    for (let i = 0; i < count; i++) {
      let r = rng() * totalWeight
      let chosen = at(days, days.length - 1)
      for (const o of days) {
        r -= weightOf(o)
        if (r <= 0) {
          chosen = o
          break
        }
      }
      agenda.push({ person: person.key, offset: chosen })
    }
  }
  agenda.sort((a, b) => a.offset - b.offset)

  const changesByPerson: Partial<Record<PersonKey, { done: number; acc: number }>> = {}
  for (const { person, offset } of agenda) {
    const [, rate] = VALIDATION_PROFILE[person]
    const state = (changesByPerson[person] ??= { done: 0, acc: 0.5 })
    state.acc += rate
    const changed = state.acc >= 1
    if (changed) state.acc -= 1

    // Otávio infla a prioridade; o resto do time classifica de forma mais equilibrada.
    const analystRank =
      person === "otavio"
        ? pick([4, 3, 3, 3, 2, 2])
        : pick([1, 1, 2, 2, 2, 2, 3, 3, 4])
    const analyst = levelByRank(analystRank)
    const id = `seed_pv_${String(++seq).padStart(3, "0")}`
    ticket += between(3, 40)
    const validatedAt = instant(offset, between(8, 17), between(0, 59))

    let outcome: "MAINTAINED" | "RAISED" | "LOWERED" | "RETURNED" = "MAINTAINED"
    let supervisorRank: number | null = analystRank
    let reasonId: string | null = null

    if (changed) {
      if (chance(0.1)) {
        outcome = "RETURNED"
        supervisorRank = null
        reasonId = REASON.noEvidence
      } else if (person === "otavio") {
        if (analystRank > 1 && (analystRank === 4 || chance(0.85))) {
          outcome = "LOWERED"
          supervisorRank = analystRank - between(1, Math.min(2, analystRank - 1))
          reasonId = chance(0.75) ? REASON.overestimated : pick([REASON.commercialUrgency, REASON.singleClient])
        } else {
          outcome = "RAISED"
          supervisorRank = Math.min(4, analystRank + 1)
          reasonId = REASON.underestimated
        }
      } else {
        const canRaise = analystRank < 4
        const canLower = analystRank > 1
        const raise = canRaise && (!canLower || chance(0.5))
        outcome = raise ? "RAISED" : "LOWERED"
        supervisorRank = raise ? analystRank + 1 : analystRank - 1
        reasonId = raise
          ? pick([REASON.underestimated, REASON.noContingency, REASON.wrongCriteria])
          : pick([REASON.overestimated, REASON.singleClient, REASON.commercialUrgency, REASON.wrongCriteria])
      }
    }

    const supervisor = supervisorRank === null ? null : levelByRank(supervisorRank)
    rows.push({
      teamId: TEAM_ID,
      id,
      organizationId: ORG_ID,
      ticketUrl: `https://helpdesk.exemplo.com.br/a/tickets/${ticket}`,
      ticketRef: String(ticket),
      memberId: memberId(person),
      analystPriorityId: analyst.id,
      supervisorPriorityId: supervisor?.id ?? null,
      analystRankSnapshot: analyst.rank,
      supervisorRankSnapshot: supervisor?.rank ?? null,
      outcome,
      reasonId,
      reasonOther: null,
      note: changed ? pick(VALIDATION_NOTES) : null,
      validatedAt,
      validatedByUserId: ownerId,
      createdAt: validatedAt,
      updatedAt: validatedAt,
    })
    state.done += changed ? 1 : 0
  }
  // Sem TimelineEvent para validação de prioridade (D15).
  return rows
}

/* ═══════════════════════════════ Execução ═══════════════════════════════ */

function ownerFromEnv(): { email: string; name: string } {
  const raw = process.env.ALLOWED_EMAILS ?? ""
  const email = raw.split(",").map((e) => e.trim()).find(Boolean)
  if (!email) {
    throw new Error("ALLOWED_EMAILS vazio: o seed usa o primeiro e-mail da allowlist como OWNER.")
  }
  const local = email.split("@")[0] ?? email
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
  return { email, name }
}

async function main() {
  const owner = ownerFromEnv()
  const started = Date.now()

  await prisma.$transaction(
    async (tx) => {
      /* ── 1. Remove os registros de demonstração anteriores (só ids seed_) ── */
      const seedId = { startsWith: "seed_" }
      await tx.agreementCheckin.deleteMany({ where: { id: seedId } })
      await tx.agreementParticipant.deleteMany({ where: { agreementId: seedId } })
      // Devolução registrada para pessoa de demonstração (P20) sai junto, senão a pessoa não sai.
      await tx.devReturn.deleteMany({ where: { memberId: seedId } })
      await tx.priorityValidation.deleteMany({ where: { id: seedId } })
      // Substituto aponta para o substituído: solta o vínculo antes de apagar.
      await tx.agreement.updateMany({ where: { id: seedId }, data: { replacesAgreementId: null } })
      await tx.agreement.deleteMany({ where: { id: seedId } }) // linhas da timeline saem em cascata
      await tx.daily.deleteMany({ where: { id: seedId } })
      await tx.oneOnOne.deleteMany({ where: { id: seedId } })
      await tx.feedback.deleteMany({ where: { id: seedId } })
      await tx.developmentPlan.deleteMany({ where: { id: seedId } })
      await tx.mentorshipLink.deleteMany({ where: { id: seedId } })
      await tx.memberChange.deleteMany({ where: { id: seedId } })
      await tx.memberTrait.deleteMany({ where: { id: seedId } })
      await tx.memberResponsibility.deleteMany({ where: { memberId: seedId } })
      await tx.memberCompetency.deleteMany({ where: { memberId: seedId } })
      await tx.teamMember.deleteMany({ where: { id: seedId } })

      /* ── 2. Organização, usuário, time e catálogos (upsert) ── */
      await tx.organization.upsert({
        where: { slug: "suporte" },
        create: { id: ORG_ID, name: "Suporte Técnico", slug: "suporte" },
        update: {},
      })
      const org = await tx.organization.findUniqueOrThrow({ where: { slug: "suporte" } })
      if (org.id !== ORG_ID) throw new Error("A organização 'suporte' existe com outro id; o seed não mistura dados reais.")

      const user = await tx.user.upsert({
        where: { email: owner.email },
        create: { email: owner.email, name: owner.name, role: "OWNER", isPlatformAdmin: true, organizationId: ORG_ID },
        update: {},
      })
      ownerId = user.id

      await tx.team.upsert({
        where: { id: TEAM_ID },
        create: { id: TEAM_ID, organizationId: ORG_ID, name: "Suporte N1/N2", slug: "suporte", managerUserId: ownerId },
        update: { managerUserId: ownerId },
      })
      // P22: o escopo vem de TeamAccess (D30). O OWNER do seed gere o time; todos os módulos ligados.
      await tx.teamAccess.upsert({
        where: { userId_teamId: { userId: ownerId, teamId: TEAM_ID } },
        create: { userId: ownerId, teamId: TEAM_ID, level: "MANAGER" },
        update: { revokedAt: null, level: "MANAGER" },
      })
      for (const moduleKey of MODULE_KEYS) {
        await tx.teamModule.upsert({
          where: { teamId_moduleKey: { teamId: TEAM_ID, moduleKey } },
          create: { teamId: TEAM_ID, moduleKey },
          update: { isEnabled: true },
        })
      }

      for (const s of SENIORITIES) {
        await tx.seniority.upsert({ where: { id: s.id }, create: { ...s, organizationId: ORG_ID, teamId: TEAM_ID }, update: { label: s.label, order: s.order } })
      }
      for (const [i, b] of BLOCKER_REASONS.entries()) {
        const data = { label: b.label, category: b.category, order: i + 1, isActive: true }
        await tx.blockerReason.upsert({ where: { id: b.id }, create: { id: b.id, organizationId: ORG_ID, teamId: TEAM_ID, ...data }, update: data })
      }
      for (const p of PRIORITY_LEVELS) {
        await tx.priorityLevel.upsert({ where: { id: p.id }, create: { ...p, organizationId: ORG_ID, teamId: TEAM_ID }, update: { label: p.label, rank: p.rank } })
      }
      for (const r of RECLASSIFICATION_REASONS) {
        await tx.reclassificationReason.upsert({ where: { id: r.id }, create: { ...r, organizationId: ORG_ID, teamId: TEAM_ID }, update: { label: r.label, order: r.order, requiresDetail: r.requiresDetail } })
      }
      // Motivos de devolução do desenvolvimento (P20): só num time sem nenhum
      // (a migration dev_returns já gravou o catálogo no time que existia).
      if ((await tx.devReturnReason.count({ where: { teamId: TEAM_ID } })) === 0) {
        await tx.devReturnReason.createMany({
          data: DEFAULT_DEV_RETURN_REASONS.map((r, i) => ({ id: `seed_drr_${i + 1}`, organizationId: ORG_ID, teamId: TEAM_ID, ...r, order: i + 1 })),
        })
      }
      for (const p of TICKET_URL_PATTERNS) {
        await tx.ticketUrlPattern.upsert({ where: { id: p.id }, create: { ...p, organizationId: ORG_ID, teamId: TEAM_ID }, update: { label: p.label, regex: p.regex } })
      }
      for (const c of COMPETENCIES) {
        await tx.competency.upsert({
          where: { id: c.id },
          create: { id: c.id, organizationId: ORG_ID, teamId: TEAM_ID, name: c.name, category: c.category },
          update: { name: c.name, category: c.category },
        })
        // A matriz de níveis esperados (CompetencyExpectation) NÃO é preenchida pelo
        // seed (P14): é decisão do gestor, em /settings.
      }
      for (const [id, name, description] of RESPONSIBILITIES) {
        await tx.responsibility.upsert({ where: { id }, create: { id, organizationId: ORG_ID, teamId: TEAM_ID, name, description }, update: { name, description } })
      }
      // Métricas de versões antigas do seed que saíram da lista (nunca tiveram resultado).
      await tx.metricDefinition.deleteMany({
        where: { id: { in: ["seed_md_frt", "seed_md_solved"] }, results: { none: {} }, scoreComponents: { none: {} } },
      })
      for (const m of METRIC_DEFINITIONS) {
        // Métricas cadastradas, sem nenhum MetricResult; nenhum ScoreDefinition ativo.
        const { id, ...fields } = m
        await tx.metricDefinition.upsert({
          where: { id },
          create: { ...m, organizationId: ORG_ID, teamId: TEAM_ID, sourceSystem: "helpdesk" },
          update: { label: fields.label, unit: fields.unit, direction: fields.direction },
        })
      }

      /* ── 3. Pessoas ── */
      await tx.teamMember.createMany({
        data: PEOPLE.map((p) => ({
          id: memberId(p.key),
          teamId: TEAM_ID,
          fullName: p.fullName,
          preferredName: p.preferredName,
          position: p.position,
          seniorityId: seniorityId(p.seniority),
          joinedAt: new Date(`${p.joinedAt}T00:00:00Z`),
          status: "ACTIVE",
          avatarSeed: p.key,
        })),
      })
      await tx.memberResponsibility.createMany({
        data: PEOPLE.flatMap((p) =>
          MEMBER_RESPONSIBILITIES[p.key].map(([responsibilityId, isPrimary]) => ({
            teamId: TEAM_ID,
            memberId: memberId(p.key),
            responsibilityId,
            isPrimary,
            assignedAt: day(-PERIOD_DAYS),
          })),
        ),
      })
      await tx.memberTrait.createMany({
        data: PEOPLE.flatMap((p) =>
          TRAITS[p.key].map(([kind, text, offset, isActive], i) => ({
            id: `seed_tr_${p.key}_${i + 1}`,
            teamId: TEAM_ID,
            memberId: memberId(p.key),
            kind,
            text,
            observedAt: day(weekday(offset)),
            isActive,
          })),
        ),
      })
      await tx.memberCompetency.createMany({
        data: PEOPLE.flatMap((p) =>
          COMPETENCIES.map((c, i) => ({
            teamId: TEAM_ID,
            memberId: memberId(p.key),
            competencyId: c.id,
            currentLevel: at(COMPETENCY_LEVELS[p.key], i),
            assessedAt: day(weekday(-between(10, 60))),
          })),
        ),
      })
      await tx.mentorshipLink.createMany({
        data: MENTORSHIPS.map(([mentor, mentee, competencyId, start, end, note], i) => ({
          id: `seed_ml_${i + 1}`,
          teamId: TEAM_ID,
          mentorMemberId: memberId(mentor),
          menteeMemberId: memberId(mentee),
          competencyId,
          startedAt: day(weekday(start)),
          endedAt: end === null ? null : day(weekday(end)),
          note,
        })),
      })

      const changes = PROMOTIONS.map(([person, from, to, offset, reason], i) => ({
        id: `seed_mc_${i + 1}`,
        teamId: TEAM_ID,
        memberId: memberId(person),
        changeType: "SENIORITY" as const,
        fromValue: from,
        toValue: to,
        effectiveAt: day(weekday(offset)),
        reason,
        authorUserId: ownerId,
      }))
      await tx.memberChange.createMany({ data: changes })
      const seniorityLabel = (key: string) => SENIORITIES.find((s) => s.key === key)?.label ?? key
      for (const c of changes) {
        timeline.push(
          timelineEventFor.memberChange({
            ...c,
            effectiveAt: instant(weekday(PROMOTIONS[changes.indexOf(c)]?.[3] ?? 0), 10),
            fromLabel: seniorityLabel(c.fromValue),
            toLabel: seniorityLabel(c.toValue),
          }),
        )
      }

      /* ── 4. Registros ── */
      const { dailies, participants, rows: dailyRows } = buildDailies()
      await tx.daily.createMany({ data: dailies })
      await tx.dailyParticipant.createMany({ data: participants })

      const { rows: oneOnOnes, byMember } = buildOneOnOnes()
      await tx.oneOnOne.createMany({ data: oneOnOnes })

      const feedbacks = buildFeedbacks()
      await tx.feedback.createMany({ data: feedbacks })

      const { agreements, checkins, participants: agreementParticipants } = buildAgreements(dailyRows, byMember)
      // Substitutos depois dos substituídos, por causa da FK autorreferente.
      await tx.agreement.createMany({ data: agreements.filter((a) => !a.replacesAgreementId) })
      await tx.agreement.createMany({ data: agreements.filter((a) => a.replacesAgreementId) })
      await tx.agreementCheckin.createMany({ data: checkins })
      await tx.agreementParticipant.createMany({ data: agreementParticipants })

      const plans: Prisma.DevelopmentPlanCreateManyInput[] = []
      const actions: Prisma.DevelopmentActionCreateManyInput[] = []
      PLANS.forEach((p, i) => {
        const id = `seed_pdi_${p.person}_${i + 1}`
        plans.push({
          id,
          teamId: TEAM_ID,
          memberId: memberId(p.person),
          competencyId: p.competency,
          currentSituation: p.currentSituation,
          objective: p.objective,
          expectedEvidence: p.expectedEvidence,
          status: p.status,
          startedAt: day(weekday(p.started)),
          dueDate: p.due === null ? null : day(weekday(p.due)),
          completedAt: p.completed === null ? null : day(weekday(p.completed)),
          progressNote: p.progressNote,
          lastReviewedAt: p.lastReviewed === null ? null : instant(weekday(p.lastReviewed), 16),
          createdAt: instant(weekday(p.started), 16),
          updatedAt: instant(weekday(p.lastReviewed ?? p.started), 16),
        })
        p.actions.forEach(([description, ownerType, mentor, due, status, completed], j) => {
          actions.push({
            id: `seed_pda_${p.person}_${i + 1}_${j + 1}`,
            teamId: TEAM_ID,
            planId: id,
            description,
            ownerType,
            ownerMemberId: ownerType === "MANAGER" ? null : memberId(mentor ?? p.person),
            dueDate: due === null ? null : day(weekday(due)),
            status,
            completedAt: completed === null ? null : day(weekday(completed)),
          })
        })
        timeline.push(
          timelineEventFor.developmentPlan({
            id,
            memberId: memberId(p.person),
            startedAt: instant(weekday(p.started), 16),
            objective: p.objective,
            currentSituation: p.currentSituation,
            authorUserId: ownerId,
          }),
        )
      })
      await tx.developmentPlan.createMany({ data: plans })
      await tx.developmentAction.createMany({ data: actions })

      const validations = buildValidations()
      await tx.priorityValidation.createMany({ data: validations })

      /* ── 5. Timeline: mesma função que a aplicação usa ── */
      await recordTimelineEvents(tx, { teamId: TEAM_ID }, timeline)

      const summary = {
        dailies: dailies.length,
        participantesComNota: participants.filter((p) => p.note).length,
        combinados: agreements.length,
        checkins: checkins.length,
        umAUm: oneOnOnes.length,
        feedbacks: feedbacks.length,
        pdis: plans.length,
        acoesDePdi: actions.length,
        mentorias: MENTORSHIPS.length,
        promocoes: changes.length,
        validacoes: validations.length,
        timeline: timeline.length,
      }
      console.log("Seed aplicado:", summary)
    },
    { timeout: 180_000, maxWait: 30_000 },
  )

  console.log(`Concluído em ${((Date.now() - started) / 1000).toFixed(1)}s.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
