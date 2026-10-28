import {
  Home,
  LayoutDashboard,
  Bot,
  MessageCircle,
  Settings2,
  ShieldCheck,
  KanbanSquare,
  Smartphone,
  Contact,
  Workflow,
  Megaphone,
  Building2,
  Receipt,
  Coins,
  LifeBuoy,
  Users,
  Layers,
  BarChart3,
  Wallet,
  ListChecks,
  Target,
  Sparkles,
  Plug
} from "lucide-react";

export const NAV_ITEMS = [
  { key: "home", label: "Início", icon: Home },
  { key: "conversations", label: "Conversas", icon: MessageCircle },
  { key: "overview", label: "Painel", icon: LayoutDashboard },
  { key: "deals", label: "Pipeline", icon: KanbanSquare },
  { key: "agents", label: "Fluxos", icon: Workflow },
  { key: "contacts", label: "Contatos", icon: Contact },
  { key: "campaigns", label: "Campanhas", icon: Megaphone },
  { key: "crm", label: "CRM", icon: Target },
  { key: "tasks", label: "Tarefas", icon: ListChecks },
  { key: "ia", label: "IA Helora", icon: Sparkles },
  { key: "reports", label: "Relatórios", icon: BarChart3 },
  { key: "channels", label: "Canais", icon: Smartphone },
  { key: "connections", label: "Conexões", icon: Plug, ownerOnly: true },
  { key: "finance", label: "Financeiro", icon: Wallet, ownerOnly: true },
  { key: "settings", label: "Config.", icon: Settings2 }
];

// Painel Helora (super admin): todos os menus da Gestão na barra lateral
export const GESTAO_NAV_ITEMS = [
  { key: "g_dashboard", label: "Painel", icon: LayoutDashboard },
  { key: "g_accounts", label: "Empresas", icon: Building2 },
  { key: "g_invoices", label: "Cobranças", icon: Receipt },
  { key: "g_plans", label: "Planos", icon: Layers },
  { key: "g_credits", label: "Créditos", icon: Coins },
  { key: "g_support", label: "Suporte", icon: LifeBuoy },
  { key: "g_announcements", label: "Comunicados", icon: Megaphone },
  { key: "g_users", label: "Usuários", icon: Users },
  { key: "g_logs", label: "Acessos", icon: ShieldCheck }
];

// Só aparece pra quem é super admin (dono da Helora) — ver App.jsx
export const ADMIN_NAV_ITEM = { key: "admin", label: "Gestão", icon: ShieldCheck };

export const SECTION_TITLES = {
  home: "Início",
  overview: "Painel",
  deals: "Pipeline",
  agents: "Fluxos",
  conversations: "Conversas",
  contacts: "Contatos",
  campaigns: "Campanhas",
  api: "API",
  channels: "Canais",
  settings: "Configurações",
  admin: "Gestão Helora",
  g_dashboard: "Painel Helora",
  g_accounts: "Empresas",
  g_invoices: "Cobranças",
  g_credits: "Créditos",
  g_plans: "Planos",
  reports: "Relatórios",
  tasks: "Tarefas",
  crm: "CRM",
  ia: "IA Helora",
  connections: "Conexões",
  finance: "Financeiro",
  g_support: "Suporte",
  g_announcements: "Comunicados",
  g_users: "Usuários",
  g_logs: "Acessos"
};

// No celular o Helora funciona como app: Conversas, CRM (ou Pipeline, para quem não tem CRM) e Tarefas.
// A ordem aqui é a ordem da barra; os 3 primeiros ficam à mostra e o resto vai para "Mais".
export const MOBILE_NAV_KEYS = ["conversations", "crm", "deals", "tasks", "ia"];
