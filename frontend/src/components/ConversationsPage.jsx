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
  reactToMessage,
  markUnreadApi,
  sendSpecialApi,
  deleteMessageApi,
  forwardMessageApi
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
  currentUserName = "",
  canSeeAll = false,
  newConversationContact,
  onNewConversationHandled
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [startContact, setStartContact] = useState(null);

  // Vindo da aba Contatos ("Conversar"): abre a janela já com o contato.
  useEffect(() => {
    if (newConversationContact) setShowNew(true);
  }, [newConversationContact]);
  const [messages, setMessages] = useState([]);
  const [toast, setToast] = useState(null);
  const alertMsg = (t) => {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
  };

  const loadMessages = useCallback((id) => {
    getConversationMessages(id).then((data) =>
      setMessages((prev) => {
        const pending = prev.filter((m) => String(m.id).startsWith("tmp-") && m.conversationId !== "x");
        return pending.length && prev[0]?.conversationId === id ? [...data.messages, ...pending] : data.messages;
      })
    );
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

  // Envio otimista: o balão aparece na hora (com relógio) e é trocado pela
  // mensagem real quando o servidor confirma.
  const addPending = (partial) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setMessages((list) => [
      ...list,
      { id: tempId, direction: "out", author: "operator", text: "", status: "pending", timestamp: new Date().toISOString(), reactions: [], ...partial }
    ]);
    return tempId;
  };
  const resolvePending = (tempId, real, error) => {
    setMessages((list) =>
      error
        ? list.map((m) => (m.id === tempId ? { ...m, status: "failed", error } : m))
        : list.some((m) => m.id === real?.id)
          ? list.filter((m) => m.id !== tempId)
          : list.map((m) => (m.id === tempId ? real : m))
    );
  };

  const handleSend = async (text, sign = true, quoted = null) => {
    if (!selectedId) return;
    const convId = selectedId;
    const tempId = addPending({ text: sign && currentUserName ? `*${currentUserName}:*\n${text}` : text, senderName: currentUserName, quotedId: quoted?.id, quotedText: quoted?.text, quotedAuthor: quoted?.author });
    try {
      const real = await sendMessage(convId, text, sign, quoted?.id || null);
      resolvePending(tempId, real);
      refreshConversations();
    } catch (err) {
      resolvePending(tempId, null, err.response?.data?.error || err.message);
    }
  };

  const handleSendMedia = async (file, caption, quoted = null) => {
    if (!selectedId) return;
    const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document";
    const tempId = addPending({ text: caption || "", mediaType: kind, mediaUrl: kind !== "document" ? URL.createObjectURL(file) : null });
    try {
      const real = await sendMediaMessage(selectedId, file, caption, quoted?.id);
      resolvePending(tempId, real);
      refreshConversations();
    } catch (err) {
      resolvePending(tempId, null, err.response?.data?.error || err.message);
    }
  };

  const handleSendSpecial = async (payload) => {
    if (!selectedId) return;
    const tempId = addPending({ extra: payload });
    try {
      resolvePending(tempId, await sendSpecialApi(selectedId, payload));
      refreshConversations();
    } catch (err) {
      resolvePending(tempId, null, err.response?.data?.error || err.message);
    }
  };

  const handleDelete = async (messageId) => {
    try {
      await deleteMessageApi(messageId);
      loadMessages(selectedId);
    } catch (err) {
      alertMsg(err.response?.data?.error || err.message);
    }
  };

  const handleForward = async (messageId, conversationIds) => {
    const { results } = await forwardMessageApi(messageId, conversationIds);
    refreshConversations();
    return results;
  };

  const handleRetry = (m) => {
    setMessages((list) => list.filter((x) => x.id !== m.id));
    if (m.text) handleSend(m.text, false);
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

  const handleMarkUnread = async () => {
    if (!selectedId) return;
    await markUnreadApi(selectedId);
    setSelectedId(null);
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
        canSeeAll={canSeeAll}
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
        onSendSpecial={handleSendSpecial}
        onDeleteMessage={handleDelete}
        onForwardMessage={handleForward}
        onRetry={handleRetry}
        onStartChat={(c) => {
          setStartContact(c);
          setShowNew(true);
        }}
        conversations={conversations}
        onSetMode={handleSetMode}
        onSetStatus={handleSetStatus}
        onSetPriority={handleSetPriority}
        onSetDepartment={handleSetDepartment}
        onAssign={handleAssign}
        onToggleLabel={handleToggleLabel}
        onTakeOver={handleTakeOver}
        onReturnToQueue={handleReturnToQueue}
        onMarkUnread={handleMarkUnread}
        onTransferred={refreshConversations}
        currentUserId={currentUserId}
        onBack={() => setSelectedId(null)}
        className={selectedId ? "visible-mobile" : ""}
      />
      {toast && <div className="app-toast">{toast}</div>}
      {showNew && (
        <NewConversationModal
          initialContact={startContact || newConversationContact}
          onClose={() => {
            setShowNew(false);
            setStartContact(null);
            onNewConversationHandled?.();
          }}
          onStarted={(conv) => {
            setShowNew(false);
            setStartContact(null);
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
