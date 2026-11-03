import React, { useEffect, useState } from "react";
import { PlusCircle, UserPlus, MessageCirclePlus, Upload, Briefcase, MessageCircle, RefreshCw, Plus, Megaphone, HelpCircle, BookOpen, AlertTriangle } from "lucide-react";
import Avatar from "./Avatar.jsx";
import { crm, getAnnouncements } from "../api.js";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
function ago(iso) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d <= 0) {
    const h = Math.floor((Date.now() - new Date(iso)) / 3600000);
    return h <= 0 ? "agora" : `há ${h} h`;
  }
  return d === 1 ? "ontem" : `há ${d} dias`;
}
const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("pt-BR");
};
const go = (aba, extra = {}) => {
  const q = new URLSearchParams({ aba, ...extra });
  window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
};

export default function HomePage({ profile, conversations = [], onNavigate, onOpenConversation, onNewConversation }) {
  const firstName = (profile?.name || "").split(" ")[0] || "você";
  const [mode, setMode] = useState("new");
  const [deals, setDeals] = useState(null);
  const [pipes, setPipes] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const loadDeals = (m = mode) => { setDeals(null); crm.leads({ limit: 6, sort: m === "recent" ? "recent" : undefined }).then(setDeals).catch(() => setDeals([])); };
  useEffect(() => {
    loadDeals();
    crm.pipelines().then(setPipes).catch(() => {});
    getAnnouncements().then(setAnnouncements).catch(() => {});
  }, []);
  const pipeOf = (l) => pipes.find((p) => p.id === l.pipelineId);
  const stageOf = (l) => pipeOf(l)?.stages?.find((s) => s.id === l.stage)?.name || "";
  const convs = [...conversations].sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)).slice(0, 6);
  const urgent = conversations.filter((c) => c.status !== "resolved" && (c.priority === "urgent" || c.priority === "high")).length;

  const actions = [
    { icon: PlusCircle, title: "Novo negócio", sub: "Adicionar ao funil", run: () => { go("crm", { acao: "novo" }); onNavigate("crm"); } },
    { icon: UserPlus, title: "Novo contato", sub: "Pessoa ou empresa", run: () => onNavigate("contacts") },
    { icon: MessageCirclePlus, title: "Nova conversa", sub: "Iniciar atendimento", run: () => (onNewConversation ? onNewConversation() : onNavigate("conversations")) },
    { icon: Upload, title: "Importar planilha", sub: "Negócios ou contatos", run: () => { go("crm", { acao: "importar" }); onNavigate("crm"); } }
  ];

  return (
    <div className="page home2">
      <div className="home2-hero">
        <Avatar name={profile?.name} url={profile?.avatarUrl} size={52} />
        <div>
          <h2>{greeting()}, {firstName}</h2>
          <p>Aqui está o seu dia. Bom trabalho.</p>
        </div>
      </div>

      {urgent > 0 && (
        <button className="home2-alert" onClick={() => onNavigate("conversations")}>
          <AlertTriangle size={15} /> {urgent} conversa(s) de prioridade alta aguardando
        </button>
      )}

      <div className="home2-label">Ações rápidas</div>
      <div className="home2-actions">
        {actions.map(({ icon: I, title, sub, run }) => (
          <button key={title} className="home2-action" onClick={run}>
            <span className="home2-ico"><I size={18} /></span>
            <span><strong>{title}</strong><small>{sub}</small></span>
          </button>
        ))}
      </div>

      <div className="home2-cols">
        <section className="home2-box">
          <header>
            <Briefcase size={16} /><h3>Últimos negócios</h3>
            <div className="home2-seg">
              {[["new", "Novos"], ["recent", "Recentes"]].map(([k, l]) => (
                <button key={k} className={mode === k ? "on" : ""} onClick={() => { setMode(k); loadDeals(k); }}>{l}</button>
              ))}
            </div>
            <span className="home2-sp" />
            <button className="home2-icon" title="Atualizar" onClick={() => loadDeals()}><RefreshCw size={15} /></button>
            <button className="home2-new" onClick={actions[0].run}><Plus size={14} /> Novo</button>
          </header>
          <div className="home2-list">
            {deals === null && <div className="home2-empty">Carregando…</div>}
            {deals?.length === 0 && <div className="home2-empty">Nenhum negócio ainda.</div>}
            {(deals || []).map((l) => (
              <button key={l.id} className="home2-row" onClick={() => { go("crm", { lead: l.id }); onNavigate("crm"); }}>
                <Avatar name={l.name} url={l.avatarUrl} size={40} />
                <span className="home2-main"><strong>{l.name}</strong><small>{[pipeOf(l)?.name, stageOf(l)].filter(Boolean).join(" · ")}</small></span>
                <span className="home2-when">{ago(mode === "recent" ? l.lastInteractionAt || l.createdAt : l.createdAt)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="home2-box">
          <header>
            <MessageCircle size={16} /><h3>Últimas conversas</h3>
            <span className="home2-sp" />
            <button className="home2-new" onClick={actions[2].run}><Plus size={14} /> Nova</button>
          </header>
          <div className="home2-list">
            {convs.length === 0 && <div className="home2-empty">Nenhuma conversa ainda.</div>}
            {convs.map((c) => (
              <button key={c.id} className="home2-row" onClick={() => (onOpenConversation ? onOpenConversation(c.id) : onNavigate("conversations"))}>
                <span className="home2-av">
                  <Avatar name={c.name} url={c.avatarUrl} size={40} group={c.isGroup} />
                  {c.platform === "whatsapp" && <i className="home2-wa" />}
                </span>
                <span className="home2-main">
                  <strong>{c.name}</strong>
                  <small>{(c.lastMessagePreview || "").replace(/\*([^*\n]+)\*/g, "$1") || "—"}</small>
                </span>
                <span className="home2-when">{when(c.lastMessageAt)}{c.unread > 0 && <b className="home2-badge">{c.unread}</b>}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {announcements.length > 0 && (
        <section className="home2-box" style={{ marginTop: 16 }}>
          <header><Megaphone size={16} /><h3>Comunicados</h3></header>
          <div className="home2-list">
            {announcements.map((a) => (
              <div key={a.id} className="home2-ann">
                <strong>{a.title}</strong>
                <p>{a.message}</p>
                {a.link && <a href={a.link} target="_blank" rel="noreferrer">{a.buttonText || "Abrir link"}</a>}
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="home2-foot">
        <button onClick={() => onNavigate("settings")}><HelpCircle size={14} /> Ajuda</button>
        <span />
        <button onClick={() => onNavigate("ia")}><BookOpen size={14} /> Helora IA</button>
      </footer>
    </div>
  );
}
