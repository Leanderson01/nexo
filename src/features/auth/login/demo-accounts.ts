// Contas de demonstração do login (decisão 13): os e-mails do seed (convex/seedData.ts)
// e o cenário que cada um permite testar. Qualquer senha funciona.

export interface DemoAccount {
  name: string;
  email: string;
  profile: string;
  scenario: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    name: "Mariana Costa",
    email: "mariana.costa@nexo.com.br",
    profile: "Funcionária · Financeiro",
    scenario: "Chamado vencido, requisição aprovada e reabertura",
  },
  {
    name: "Rafael Lima",
    email: "rafael.lima@nexo.com.br",
    profile: "Funcionário · Comercial",
    scenario: "VPN no Windows 11, chamado no prazo e resolvido antigo",
  },
  {
    name: "Juliana Alves",
    email: "juliana.alves@nexo.com.br",
    profile: "Funcionária · Marketing",
    scenario: "Requisição aguardando ela e dúvidas da central de ajuda",
  },
  {
    name: "Pedro Santos",
    email: "pedro.santos@nexo.com.br",
    profile: "Funcionário · Operações",
    scenario: "Incidente crítico transferido e teste de privacidade",
  },
  {
    name: "Ana Ribeiro",
    email: "ana.ribeiro@nexo.com.br",
    profile: "Analista N1 · Service Desk",
    scenario: "Console: fila com a conversa do Pedro aguardando",
  },
  {
    name: "Carlos Mendes",
    email: "carlos.mendes@nexo.com.br",
    profile: "Analista N2 · Service Desk",
    scenario: "Console: assumir, devolver e encerrar atendimentos",
  },
];
