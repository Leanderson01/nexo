import type { ArticleCondition } from "../src/domain/article";
import { buildArticleSearchText } from "./knowledge/searchTerms";
import type {
  Priority,
  TicketCategory,
  TicketKind,
  TicketStatus,
  TicketUpdateAuthor,
} from "../src/domain/enums";
import type { Person } from "../src/domain/person";
import type { PrioritySignals, TicketFieldChanges } from "../src/domain/ticket";

// Dados de demonstração (§4, com as decisões 1, 3 e 10 do TASKS.md).
// Toda data sai de "agora", para que "há 6 dias" seja verdade no dia em que o seed rodar.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function minutesAgo(now: number, minutes: number): number {
  return now - minutes * MINUTE;
}
export function hoursAgo(now: number, hours: number): number {
  return now - hours * HOUR;
}
export function daysAgo(now: number, days: number): number {
  return now - days * DAY;
}

// ---------- Pessoas (§4.1) ----------

export const SEED_PEOPLE: Person[] = [
  {
    name: "Mariana Costa",
    email: "mariana.costa@nexo.com.br",
    role: "employee",
    department: "Financeiro",
  },
  {
    name: "Rafael Lima",
    email: "rafael.lima@nexo.com.br",
    role: "employee",
    department: "Comercial",
  },
  {
    name: "Juliana Alves",
    email: "juliana.alves@nexo.com.br",
    role: "employee",
    department: "Marketing",
  },
  {
    name: "Pedro Santos",
    email: "pedro.santos@nexo.com.br",
    role: "employee",
    department: "Operações",
  },
  {
    name: "Ana Ribeiro",
    email: "ana.ribeiro@nexo.com.br",
    role: "analyst",
    department: "Service Desk",
    level: "N1",
  },
  {
    name: "Carlos Mendes",
    email: "carlos.mendes@nexo.com.br",
    role: "analyst",
    department: "Service Desk",
    level: "N2",
  },
];

// ---------- Chamados (§4.2) ----------

export interface SeedTicketUpdate {
  authorType: TicketUpdateAuthor;
  authorName?: string;
  text: string;
  fieldChanges?: TicketFieldChanges;
  createdAt: number;
}

export interface SeedTicket {
  code: string;
  ownerEmail: string;
  kind: TicketKind;
  category: TicketCategory;
  priority: Priority;
  priorityReason: string;
  prioritySignals: PrioritySignals;
  status: TicketStatus;
  title: string;
  description: string;
  affected: string;
  createdAt: number;
  /** Criação ou última atividade do suporte (§3.6). Atividade do funcionário não conta. */
  lastActivityAt: number;
  resolvedAt?: number;
  updates: SeedTicketUpdate[];
}

// Mesmos motivos da derivePriority (§3.5): o seed e o domínio falam a mesma língua.
const REASON_TEAM_BLOCKED = "Parado para uma equipe/empresa";
const REASON_PERSON_BLOCKED = "Impede uma pessoa de trabalhar";
const REASON_HAS_WORKAROUND = "Atrapalha, mas há alternativa";
const REASON_NO_URGENCY = "Pedido sem urgência";

const INDIVIDUAL_NOT_BLOCKED: PrioritySignals = {
  impact: "individual",
  blocked: false,
  deadlineToday: false,
};

export function buildSeedTickets(now: number): SeedTicket[] {
  return [
    {
      // Vencido: Média (30 h úteis) sem atividade do suporte há 6 dias.
      code: "INC-20311",
      ownerEmail: "mariana.costa@nexo.com.br",
      kind: "INC",
      category: "hardware",
      priority: "MEDIUM",
      priorityReason: REASON_HAS_WORKAROUND,
      prioritySignals: INDIVIDUAL_NOT_BLOCKED,
      status: "awaiting_analyst",
      title: "Notebook lento após atualização do Windows",
      description:
        "Depois da última atualização do Windows o notebook demora minutos para abrir o Excel e o navegador. Dá para trabalhar, mas com muita lentidão.",
      affected: "Somente você",
      createdAt: daysAgo(now, 8),
      lastActivityAt: daysAgo(now, 6),
      updates: [
        {
          authorType: "agent",
          text: "Chamado aberto pelo Nexo Assist a pedido da funcionária.",
          createdAt: daysAgo(now, 8),
        },
        {
          authorType: "analyst",
          authorName: "Ana Ribeiro",
          text: "Vou analisar os logs da atualização remotamente e retorno em seguida.",
          fieldChanges: { status: "awaiting_analyst" },
          createdAt: daysAgo(now, 6),
        },
        {
          authorType: "employee",
          text: "Continua igual. Hoje o notebook travou duas vezes durante o fechamento.",
          createdAt: daysAgo(now, 3),
        },
      ],
    },
    {
      // Decisão 3: atividade há 3 dias, para a REQ nunca aparecer vencida.
      code: "REQ-10442",
      ownerEmail: "mariana.costa@nexo.com.br",
      kind: "REQ",
      category: "hardware",
      priority: "LOW",
      priorityReason: REASON_NO_URGENCY,
      prioritySignals: INDIVIDUAL_NOT_BLOCKED,
      status: "approved",
      title: "Segundo monitor para home office",
      description:
        "Solicito um segundo monitor para o home office, para trabalhar com planilhas lado a lado.",
      affected: "Somente você",
      createdAt: daysAgo(now, 9),
      lastActivityAt: daysAgo(now, 3),
      updates: [
        {
          authorType: "agent",
          text: "Requisição aberta pelo Nexo Assist.",
          createdAt: daysAgo(now, 9),
        },
        {
          authorType: "analyst",
          authorName: "Carlos Mendes",
          text: "Aprovada pela gestora. O monitor será entregue em até 5 dias úteis.",
          fieldChanges: { status: "approved" },
          createdAt: daysAgo(now, 3),
        },
      ],
    },
    {
      // Reabrível: resolvido há 4 dias (o limite é 7).
      code: "INC-20150",
      ownerEmail: "mariana.costa@nexo.com.br",
      kind: "INC",
      category: "access",
      priority: "MEDIUM",
      priorityReason: REASON_HAS_WORKAROUND,
      prioritySignals: INDIVIDUAL_NOT_BLOCKED,
      status: "resolved",
      title: "Senha do SAP bloqueada",
      description:
        "A senha do SAP foi bloqueada depois de algumas tentativas. Consigo adiantar o trabalho pelo Excel enquanto isso.",
      affected: "Somente você",
      createdAt: daysAgo(now, 5),
      lastActivityAt: daysAgo(now, 4),
      resolvedAt: daysAgo(now, 4),
      updates: [
        {
          authorType: "agent",
          text: "Chamado aberto pelo Nexo Assist.",
          createdAt: daysAgo(now, 5),
        },
        {
          authorType: "analyst",
          authorName: "Ana Ribeiro",
          text: "Senha desbloqueada e redefinida. Use a senha temporária enviada por SMS.",
          fieldChanges: { status: "resolved" },
          createdAt: daysAgo(now, 4),
        },
      ],
    },
    {
      // No prazo: Alta com atividade há 1 hora.
      code: "INC-20402",
      ownerEmail: "rafael.lima@nexo.com.br",
      kind: "INC",
      category: "email",
      priority: "HIGH",
      priorityReason: REASON_PERSON_BLOCKED,
      prioritySignals: { impact: "individual", blocked: true, deadlineToday: false },
      status: "in_progress",
      title: "Outlook não sincroniza no celular",
      description:
        "O Outlook do celular parou de sincronizar desde ontem. Estou em visitas a clientes e dependo do e-mail no celular.",
      affected: "Somente você",
      createdAt: hoursAgo(now, 3),
      lastActivityAt: hoursAgo(now, 1),
      updates: [
        {
          authorType: "agent",
          text: "Chamado aberto pelo Nexo Assist.",
          createdAt: hoursAgo(now, 3),
        },
        {
          authorType: "analyst",
          authorName: "Carlos Mendes",
          text: "Encontrei um problema no registro do aparelho no MDM. Estou refazendo o vínculo.",
          fieldChanges: { status: "in_progress" },
          createdAt: hoursAgo(now, 1),
        },
      ],
    },
    {
      // Não reabrível: resolvido há 10 dias (passou do limite de 7).
      code: "INC-20077",
      ownerEmail: "rafael.lima@nexo.com.br",
      kind: "INC",
      category: "network_vpn",
      priority: "MEDIUM",
      priorityReason: REASON_HAS_WORKAROUND,
      prioritySignals: { impact: "team", blocked: false, deadlineToday: false },
      status: "resolved",
      title: "Wi-Fi caindo na sala de reunião 3",
      description:
        "O Wi-Fi cai várias vezes por hora na sala de reunião 3. Dá para usar o cabo, mas atrapalha as reuniões.",
      affected: "Equipe Comercial",
      createdAt: daysAgo(now, 12),
      lastActivityAt: daysAgo(now, 10),
      resolvedAt: daysAgo(now, 10),
      updates: [
        {
          authorType: "agent",
          text: "Chamado aberto pelo Nexo Assist.",
          createdAt: daysAgo(now, 12),
        },
        {
          authorType: "analyst",
          authorName: "Carlos Mendes",
          text: "Access point da sala 3 substituído. Sinal estável nos testes.",
          fieldChanges: { status: "resolved" },
          createdAt: daysAgo(now, 10),
        },
      ],
    },
    {
      // Prazo pausado: a bola está com a funcionária.
      code: "REQ-10510",
      ownerEmail: "juliana.alves@nexo.com.br",
      kind: "REQ",
      category: "access",
      priority: "LOW",
      priorityReason: REASON_NO_URGENCY,
      prioritySignals: INDIVIDUAL_NOT_BLOCKED,
      status: "awaiting_employee",
      title: "Acesso ao Figma",
      description: "Preciso de acesso ao Figma para revisar as peças da campanha com a agência.",
      affected: "Somente você",
      createdAt: daysAgo(now, 4),
      lastActivityAt: daysAgo(now, 2),
      updates: [
        {
          authorType: "agent",
          text: "Requisição aberta pelo Nexo Assist.",
          createdAt: daysAgo(now, 4),
        },
        {
          authorType: "analyst",
          authorName: "Ana Ribeiro",
          text: "Precisamos da aprovação da sua gestora por e-mail. Pode encaminhar ao service desk?",
          fieldChanges: { status: "awaiting_employee" },
          createdAt: daysAgo(now, 2),
        },
      ],
    },
    {
      code: "REQ-10498",
      ownerEmail: "juliana.alves@nexo.com.br",
      kind: "REQ",
      category: "software",
      priority: "LOW",
      priorityReason: REASON_NO_URGENCY,
      prioritySignals: INDIVIDUAL_NOT_BLOCKED,
      status: "open",
      title: "Instalação do Adobe Premiere",
      description:
        "Solicito a instalação do Adobe Premiere para editar os vídeos das redes sociais.",
      affected: "Somente você",
      createdAt: daysAgo(now, 1),
      lastActivityAt: daysAgo(now, 1),
      updates: [
        {
          authorType: "agent",
          text: "Requisição aberta pelo Nexo Assist. Software fora do catálogo: aguarda a aprovação do gestor.",
          createdAt: daysAgo(now, 1),
        },
      ],
    },
    {
      // Crítico no prazo; é o chamado da conversa transferida do Pedro (decisão 1).
      code: "INC-20420",
      ownerEmail: "pedro.santos@nexo.com.br",
      kind: "INC",
      category: "software",
      priority: "CRITICAL",
      priorityReason: REASON_TEAM_BLOCKED,
      prioritySignals: { impact: "team", blocked: true, deadlineToday: false },
      status: "in_progress",
      title: "Sistema de estoque fora do ar para a equipe",
      description:
        "O sistema de estoque não abre para ninguém da equipe de Operações. Não conseguimos dar baixa nos pedidos.",
      affected: "Equipe de Operações",
      createdAt: minutesAgo(now, 32),
      lastActivityAt: minutesAgo(now, 30),
      updates: [
        {
          authorType: "agent",
          text: "Chamado aberto pelo Nexo Assist após a confirmação do funcionário. Conversa transferida ao plantão.",
          createdAt: minutesAgo(now, 32),
        },
        {
          authorType: "analyst",
          authorName: "Carlos Mendes",
          text: "Plantão acionado. Investigando o servidor do sistema de estoque.",
          fieldChanges: { status: "in_progress" },
          createdAt: minutesAgo(now, 30),
        },
      ],
    },
    {
      // Privacidade: título parecido com o INC-20311 da Mariana.
      code: "INC-20388",
      ownerEmail: "pedro.santos@nexo.com.br",
      kind: "INC",
      category: "hardware",
      priority: "MEDIUM",
      priorityReason: REASON_HAS_WORKAROUND,
      prioritySignals: INDIVIDUAL_NOT_BLOCKED,
      status: "open",
      title: "Notebook lento ao abrir planilhas",
      description:
        "O notebook fica lento ao abrir planilhas grandes. Uso o computador da sala enquanto isso.",
      affected: "Somente você",
      createdAt: daysAgo(now, 1),
      lastActivityAt: daysAgo(now, 1),
      updates: [
        {
          authorType: "agent",
          text: "Chamado aberto pelo Nexo Assist.",
          createdAt: daysAgo(now, 1),
        },
      ],
    },
    {
      // Duplicidade: um novo relato da mesma impressora deve virar atualização deste.
      code: "INC-20395",
      ownerEmail: "pedro.santos@nexo.com.br",
      kind: "INC",
      category: "hardware",
      priority: "MEDIUM",
      priorityReason: REASON_HAS_WORKAROUND,
      prioritySignals: { impact: "team", blocked: false, deadlineToday: false },
      status: "open",
      title: "Impressora do 2º andar não imprime",
      description:
        "A impressora do 2º andar recebe os trabalhos, mas não imprime. A equipe está usando a do 3º andar.",
      affected: "Equipe de Operações",
      createdAt: daysAgo(now, 2),
      lastActivityAt: daysAgo(now, 2),
      updates: [
        {
          authorType: "agent",
          text: "Chamado aberto pelo Nexo Assist.",
          createdAt: daysAgo(now, 2),
        },
      ],
    },
  ];
}

// ---------- Contadores ----------

/** Último número usado de cada sequência; o próximo código é value + 1 (INC-20421). */
export const SEED_COUNTERS: { name: string; value: number }[] = [
  { name: "INC", value: 20420 },
  { name: "REQ", value: 10510 },
  { name: "draft", value: 380 },
];

// ---------- Artigos (§4.3) ----------

export interface SeedArticle {
  slug: string;
  title: string;
  body: string;
  tags: string[];
  conditions?: ArticleCondition[];
}

export const SEED_ARTICLES: SeedArticle[] = [
  {
    slug: "vpn-erro-809",
    title: "VPN com erro 809",
    body: "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
    tags: ["vpn", "erro 809", "conexão", "home office", "windows 10", "acesso remoto"],
    conditions: [{ field: "os", appliesTo: ["Windows 10"] }],
  },
  {
    slug: "horario-service-desk",
    title: "Horário do service desk",
    body: "O service desk atende de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    tags: ["horário", "atendimento", "plantão", "service desk", "suporte", "expediente"],
  },
  {
    slug: "redefinir-senha-de-rede",
    title: "Redefinir a senha de rede",
    body: "Use o portal de autoatendimento com o código enviado ao celular cadastrado. Se não tiver celular cadastrado, abra um chamado.",
    tags: [
      "senha",
      "rede",
      "login",
      "autoatendimento",
      "esqueci a senha",
      "redefinir senha",
      "senha expirada",
    ],
  },
  {
    slug: "senha-sap-bloqueada",
    title: "Senha do SAP bloqueada",
    body: "O bloqueio acontece após 3 tentativas erradas. O desbloqueio é automático em 30 minutos ou imediato pelo portal de autoatendimento. Se persistir, abra um chamado.",
    tags: ["sap", "senha", "bloqueio", "acesso", "bloqueada", "desbloquear"],
  },
  {
    slug: "instalar-software",
    title: "Instalar software",
    body: "Softwares do catálogo são instalados pelo portal de softwares. Softwares fora do catálogo exigem requisição com aprovação do gestor.",
    tags: ["software", "instalação", "programa", "catálogo", "licença", "instalar", "aplicativo"],
  },
  {
    slug: "email-corporativo-no-celular",
    title: "Configurar o e-mail corporativo no celular",
    body: "Instale o app oficial de e-mail, entre com o e-mail corporativo e a senha de rede e aceite o perfil de segurança. O celular precisa estar registrado no MDM.",
    tags: ["e-mail", "celular", "outlook", "mdm", "sincronização", "smartphone", "configurar"],
  },
  {
    slug: "wifi-corporativo",
    title: "Conectar ao Wi-Fi corporativo",
    body: "Conecte-se à rede Nexo-Corp com as suas credenciais de rede. Visitantes usam a rede Nexo-Guest.",
    tags: [
      "wi-fi",
      "wifi",
      "rede",
      "internet",
      "visitantes",
      "rede sem fio",
      "empresa",
      "escritório",
    ],
  },
  {
    slug: "solicitar-equipamento",
    title: "Solicitar equipamento",
    body: "Monitores, teclados e headsets são pedidos por requisição. O prazo de entrega é de 5 dias úteis após a aprovação.",
    tags: [
      "equipamento",
      "monitor",
      "teclado",
      "headset",
      "requisição",
      "segundo monitor",
      "mouse",
    ],
  },
];

/**
 * O índice de busca do Convex aceita um campo só: título, corpo e tags vão juntos, já como
 * termos normalizados (sem acento, sem plural), iguais aos da consulta.
 */
export function buildSearchText(article: SeedArticle): string {
  return buildArticleSearchText(article);
}

// ---------- Conversa inicial (decisão 1: a do Pedro, não a da Mariana) ----------

export const SEED_CONVERSATION_EMPLOYEE_EMAIL = "pedro.santos@nexo.com.br";
export const SEED_CONVERSATION_TICKET_CODE = "INC-20420";

/** Momentos da conversa do Pedro: relato, rascunho, chamado criado e transferência. */
export function buildSeedConversationTimes(now: number) {
  return {
    reportedAt: minutesAgo(now, 35),
    draftProposedAt: minutesAgo(now, 34),
    ticketCreatedAt: minutesAgo(now, 32),
  };
}

export const SEED_HANDOFF_SUMMARY =
  "Pedro Santos (Operações): o sistema de estoque está fora do ar para toda a equipe e ninguém consegue dar baixa nos pedidos. Sem alternativa no momento. Chamado crítico INC-20420 aberto e confirmado pelo funcionário.";
