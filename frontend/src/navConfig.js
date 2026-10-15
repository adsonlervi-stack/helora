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
  Workflow
} from "lucide-react";

export const NAV_ITEMS = [
  { key: "home", label: "Início", icon: Home },
  { key: "overview", label: "Painel", icon: LayoutDashboard },
  { key: "deals", label: "Negócios", icon: KanbanSquare },
  { key: "agents", label: "Fluxos", icon: Workflow },
  { key: "conversations", label: "Conversas", icon: MessageCircle },
  { key: "contacts", label: "Contatos", icon: Contact },
  { key: "channels", label: "Canais", icon: Smartphone },
  { key: "settings", label: "Config.", icon: Settings2 }
];

// Só aparece pra quem é super admin (dono da Helora) — ver App.jsx
export const ADMIN_NAV_ITEM = { key: "admin", label: "Gestão", icon: ShieldCheck };

export const SECTION_TITLES = {
  home: "Início",
  overview: "Painel",
  deals: "Negócios",
  agents: "Fluxos",
  conversations: "Conversas",
  contacts: "Contatos",
  channels: "Canais",
  settings: "Configurações",
  admin: "Gestão Helora"
};
