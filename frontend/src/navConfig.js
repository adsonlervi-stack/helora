import {
  Home,
  LayoutDashboard,
  Bot,
  MessageCircle,
  Settings2,
  ShieldCheck,
  KanbanSquare,
  Smartphone
} from "lucide-react";

export const NAV_ITEMS = [
  { key: "home", label: "Início", icon: Home },
  { key: "overview", label: "Painel", icon: LayoutDashboard },
  { key: "deals", label: "Negócios", icon: KanbanSquare },
  { key: "agents", label: "Chatbot", icon: Bot },
  { key: "conversations", label: "Conversas", icon: MessageCircle },
  { key: "channels", label: "Canais", icon: Smartphone },
  { key: "settings", label: "Config.", icon: Settings2 }
];

// Só aparece pra quem é super admin (dono da Helora) — ver App.jsx
export const ADMIN_NAV_ITEM = { key: "admin", label: "Gestão", icon: ShieldCheck };

export const SECTION_TITLES = {
  home: "Início",
  overview: "Painel",
  deals: "Negócios",
  agents: "Chatbot",
  conversations: "Conversas",
  channels: "Canais",
  settings: "Configurações",
  admin: "Gestão Helora"
};
