import React, { useEffect, useState, useCallback } from "react";
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
import SupportChat from "./components/SupportChat.jsx";
import { showNotification } from "./notifications.js";
import { getConversations, getWhatsAppStatus, getAccount, getActingAccount, leaveAccount } from "./api.js";
import { supabase } from "./supabaseClient.js";
import { NAV_ITEMS, ADMIN_NAV_ITEM } from "./navConfig.js";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = ainda não sabemos
  const [profile, setProfile] = useState(null);

  const [section, setSection] = useState("home");
  const [whatsappStatus, setWhatsappStatus] = useState("disconnected");
  const [qr, setQr] = useState(null);
  const [whatsappChannelId, setWhatsappChannelId] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [statsVersion, setStatsVersion] = useState(0);
  const [footerNote, setFooterNote] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [profileRetryKey, setProfileRetryKey] = useState(0);
  const [pendingConversationId, setPendingConversationId] = useState(null);
  const [newConversationContact, setNewConversationContact] = useState(null);
  const [showSupport, setShowSupport] = useState(false);

  const openConversation = useCallback((conversationId) => {
    setSection("conversations");
    setPendingConversationId(conversationId);
  }, []);

  // ---------- Sessão (login) ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
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
      .select("account_id, role, is_super_admin, name, avatar_url, accounts(name)")
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
  const refreshConversations = useCallback(() => {
    if (!session) return;
    getConversations().then(setConversations).catch(console.error);
  }, [session]);

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
            showNotification("Nova mensagem", m.text || "📎 Arquivo recebido", () => {
              setSection("conversations");
              setPendingConversationId(m.conversation_id);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(statusChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [session, profile, refreshConversations]);

  // ---------- Telas de carregamento / login ----------
  if (session === undefined) {
    return <div className="auth-loading">Carregando...</div>;
  }

  if (!session) {
    return <LoginPage />;
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
  const navItems = isHeloraPanel ? [ADMIN_NAV_ITEM] : NAV_ITEMS;
  const activeSection = isHeloraPanel ? "admin" : section === "admin" ? "home" : section;
  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread || 0), 0);
  const canEditFooter = profile.role === "owner" || profile.isSuperAdmin;
  const handleAvatarUpdated = (avatarUrl) => setProfile((p) => ({ ...p, avatarUrl }));

  return (
    <div className="shell">
      <IconRail
        items={navItems}
        section={activeSection}
        onChange={setSection}
        unreadTotal={unreadTotal}
        profile={profile}
        onAvatarUpdated={handleAvatarUpdated}
        onHelp={() => (isHeloraPanel ? setSection("admin") : setShowSupport((v) => !v))}
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
              whatsappStatus={whatsappStatus}
              onOpenConnect={() => setShowConnectModal(true)}
              openConversationId={pendingConversationId}
              onOpenConversationHandled={() => setPendingConversationId(null)}
              currentUserId={session.user.id}
              newConversationContact={newConversationContact}
              onNewConversationHandled={() => setNewConversationContact(null)}
            />
          )}
          {activeSection === "deals" && <DealsPage onOpenConversation={openConversation} />}
          {activeSection === "settings" && (
            <SettingsPage onGoToChannels={() => setSection("channels")} canManage={profile.role === "owner" || profile.isSuperAdmin} />
          )}
          {activeSection === "channels" && <ChannelsPage />}
          {activeSection === "contacts" && (
            <ContactsPage
              canDelete={profile.role === "owner" || profile.isSuperAdmin}
              onStartConversation={(c) => {
                setNewConversationContact(c);
                setSection("conversations");
              }}
            />
          )}
          {activeSection === "admin" && profile.isSuperAdmin && <AdminPage />}
        </div>
      </div>

      <BottomTabBar
        items={navItems}
        section={activeSection}
        onChange={setSection}
        unreadTotal={unreadTotal}
        profile={profile}
        onAvatarUpdated={handleAvatarUpdated}
      />

      {/* Aviso de rodapé ("versão / atualização") escondido: estava poluindo a tela. */}

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
