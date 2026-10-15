import React, { useCallback, useEffect, useState } from "react";
import Sidebar from "./Sidebar.jsx";
import ChatWindow from "./ChatWindow.jsx";
import NewConversationModal from "./NewConversationModal.jsx";
import {
  getConversationMessages,
  sendMessage,
  setConversationMode,
  setConversationStatus,
  setConversationPriority,
  setConversationLabels,
  setConversationDepartment,
  assignConversation,
  sendMediaMessage,
  sendAudioMessage,
  reactToMessage
} from "../api.js";
import { supabase } from "../supabaseClient.js";

export default function ConversationsPage({
  conversations,
  refreshConversations,
  whatsappStatus,
  onOpenConnect,
  openConversationId,
  onOpenConversationHandled,
  currentUserId,
  newConversationContact,
  onNewConversationHandled
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  // Vindo da aba Contatos ("Conversar"): abre a janela já com o contato.
  useEffect(() => {
    if (newConversationContact) setShowNew(true);
  }, [newConversationContact]);
  const [messages, setMessages] = useState([]);

  const loadMessages = useCallback((id) => {
    getConversationMessages(id).then((data) => setMessages(data.messages));
  }, []);

  // Quando outra tela pede pra abrir uma conversa específica (ex: painel
  // lateral de um negócio no Kanban), seleciona ela automaticamente.
  useEffect(() => {
    if (!openConversationId) return;
    setSelectedId(openConversationId);
    loadMessages(openConversationId);
    onOpenConversationHandled?.();
  }, [openConversationId, loadMessages, onOpenConversationHandled]);

  // Escuta só as mensagens da conversa aberta no momento — muda de
  // inscrição sempre que o usuário troca de conversa.
  useEffect(() => {
    if (!selectedId) return;

    const channel = supabase
      .channel(`messages_for_${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedId}`
        },
        () => loadMessages(selectedId)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [selectedId, loadMessages]);

  const handleSelect = (id) => {
    setSelectedId(id);
    loadMessages(id);
  };

  const handleSend = async (text, sign = true) => {
    if (!selectedId) return;
    await sendMessage(selectedId, text, sign);
    loadMessages(selectedId);
    refreshConversations();
  };

  const handleSendMedia = async (file, caption) => {
    if (!selectedId) return;
    await sendMediaMessage(selectedId, file, caption);
    loadMessages(selectedId);
    refreshConversations();
  };

  const handleSendAudio = async (blob) => {
    if (!selectedId) return;
    await sendAudioMessage(selectedId, blob);
    loadMessages(selectedId);
    refreshConversations();
  };

  const handleReact = async (messageId, emoji) => {
    await reactToMessage(messageId, emoji);
    loadMessages(selectedId);
  };

  const handleSetMode = async (mode) => {
    if (!selectedId) return;
    await setConversationMode(selectedId, mode);
    refreshConversations();
  };

  const handleSetStatus = async (status) => {
    if (!selectedId) return;
    await setConversationStatus(selectedId, status);
    refreshConversations();
  };

  const handleSetPriority = async (priority) => {
    if (!selectedId) return;
    await setConversationPriority(selectedId, priority);
    refreshConversations();
  };

  const handleSetDepartment = async (departmentId) => {
    if (!selectedId) return;
    await setConversationDepartment(selectedId, departmentId);
    refreshConversations();
  };

  const handleTakeOver = async () => {
    if (!selectedId) return;
    await assignConversation(selectedId, currentUserId);
    await setConversationMode(selectedId, "human");
    refreshConversations();
  };

  const handleReturnToQueue = async () => {
    if (!selectedId) return;
    await assignConversation(selectedId, null);
    refreshConversations();
  };

  const handleAssign = async (agentId) => {
    if (!selectedId) return;
    await assignConversation(selectedId, agentId);
    refreshConversations();
  };

  const handleToggleLabel = async (label, shouldAdd) => {
    if (!selectedId) return;
    const current = (selectedConversation?.labels || []).map((l) => l.id);
    const nextIds = shouldAdd
      ? [...new Set([...current, label.id])]
      : current.filter((id) => id !== label.id);
    await setConversationLabels(selectedId, nextIds);
    refreshConversations();
  };

  const selectedConversation = conversations.find((c) => c.id === selectedId) || null;

  return (
    <div className="conversations-page">
      <Sidebar
        conversations={conversations}
        selectedId={selectedId}
        onSelect={handleSelect}
        currentUserId={currentUserId}
        onNewConversation={() => setShowNew(true)}
        className={selectedId ? "hidden-mobile" : ""}
      />

      <ChatWindow
        conversation={selectedConversation}
        messages={messages}
        onSend={handleSend}
        onSendMedia={handleSendMedia}
        onSendAudio={handleSendAudio}
        onReact={handleReact}
        onSetMode={handleSetMode}
        onSetStatus={handleSetStatus}
        onSetPriority={handleSetPriority}
        onSetDepartment={handleSetDepartment}
        onAssign={handleAssign}
        onToggleLabel={handleToggleLabel}
        onTakeOver={handleTakeOver}
        onReturnToQueue={handleReturnToQueue}
        currentUserId={currentUserId}
        onBack={() => setSelectedId(null)}
        className={selectedId ? "visible-mobile" : ""}
      />
      {showNew && (
        <NewConversationModal
          initialContact={newConversationContact}
          onClose={() => {
            setShowNew(false);
            onNewConversationHandled?.();
          }}
          onStarted={(conv) => {
            setShowNew(false);
            onNewConversationHandled?.();
            refreshConversations();
            setSelectedId(conv.id);
            loadMessages(conv.id);
          }}
        />
      )}
    </div>
  );
}
