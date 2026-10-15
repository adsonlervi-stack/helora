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
  Users
} from "lucide-react";

export const NAV_ITEMS = [
  { key: "home", label: "Início", icon: Home },
  { key: "conversations", label: "Conversas", icon: MessageCircle },
  { key: "overview", label: "Painel", icon: LayoutDashboard },
  { key: "deals", label: "Pipeline", icon: KanbanSquare },
  { key: "agents", label: "Fluxos", icon: Workflow },
  { key: "contacts", label: "Contatos", icon: Contact },
  { key: "campaigns", label: "Campanhas", icon: Megaphone },
  { key: "channels", label: "Canais", icon: Smartphone },
  { key: "settings", label: "Config.", icon: Settings2 }
];

// Painel Helora (super admin): todos os menus da Gestão na barra lateral
export const GESTAO_NAV_ITEMS = [
  { key: "g_dashboard", label: "Painel", icon: LayoutDashboard },
  { key: "g_accounts", label: "Empresas", icon: Building2 },
  { key: "g_invoices", label: "Cobranças", icon: Receipt },
  { key: "g_credits", label: "Créditos", icon: Coins },
  { key: "g_support", label: "Suporte", icon: LifeBuoy },
  { key: "g_announcements", label: "Comunicados", icon: Megaphone },
  { key: "g_users", label: "Usuários", icon: Users }
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
  g_support: "Suporte",
  g_announcements: "Comunicados",
  g_users: "Usuários"
};

// No celular o Helora funciona como app: só Conversas e Pipeline.
export const MOBILE_NAV_KEYS = ["conversations", "deals"];
