import React, { useEffect, useState, useCallback, useRef } from "react";
import IconRail from "./components/IconRail.jsx";
import BottomTabBar from "./components/BottomTabBar.jsx";
import TopBar from "./components/TopBar.jsx";
import LoginPage from "./components/LoginPage.jsx";
import HomePage from "./components/HomePage.jsx";
import OverviewPage from "./components/OverviewPage.jsx";
import AgentsPage from "./components/AgentsPage.jsx";
import ConversationsPage from "./components/ConversationsPage.jsx";
import DealsPage from "./components/DealsPage.jsx";
import SettingsPage from "./components/SettingsPage.jsx";
import AdminPage from "./components/AdminPage.jsx";
import ChannelsPage from "./components/ChannelsPage.jsx";
import WhatsAppConnectModal from "./components/WhatsAppConnectModal.jsx";
import FooterBar from "./components/FooterBar.jsx";
import ContactsPage from "./components/ContactsPage.jsx";
import FlowsPage from "./components/FlowsPage.jsx";
import ResetPasswordPage from "./components/ResetPasswordPage.jsx";
import CampaignsPage from "./components/CampaignsPage.jsx";
import SupportChat from "./components/SupportChat.jsx";
import { notifyEvent } from "./notifications.js";
import { getConversations, getWhatsAppStatus, getAccount, getActingAccount, leaveAccount } from "./api.js";
import { supabase } from "./supabaseClient.js";
import { getAccountTabsApi, logSessionApi } from "./api.js";
import { subscribePush } from "./notifications.js";
import { NAV_ITEMS, ADMIN_NAV_ITEM, GESTAO_NAV_ITEMS, MOBILE_NAV_KEYS } from "./navConfig.js";
import ProfileModal from "./components/ProfileModal.jsx";
import ReportsPage from "./components/ReportsPage.jsx";
import TasksPage from "./components/TasksPage.jsx";
import CrmPage from "./components/CrmPage.jsx";
import FinancePage from "./components/FinancePage.jsx";
import TermsGate from "./components/TermsGate.jsx";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = ainda não sabemos
  const [profile, setProfile] = useState(null);

  const [section, setSection] = useState(() =>
    new URLSearchParams(window.location.search).get("secao") === "financeiro" ? "finance" : new URLSearchParams(window.location.search).get("c") ? "conversations" : "home"
  );
  const [billingBlocked, setBillingBlocked] = useState(false);
  const [tabs, setTabs] = useState({ enabledTabs: null, agentTabs: null });
  useEffect(() => {
    if (!profile?.id) return;
    try {
      const k = `helora_logged_${profile.id}`;
      if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, "1"); logSessionApi(); }
    } catch { logSessionApi(); }
    subscribePush();
  }, [profile?.id]);
  useEffect(() => {
    if (!profile || (profile.isSuperAdmin && !profile.acting)) return;
    getAccountTabsApi().then(setTabs).catch(() => {});
  }, [profile?.accountId, profile?.acting?.id, profile?.role]);
  // Clicar de novo na aba em que já está → volta para o topo
  const navTo = (key) => {
    if (key === section) {
      document.querySelectorAll(".shell-content, .shell-content *").forEach((el) => {
        if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) el.scrollTo({ top: 0, behavior: "smooth" });
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSection(key);
  };
  useEffect(() => {
    const on = () => { setBillingBlocked(true); setSection("finance"); };
    window.addEventListener("helora:billing-blocked", on);
    return () => window.removeEventListener("helora:billing-blocked", on);
  }, []);
  const [showProfile, setShowProfile] = useState(false);
  // Celular = modo app (só Conversas e Pipeline)
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const on = () => setIsMobile(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  const [whatsappStatus, setWhatsappStatus] = useState("disconnected");
  const [qr, setQr] = useState(null);
  const [whatsappChannelId, setWhatsappChannelId] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [conversations, setConversations] = useState([]);
  const conversationsRef = useRef([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  const [statsVersion, setStatsVersion] = useState(0);
  const [footerNote, setFooterNote] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [profileRetryKey, setProfileRetryKey] = useState(0);
  const [pendingConversationId, setPendingConversationId] = useState(() => { try { const c = new URLSearchParams(window.location.search).get("c"); if (c) window.history.replaceState(null, "", window.location.pathname); return c || null; } catch { return null; } });
  const [newConversationContact, setNewConversationContact] = useState(null);
  const [showSupport, setShowSupport] = useState(false);
  // Veio do link "recuperar senha" do e-mail?
  const [recovery, setRecovery] = useState(
    () => typeof window !== "undefined" && /type=recovery/.test(window.location.hash + window.location.search)
  );

  const openConversation = useCallback((conversationId) => {
    setSection("conversations");
    setPendingConversationId(conversationId);
  }, []);

  // ---------- Sessão (login) ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // ---------- Perfil (conta, papel, super admin) ----------
  useEffect(() => {
    if (!session) {
      setProfile(null);
      setProfileError(null);
      return;
    }

    let cancelled = false;
    setProfileError(null);

    supabase
      .from("profiles")
      .select("account_id, role, is_super_admin, name, avatar_url, accounts!profiles_account_id_fkey(name)")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;

        if (error) {
          // Antes isso ficava carregando pra sempre em silêncio (ex: quando
          // uma migration nova ainda não tinha rodado no banco). Agora
          // mostramos o erro de verdade, com opção de tentar de novo.
          console.error("[Helora] Falha ao carregar o perfil:", error);
          setProfileError(error.message || "Não foi possível carregar seu perfil.");
          return;
        }

        if (!data) {
          setProfileError("Perfil não encontrado para este usuário. Fale com quem administra sua conta.");
          return;
        }

        // Super admin "dentro" de uma empresa: age como gestor dela.
        const acting = data.is_super_admin ? getActingAccount() : null;
        setProfile({
          id: session.user.id,
          accountId: acting?.id || data.account_id,
          role: acting ? "owner" : data.role,
          isSuperAdmin: data.is_super_admin,
          name: data.name,
          avatarUrl: data.avatar_url,
          accountName: acting?.name || data.accounts?.name,
          acting: !!acting
        });
      });

    return () => {
      cancelled = true;
    };
  }, [session, profileRetryKey]);

  // ---------- Dados do painel (só depois de logado) ----------
  // Recarrega a lista juntando vários pedidos seguidos num só (evita travadas)
  const refreshTimer = useRef(null);
  const refreshConversations = useCallback(() => {
    if (!session) return;
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => getConversations().then(setConversations).catch(console.error), 350);
  }, [session]);
  // Atualiza uma conversa na tela na hora (antes do servidor responder)
  const patchConversation = useCallback((id, patch) => {
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  useEffect(() => {
    if (!session || !profile) return;

    refreshConversations();
    getWhatsAppStatus().then((s) => {
      setWhatsappStatus(s.status);
      setQr(s.qr);
      setWhatsappChannelId(s.channelId);
    });
    getAccount().then((a) => setFooterNote(a?.footer_note || null)).catch(console.error);

    const statusChannel = supabase
      .channel("channel_status_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "channel_status" },
        (payload) => {
          // Só reage à mudança se for do dispositivo principal que o topbar
          // mostra (as outras contas/dispositivos já são filtrados por RLS).
          setWhatsappChannelId((currentId) => {
            if (currentId && payload.new.channel_id === currentId) {
              setWhatsappStatus(payload.new.status);
              setQr(payload.new.qr);
            }
            return currentId;
          });
        }
      )
      .subscribe();

    const messagesChannel = supabase
      .channel("messages_changes_global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          refreshConversations();
          setStatsVersion((v) => v + 1);
          const m = payload.new || {};
          // Só avisa mensagem de cliente, da empresa que está aberta no painel.
          if (m.direction === "in" && (!profile.accountId || m.account_id === profile.accountId)) {
            const conv = conversationsRef.current.find((c) => c.id === m.conversation_id);
            const type = conv?.isGroup ? "group" : !conv || !conv.assignedAgentId ? "pending" : conv.assignedAgentId === session.user.id ? "message" : null;
            if (type)
              notifyEvent(type, conv?.isGroup ? `Grupo ${conv.name}` : type === "pending" ? "Conversa na fila" : "Nova mensagem", m.text || "📎 Arquivo recebido", () => {
                setSection("conversations");
                setPendingConversationId(m.conversation_id);
              });
          }
        }
      )
      .subscribe();

    // Conversa transferida para mim
    const transferChannel = supabase
      .channel("conversations_assign")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, (payload) => {
        const n = payload.new || {};
        const before = conversationsRef.current.find((c) => c.id === n.id);
        if (n.assigned_agent_id === session.user.id && before && before.assignedAgentId !== session.user.id) {
          notifyEvent("transfer", "Conversa para você", n.name || "Atendimento transferido", () => {
            setSection("conversations");
            setPendingConversationId(n.id);
          });
        }
      })
      .subscribe();
    // Resposta do suporte Helora
    const supportChannel = supabase
      .channel("support_replies")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        const m = payload.new || {};
        if (m.from_admin && !m.is_bot && !profile.isSuperAdmin) notifyEvent("support", "Suporte Helora", m.text, () => setShowSupport(true));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(statusChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(transferChannel);
      supabase.removeChannel(supportChannel);
    };
  }, [session, profile, refreshConversations]);

  // ---------- Telas de carregamento / login ----------
  if (session === undefined) {
    return <div className="auth-loading">Carregando...</div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  if (recovery && session) {
    return <ResetPasswordPage onDone={() => setRecovery(false)} />;
  }

  if (!profile) {
    if (profileError) {
      return (
        <div className="auth-loading auth-error">
          <p>Não deu pra carregar sua conta.</p>
          <p className="auth-error-detail">{profileError}</p>
          <div className="auth-error-actions">
            <button onClick={() => setProfileRetryKey((k) => k + 1)}>Tentar de novo</button>
            <button className="auth-error-secondary" onClick={() => supabase.auth.signOut()}>
              Sair
            </button>
          </div>
        </div>
      );
    }
    return <div className="auth-loading">Carregando sua conta...</div>;
  }

  // Super admin fora de uma empresa = Painel Helora (só gestão).
  const isHeloraPanel = profile.isSuperAdmin && !profile.acting;
  const isManager = profile.role === "owner" || profile.isSuperAdmin;
  // Abas: a Gestora define as da empresa; o Gestor define as dos atendentes
  const tabAllowed = (key) => {
    if (profile.isSuperAdmin) return true;
    if (tabs.enabledTabs && !["home", "conversations", "settings", "finance"].includes(key) && !tabs.enabledTabs.includes(key)) return false;
    if (!isManager) return key === "conversations" || (tabs.agentTabs || []).includes(key);
    return true;
  };
  // Quem tem CRM não usa mais o Pipeline antigo (o CRM substitui)
  const crmOn = tabAllowed("crm");
  const visibleTab = (key) => tabAllowed(key) && !(key === "deals" && crmOn);
  const navItems = isHeloraPanel ? GESTAO_NAV_ITEMS : NAV_ITEMS.filter((i) => (!i.ownerOnly || isManager) && visibleTab(i.key));
  const mobileApp = isMobile && !isHeloraPanel;
  const mobileItems = mobileApp
    ? MOBILE_NAV_KEYS.map((k) => NAV_ITEMS.find((i) => i.key === k)).filter((i) => i && visibleTab(i.key))
    : navItems;
  let activeSection = isHeloraPanel
    ? (section.startsWith("g_") ? section : "g_dashboard")
    : section.startsWith("g_") || section === "admin" ? "home" : section;
  if (!isHeloraPanel && activeSection === "deals" && crmOn) activeSection = "crm";
  if (mobileApp && !MOBILE_NAV_KEYS.includes(activeSection)) activeSection = "conversations";
  if (!isHeloraPanel && !tabAllowed(activeSection)) activeSection = "conversations";
  if (billingBlocked && !isHeloraPanel) activeSection = "finance";
  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);
  const canEditFooter = profile.role === "owner" || profile.isSuperAdmin;
  const handleAvatarUpdated = (avatarUrl) => setProfile((p) => ({ ...p, avatarUrl }));

  return (
    <div className="shell">
      <IconRail
        items={navItems}
        section={activeSection}
        onChange={navTo}
        unreadTotal={unreadTotal}
        profile={profile}
        onAvatarUpdated={handleAvatarUpdated}
        onHelp={() => (isHeloraPanel ? setSection("g_support") : setShowSupport((v) => !v))}
        onOpenProfile={() => setShowProfile(true)}
      />

      <div className="shell-main">
        {profile.acting && (
          <div className="acting-banner">
            <span>
              Você está dentro da empresa <strong>{profile.accountName}</strong> como administrador.
            </span>
            <button onClick={leaveAccount}>Sair da empresa</button>
          </div>
        )}
        <TopBar section={activeSection} hideNotifications={isHeloraPanel} />

        <div className="shell-content">
          {activeSection === "home" && (
            <HomePage profile={profile} conversations={conversations} onNavigate={setSection} />
          )}
          {activeSection === "overview" && <OverviewPage refreshKey={statsVersion} />}
          {activeSection === "agents" && <FlowsPage canEdit={profile.role === "owner" || profile.isSuperAdmin} />}
          {activeSection === "conversations" && (
            <ConversationsPage
              conversations={conversations}
              refreshConversations={refreshConversations}
              patchConversation={patchConversation}
              whatsappStatus={whatsappStatus}
              onOpenConnect={() => setShowConnectModal(true)}
              openConversationId={pendingConversationId}
              onOpenConversationHandled={() => setPendingConversationId(null)}
              currentUserId={session.user.id}
              currentUserName={profile.name || (session.user.email || "").split("@")[0]}
              canSeeAll={profile.role === "owner" || profile.isSuperAdmin}
              newConversationContact={newConversationContact}
              onNewConversationHandled={() => setNewConversationContact(null)}
            />
          )}
          {activeSection === "deals" && <DealsPage onOpenConversation={openConversation} />}
          {activeSection === "settings" && (
            <SettingsPage onGoToChannels={() => setSection("channels")} canManage={profile.role === "owner" || profile.isSuperAdmin} apiEnabled={!!profile.isSuperAdmin || !!tabs.enabledTabs?.includes("api")} />
          )}
          {activeSection === "channels" && <ChannelsPage />}
          {activeSection === "reports" && <ReportsPage />}
          {activeSection === "tasks" && <TasksPage profile={profile} onOpenConversation={openConversation} />}
          {activeSection === "crm" && <CrmPage profile={profile} onOpenConversation={openConversation} />}
          {activeSection === "finance" && (isManager ? <FinancePage /> : (
            <div className="page"><div className="admin-feedback error">O acesso da empresa está pausado por pendência financeira. Fale com o responsável pela conta.</div></div>
          ))}
          {activeSection === "campaigns" && <CampaignsPage canEdit={profile.role === "owner" || profile.isSuperAdmin} />}
          {activeSection === "contacts" && (
            <ContactsPage
              canDelete={profile.role === "owner" || profile.isSuperAdmin}
              onStartConversation={(c) => {
                setNewConversationContact(c);
                setSection("conversations");
              }}
            />
          )}
          {activeSection.startsWith("g_") && profile.isSuperAdmin && <AdminPage tab={activeSection.slice(2)} />}
        </div>
      </div>

      <BottomTabBar
        items={mobileItems}
        onOpenProfile={() => setShowProfile(true)}
        onHelp={isHeloraPanel ? undefined : () => setShowSupport(true)}
        section={activeSection}
        onChange={navTo}
        unreadTotal={unreadTotal}
        profile={profile}
        onAvatarUpdated={handleAvatarUpdated}
      />

      {/* Aviso de rodapé ("versão / atualização") escondido: estava poluindo a tela. */}

      {!isHeloraPanel && <TermsGate />}

      {showProfile && (
        <ProfileModal
          profile={profile}
          email={session.user.email}
          onClose={() => setShowProfile(false)}
          onSaved={(name) => setProfile((p) => ({ ...p, name }))}
        />
      )}

      {showSupport && !isHeloraPanel && <SupportChat onClose={() => setShowSupport(false)} />}

      {showConnectModal && (
        <WhatsAppConnectModal
          channelId={whatsappChannelId}
          onClose={() => setShowConnectModal(false)}
        />
      )}
    </div>
  );
}
