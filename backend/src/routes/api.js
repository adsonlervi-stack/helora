import { Router } from "express";
import multer from "multer";
import {
  listConversations,
  getConversation,
  markConversationSeen,
  listMessages,
  addMessage,
  updateConversation,
  listAutoReplies,
  addAutoReply,
  deleteAutoReply,
  getOverviewStats,
  listLabels,
  createLabel,
  deleteLabel,
  setConversationLabels,
  listCannedResponses,
  createCannedResponse,
  deleteCannedResponse,
  listNotes,
  addNote,
  getChannelForAccount,
  listDeals,
  createDeal,
  updateDeal,
  deleteDeal,
  listDealActivities,
  addDealActivity,
  listDepartments,
  createDepartment,
  deleteDepartment,
  listTeam,
  setProfileDepartments,
  getMyProfile,
  updateProfileAvatar,
  getBotFlow,
  saveBotFlow,
  listAnnouncementsFor,
  listScheduledMessages,
  createScheduledMessage,
  cancelScheduledMessage,
  listChannels,
  getChannel,
  createChannel,
  updateChannel,
  deleteChannel,
  getChannelPermissions,
  setChannelPermissions,
  getChannelStatus,
  getPrimaryWhatsAppChannel,
  getMessage,
  addReaction,
  getAccount,
  updateAccountFooterNote,
  createAuthUser,
  createProfile,
  getProfileInAccount,
  updateProfileInAccount,
  countOwners,
  getAuthEmails,
  setUserPassword,
  deleteAuthUser
} from "../config/db.js";
import {
  getWhatsAppStatus,
  sendWhatsAppMessage,
  sendWhatsAppMedia,
  sendWhatsAppReaction,
  startWhatsAppForChannel,
  stopWhatsAppForChannel,
  connectWhatsAppChannel,
  resetWhatsAppChannel,
  requestWhatsAppPairingCode
} from "../whatsapp/baileysClient.js";
import { sendMetaMessage } from "../meta/metaClient.js";
import { CSAT_PROMPT_TEXT } from "../bot/engine.js";
import { sendTextToConversation } from "../messaging.js";
import { requireAuth, requireOwner } from "../middleware/auth.js";
import { uploadMedia, uploadAvatar } from "../storage.js";
import { convertToOggOpus } from "../audio.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Todas as rotas abaixo exigem login — cada uma só enxerga/edita dados
// da própria conta (req.accountId, preenchido pelo middleware).
router.use(requireAuth);

// Um atendente (role 'agent') só pode agir numa conversa do próprio setor
// ou atribuída a ele — a "visão de túnel" do PRD. Gestor/owner e super
// admin não têm essa restrição.
function assertConversationAccess(req, res, conversation) {
  if (!conversation) {
    res.status(404).json({ error: "Conversa não encontrada" });
    return false;
  }
  if (req.role === "agent" && !req.isSuperAdmin) {
    const ownDept = conversation.departmentId && req.departmentIds.includes(conversation.departmentId);
    const assignedToMe = conversation.assignedAgentId === req.userId;
    if (!ownDept && !assignedToMe) {
      res.status(403).json({ error: "Você não tem acesso a esta conversa." });
      return false;
    }
  }
  return true;
}

// ---------- WhatsApp (compatibilidade: dispositivo principal da conta) ----------

router.get("/whatsapp/status", async (req, res) => {
  const channelId = await getPrimaryWhatsAppChannel(req.accountId);
  if (!channelId) return res.json({ status: "disconnected", qr: null, channelId: null });
  res.json({ ...getWhatsAppStatus(channelId), channelId });
});

// ---------- Conta (rodapé editável) ----------

router.get("/account", async (req, res) => {
  const account = await getAccount(req.accountId);
  res.json(account);
});

// Perfil do próprio usuário logado (usado pra recarregar depois de trocar a foto)
router.get("/profile", async (req, res) => {
  const profile = await getMyProfile(req.userId);
  if (!profile) return res.status(404).json({ error: "Perfil não encontrado." });
  res.json(profile);
});

// Comunicados relevantes pro usuário logado (mostrados no Início)
router.get("/announcements", async (req, res) => {
  res.json(await listAnnouncementsFor({ accountId: req.accountId, userId: req.userId }));
});

// Foto de perfil (avatar) do usuário logado
router.post("/profile/avatar", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada." });
  if (!req.file.mimetype.startsWith("image/")) {
    return res.status(400).json({ error: "O arquivo precisa ser uma imagem." });
  }
  if (req.file.size > 5 * 1024 * 1024) {
    return res.status(400).json({ error: "Imagem muito grande (máximo 5MB)." });
  }

  const extension = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();

  try {
    const avatarUrl = await uploadAvatar({
      accountId: req.accountId,
      userId: req.userId,
      buffer: req.file.buffer,
      extension,
      contentType: req.file.mimetype
    });
    await updateProfileAvatar(req.userId, avatarUrl);
    res.json({ avatarUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/account/footer-note", requireOwner, async (req, res) => {
  const { footerNote } = req.body;
  res.json(await updateAccountFooterNote(req.accountId, footerNote || null));
});

// ---------- Setores (departamentos) ----------

router.get("/departments", async (req, res) => {
  res.json(await listDepartments(req.accountId));
});

router.post("/departments", requireOwner, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name é obrigatório" });
  res.json(await createDepartment({ accountId: req.accountId, name }));
});

router.delete("/departments/:id", requireOwner, async (req, res) => {
  await deleteDepartment(req.accountId, req.params.id);
  res.sendStatus(204);
});

// ---------- Equipe (atendentes + setores de cada um) ----------

router.get("/team", async (req, res) => {
  const team = await listTeam(req.accountId);
  // Gestor vê o e-mail de login de cada um (pra saber com qual entrar).
  if (req.role === "owner" || req.isSuperAdmin) {
    const emails = await getAuthEmails(team.map((m) => m.id)).catch(() => ({}));
    team.forEach((m) => (m.email = emails[m.id] || null));
  }
  res.json(team);
});

// ---------- Usuários da empresa (gestor ou super admin) ----------

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ""));

// Cria um usuário na empresa. Com senha: já entra direto. Sem senha: convite por e-mail.
router.post("/team", requireOwner, async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Informe o nome." });
  if (!isValidEmail(email)) return res.status(400).json({ error: "E-mail inválido." });
  if (password && String(password).length < 6) {
    return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres." });
  }
  try {
    const user = await createAuthUser({ email: email.trim().toLowerCase(), password });
    await createProfile({
      userId: user.id,
      accountId: req.accountId,
      role: role === "owner" ? "owner" : "agent",
      name: name.trim(),
      isSuperAdmin: false
    });
    res.status(201).json({ id: user.id, invited: !password });
  } catch (err) {
    const msg = /already|registered|exists/i.test(err.message)
      ? "Já existe um usuário com esse e-mail."
      : err.message;
    res.status(400).json({ error: msg });
  }
});

// Edita nome e/ou papel (Gestor/Atendente).
router.patch("/team/:profileId", requireOwner, async (req, res) => {
  const member = await getProfileInAccount(req.accountId, req.params.profileId);
  if (!member) return res.status(404).json({ error: "Usuário não encontrado nesta empresa." });
  if (member.is_super_admin && req.userId !== member.id) {
    return res.status(403).json({ error: "Não é possível editar o administrador do sistema." });
  }
  const { name, role } = req.body || {};
  if (member.role === "owner" && role === "agent" && (await countOwners(req.accountId)) <= 1) {
    return res.status(400).json({ error: "A empresa precisa ter pelo menos um Gestor." });
  }
  res.json(await updateProfileInAccount(req.accountId, member.id, { name, role }));
});

// Define uma nova senha para o usuário.
router.post("/team/:profileId/password", requireOwner, async (req, res) => {
  const member = await getProfileInAccount(req.accountId, req.params.profileId);
  if (!member) return res.status(404).json({ error: "Usuário não encontrado nesta empresa." });
  if (member.is_super_admin && req.userId !== member.id) {
    return res.status(403).json({ error: "Não é possível alterar a senha do administrador do sistema." });
  }
  const { password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres." });
  }
  try {
    await setUserPassword(member.id, String(password));
    res.sendStatus(204);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove o usuário (perde o acesso; as conversas dele continuam na empresa).
router.delete("/team/:profileId", requireOwner, async (req, res) => {
  const member = await getProfileInAccount(req.accountId, req.params.profileId);
  if (!member) return res.status(404).json({ error: "Usuário não encontrado nesta empresa." });
  if (member.id === req.userId) return res.status(400).json({ error: "Você não pode remover a si mesmo." });
  if (member.is_super_admin) return res.status(403).json({ error: "Não é possível remover o administrador do sistema." });
  if (member.role === "owner" && (await countOwners(req.accountId)) <= 1) {
    return res.status(400).json({ error: "A empresa precisa ter pelo menos um Gestor." });
  }
  try {
    await deleteAuthUser(member.id);
    res.sendStatus(204);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/team/:profileId/departments", requireOwner, async (req, res) => {
  const { departmentIds } = req.body;
  if (!Array.isArray(departmentIds)) {
    return res.status(400).json({ error: "departmentIds deve ser um array" });
  }
  await setProfileDepartments(req.params.profileId, departmentIds);
  res.sendStatus(204);
});

// ---------- Canais (dispositivos de WhatsApp + Messenger/Instagram) ----------

router.get("/channels", async (req, res) => {
  const channels = await listChannels(req.accountId);
  const withStatus = await Promise.all(
    channels.map(async (c) => ({
      ...c,
      ...(c.platform === "whatsapp" ? getWhatsAppStatus(c.id) : {})
    }))
  );
  res.json(withStatus);
});

router.post("/channels", requireOwner, async (req, res) => {
  const { platform, name, departmentId } = req.body;
  if (!platform || !["whatsapp", "messenger", "instagram"].includes(platform)) {
    return res.status(400).json({ error: "platform inválida" });
  }
  const channel = await createChannel({ accountId: req.accountId, platform, name, departmentId });

  if (platform === "whatsapp") {
    startWhatsAppForChannel(channel.id, req.accountId).catch((err) => {
      console.error(`[WhatsApp] Erro ao iniciar dispositivo ${channel.id}:`, err);
    });
  }

  res.status(201).json(channel);
});

router.post("/channels/:id", requireOwner, async (req, res) => {
  const { name, departmentId } = req.body;
  res.json(await updateChannel(req.accountId, req.params.id, { name, departmentId }));
});

router.delete("/channels/:id", requireOwner, async (req, res) => {
  const channel = await getChannel(req.accountId, req.params.id);
  if (channel?.platform === "whatsapp") {
    // Desliga e desvincula o número antes de apagar o canal.
    await stopWhatsAppForChannel(req.params.id, { logout: true, wipe: true }).catch(() => {});
  }
  await deleteChannel(req.accountId, req.params.id);
  res.sendStatus(204);
});

router.get("/channels/:id/status", async (req, res) => {
  const channel = await getChannel(req.accountId, req.params.id);
  if (!channel) return res.status(404).json({ error: "Canal não encontrado" });
  if (channel.platform !== "whatsapp") return res.json({ status: "connected", qr: null });
  res.json(getWhatsAppStatus(req.params.id));
});

// ---------- Conexão do WhatsApp (botões do modal "Conectar") ----------
async function loadWhatsAppChannel(req, res) {
  const channel = await getChannel(req.accountId, req.params.id);
  if (!channel) {
    res.status(404).json({ error: "Canal não encontrado" });
    return null;
  }
  if (channel.platform !== "whatsapp") {
    res.status(400).json({ error: "Este canal não é de WhatsApp." });
    return null;
  }
  return channel;
}

// Abre a conexão (reconecta com a sessão salva ou gera QR Code).
router.post("/channels/:id/whatsapp/connect", requireOwner, async (req, res) => {
  if (!(await loadWhatsAppChannel(req, res))) return;
  try {
    res.json(await connectWhatsAppChannel(req.params.id, req.accountId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Descarta a sessão e gera um QR Code novo.
router.post("/channels/:id/whatsapp/reset", requireOwner, async (req, res) => {
  if (!(await loadWhatsAppChannel(req, res))) return;
  try {
    res.json(await resetWhatsAppChannel(req.params.id, req.accountId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Conecta digitando um código no celular, sem escanear QR.
router.post("/channels/:id/whatsapp/pairing-code", requireOwner, async (req, res) => {
  if (!(await loadWhatsAppChannel(req, res))) return;
  try {
    res.json(await requestWhatsAppPairingCode(req.params.id, req.accountId, req.body?.phone));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Desconecta o número (some de "Aparelhos conectados" no celular).
router.post("/channels/:id/whatsapp/logout", requireOwner, async (req, res) => {
  if (!(await loadWhatsAppChannel(req, res))) return;
  await stopWhatsAppForChannel(req.params.id, { logout: true, wipe: true });
  res.json({ status: "disconnected", qr: null, pairingCode: null, phone: null });
});

router.get("/channels/:id/permissions", requireOwner, async (req, res) => {
  res.json(await getChannelPermissions(req.params.id));
});

router.post("/channels/:id/permissions", requireOwner, async (req, res) => {
  const { profileIds } = req.body;
  if (!Array.isArray(profileIds)) {
    return res.status(400).json({ error: "profileIds deve ser um array" });
  }
  await setChannelPermissions(req.params.id, profileIds);
  res.sendStatus(204);
});

// ---------- Conversas ----------

router.get("/conversations", async (req, res) => {
  const scope = { role: req.isSuperAdmin ? "owner" : req.role, departmentIds: req.departmentIds, userId: req.userId };
  const conversations = await listConversations(req.accountId, scope);
  res.json(conversations);
});

router.get("/conversations/:id/messages", async (req, res) => {
  const conversation = await getConversation(req.accountId, req.params.id);
  if (!assertConversationAccess(req, res, conversation)) return;

  await markConversationSeen(req.accountId, req.params.id);
  const messages = await listMessages(req.accountId, req.params.id);
  res.json({ conversation, messages });
});

router.post("/conversations/:id/mode", async (req, res) => {
  const { mode } = req.body; // 'bot' | 'human'
  if (!["bot", "human"].includes(mode)) {
    return res.status(400).json({ error: "mode deve ser 'bot' ou 'human'" });
  }
  const existing = await getConversation(req.accountId, req.params.id);
  if (!assertConversationAccess(req, res, existing)) return;
  const conversation = await updateConversation(req.accountId, req.params.id, { mode });
  res.json(conversation);
});

router.post("/conversations/:id/status", async (req, res) => {
  const { status } = req.body; // 'open' | 'resolved'
  if (!["open", "resolved"].includes(status)) {
    return res.status(400).json({ error: "status deve ser 'open' ou 'resolved'" });
  }

  const before = await getConversation(req.accountId, req.params.id);
  if (!assertConversationAccess(req, res, before)) return;

  const conversation = await updateConversation(req.accountId, req.params.id, { status });

  // Dispara a pesquisa de satisfação só quando a conversa vira "resolvida"
  // agora (evita reenviar toda vez que reabre/resolve de novo).
  if (status === "resolved" && before.status !== "resolved") {
    try {
      if (conversation.platform === "whatsapp") {
        const channelId = conversation.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
        if (channelId) await sendWhatsAppMessage(channelId, conversation.externalId, CSAT_PROMPT_TEXT);
      } else {
        const channel = await getChannelForAccount(req.accountId, conversation.platform);
        if (channel) {
          await sendMetaMessage(channel.accessToken, conversation.externalId, CSAT_PROMPT_TEXT);
        }
      }
      await addMessage({
        accountId: req.accountId,
        conversationId: conversation.id,
        direction: "out",
        author: "bot",
        text: CSAT_PROMPT_TEXT
      });
      await updateConversation(req.accountId, conversation.id, { awaitingCsat: true });
    } catch (err) {
      console.error("[CSAT] Falha ao enviar pesquisa de satisfação:", err.message);
    }
  }

  res.json(conversation);
});

router.post("/conversations/:id/priority", async (req, res) => {
  const { priority } = req.body; // null | 'urgent' | 'high' | 'medium' | 'low'
  if (priority !== null && !["urgent", "high", "medium", "low"].includes(priority)) {
    return res.status(400).json({ error: "priority inválida" });
  }
  const existing = await getConversation(req.accountId, req.params.id);
  if (!assertConversationAccess(req, res, existing)) return;
  const conversation = await updateConversation(req.accountId, req.params.id, { priority });
  res.json(conversation);
});

// Setor da conversa (roteamento/triagem)
router.post("/conversations/:id/department", async (req, res) => {
  const { departmentId } = req.body;
  const existing = await getConversation(req.accountId, req.params.id);
  if (!assertConversationAccess(req, res, existing)) return;
  const conversation = await updateConversation(req.accountId, req.params.id, { departmentId });
  res.json(conversation);
});

// Atribuir a conversa a um atendente específico ("Transferir")
router.post("/conversations/:id/assign", async (req, res) => {
  const { agentId } = req.body;
  const existing = await getConversation(req.accountId, req.params.id);
  if (!assertConversationAccess(req, res, existing)) return;
  const conversation = await updateConversation(req.accountId, req.params.id, { assignedAgentId: agentId || null });
  res.json(conversation);
});

// Etiquetas de uma conversa específica
router.post("/conversations/:id/labels", async (req, res) => {
  const { labelIds } = req.body; // array de ids
  if (!Array.isArray(labelIds)) {
    return res.status(400).json({ error: "labelIds deve ser um array" });
  }
  const existing = await getConversation(req.accountId, req.params.id);
  if (!assertConversationAccess(req, res, existing)) return;
  const conversation = await setConversationLabels(req.accountId, req.params.id, labelIds);
  res.json(conversation);
});

// Notas internas de uma conversa
router.get("/conversations/:id/notes", async (req, res) => {
  res.json(await listNotes(req.accountId, req.params.id));
});

router.post("/conversations/:id/notes", async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content é obrigatório" });
  res.json(await addNote({ accountId: req.accountId, conversationId: req.params.id, content }));
});

// Envio manual de mensagem pelo painel (atendente humano assume a conversa)
router.post("/conversations/:id/send", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text é obrigatório" });

  const conversation = await getConversation(req.accountId, req.params.id);
  if (!assertConversationAccess(req, res, conversation)) return;

  let message;
  try {
    message = await sendTextToConversation(req.accountId, conversation, text, {
      senderName: req.userName
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json(message);
});

// Envio de anexo (imagem, vídeo ou documento) — só WhatsApp por enquanto.
router.post("/conversations/:id/send-media", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

  const conversation = await getConversation(req.accountId, req.params.id);
  if (!assertConversationAccess(req, res, conversation)) return;

  if (conversation.platform !== "whatsapp") {
    return res.status(400).json({ error: "Envio de anexos hoje só é suportado no WhatsApp." });
  }

  const mediaType = req.file.mimetype.startsWith("image/")
    ? "image"
    : req.file.mimetype.startsWith("video/")
      ? "video"
      : "document";

  const extension = (req.file.originalname.split(".").pop() || "bin").toLowerCase();

  try {
    const channelId = conversation.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
    if (!channelId) return res.status(400).json({ error: "Nenhum dispositivo de WhatsApp conectado." });

    const whatsappMessageId = await sendWhatsAppMedia(channelId, conversation.externalId, {
      buffer: req.file.buffer,
      mediaType,
      mimetype: req.file.mimetype,
      fileName: req.file.originalname,
      caption: req.body.caption || undefined
    });

    const mediaUrl = await uploadMedia({
      accountId: req.accountId,
      buffer: req.file.buffer,
      extension,
      contentType: req.file.mimetype
    });

    const message = await addMessage({
      accountId: req.accountId,
      conversationId: conversation.id,
      direction: "out",
      author: "operator",
      text: req.body.caption || "",
      mediaUrl,
      mediaType,
      whatsappMessageId,
      senderName: req.userName
    });

    await updateConversation(req.accountId, conversation.id, { mode: "human" });
    res.json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Envio de nota de voz gravada no navegador (webm/opus -> ogg/opus)
router.post("/conversations/:id/send-audio", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum áudio enviado." });

  const conversation = await getConversation(req.accountId, req.params.id);
  if (!assertConversationAccess(req, res, conversation)) return;

  if (conversation.platform !== "whatsapp") {
    return res.status(400).json({ error: "Nota de voz hoje só é suportada no WhatsApp." });
  }

  try {
    const oggBuffer = await convertToOggOpus(req.file.buffer);

    const channelId = conversation.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
    if (!channelId) return res.status(400).json({ error: "Nenhum dispositivo de WhatsApp conectado." });

    const whatsappMessageId = await sendWhatsAppMedia(channelId, conversation.externalId, {
      buffer: oggBuffer,
      mediaType: "audio"
    });

    const mediaUrl = await uploadMedia({
      accountId: req.accountId,
      buffer: oggBuffer,
      extension: "ogg",
      contentType: "audio/ogg"
    });

    const message = await addMessage({
      accountId: req.accountId,
      conversationId: conversation.id,
      direction: "out",
      author: "operator",
      text: "",
      mediaUrl,
      mediaType: "audio",
      whatsappMessageId,
      senderName: req.userName
    });

    await updateConversation(req.accountId, conversation.id, { mode: "human" });
    res.json(message);
  } catch (err) {
    console.error("[Áudio] Falha ao converter/enviar nota de voz:", err);
    res.status(500).json({ error: "Falha ao processar o áudio: " + err.message });
  }
});

// ---------- Reações em mensagens ----------

router.post("/messages/:id/react", async (req, res) => {
  const { emoji } = req.body; // emoji (string) ou null/"" pra remover
  const message = await getMessage(req.accountId, req.params.id);
  if (!message) return res.status(404).json({ error: "Mensagem não encontrada" });

  const conversation = await getConversation(req.accountId, message.conversationId);
  if (!assertConversationAccess(req, res, conversation)) return;

  if (conversation.platform === "whatsapp" && message.whatsappMessageId) {
    try {
      const channelId = conversation.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
      if (channelId) {
        await sendWhatsAppReaction(
          channelId,
          conversation.externalId,
          { id: message.whatsappMessageId, fromMe: message.direction === "out" },
          emoji
        );
      }
    } catch (err) {
      console.error("[Reação] Falha ao enviar pro WhatsApp:", err.message);
    }
  }

  const updated = await addReaction(req.accountId, message.id, emoji, "operator");
  res.json(updated);
});

// ---------- Respostas automáticas (palavra-chave -> resposta) ----------

router.get("/autoreplies", async (req, res) => {
  res.json(await listAutoReplies(req.accountId));
});

router.post("/autoreplies", async (req, res) => {
  const { keyword, response } = req.body;
  if (!keyword || !response) {
    return res.status(400).json({ error: "keyword e response são obrigatórios" });
  }
  res.json(await addAutoReply({ accountId: req.accountId, keyword, response }));
});

router.delete("/autoreplies/:id", async (req, res) => {
  await deleteAutoReply(req.accountId, req.params.id);
  res.sendStatus(204);
});

// ---------- Mensagens agendadas ----------

router.get("/scheduled-messages", async (req, res) => {
  res.json(await listScheduledMessages(req.accountId));
});

router.post("/scheduled-messages", async (req, res) => {
  const { conversationId, text, sendAt } = req.body;
  if (!conversationId || !text || !sendAt) {
    return res.status(400).json({ error: "conversationId, text e sendAt são obrigatórios" });
  }
  if (new Date(sendAt).getTime() <= Date.now()) {
    return res.status(400).json({ error: "A data/hora precisa ser no futuro." });
  }
  const conversation = await getConversation(req.accountId, conversationId);
  if (!assertConversationAccess(req, res, conversation)) return;

  const scheduled = await createScheduledMessage({
    accountId: req.accountId,
    conversationId,
    text,
    sendAt,
    createdBy: req.userName
  });
  res.status(201).json(scheduled);
});

router.delete("/scheduled-messages/:id", async (req, res) => {
  await cancelScheduledMessage(req.accountId, req.params.id);
  res.sendStatus(204);
});

// ---------- Fluxo do bot (construtor de árvore de decisão, em JSON) ----------

router.get("/bot-flow", async (req, res) => {
  const flow = await getBotFlow(req.accountId);
  res.json({ flow });
});

router.post("/bot-flow", requireOwner, async (req, res) => {
  const { flow } = req.body;
  if (!flow || typeof flow !== "object" || !flow.startNodeId || !flow.nodes || typeof flow.nodes !== "object") {
    return res.status(400).json({ error: "Fluxo inválido: faltam 'startNodeId' e/ou 'nodes'." });
  }
  if (!flow.nodes[flow.startNodeId]) {
    return res.status(400).json({ error: "O nó inicial escolhido não existe no fluxo." });
  }
  const saved = await saveBotFlow(req.accountId, flow);
  res.json({ flow: saved });
});

// ---------- Etiquetas (cadastro) ----------

router.get("/labels", async (req, res) => {
  res.json(await listLabels(req.accountId));
});

router.post("/labels", async (req, res) => {
  const { title, color } = req.body;
  if (!title) return res.status(400).json({ error: "title é obrigatório" });
  res.json(await createLabel({ accountId: req.accountId, title, color }));
});

router.delete("/labels/:id", async (req, res) => {
  await deleteLabel(req.accountId, req.params.id);
  res.sendStatus(204);
});

// ---------- Respostas prontas do atendente (canned responses) ----------

router.get("/canned-responses", async (req, res) => {
  res.json(await listCannedResponses(req.accountId));
});

router.post("/canned-responses", async (req, res) => {
  const { shortCode, content } = req.body;
  if (!shortCode || !content) {
    return res.status(400).json({ error: "shortCode e content são obrigatórios" });
  }
  res.json(await createCannedResponse({ accountId: req.accountId, shortCode, content }));
});

router.delete("/canned-responses/:id", async (req, res) => {
  await deleteCannedResponse(req.accountId, req.params.id);
  res.sendStatus(204);
});

// ---------- Negócios (funil de vendas / kanban) ----------

router.get("/deals", async (req, res) => {
  res.json(await listDeals(req.accountId));
});

router.post("/deals", async (req, res) => {
  const { conversationId, title, value, stage, ownerId } = req.body;
  if (!title) return res.status(400).json({ error: "title é obrigatório" });
  res.json(
    await createDeal({ accountId: req.accountId, conversationId, title, value, stage, ownerId })
  );
});

router.post("/deals/:id", async (req, res) => {
  const { title, value, stage, ownerId, lostReason } = req.body;
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (value !== undefined) patch.value = value;
  if (stage !== undefined) patch.stage = stage;
  if (ownerId !== undefined) patch.ownerId = ownerId;
  if (lostReason !== undefined) patch.lostReason = lostReason;
  res.json(await updateDeal(req.accountId, req.params.id, patch));
});

router.delete("/deals/:id", async (req, res) => {
  await deleteDeal(req.accountId, req.params.id);
  res.sendStatus(204);
});

// ---------- Histórico de um negócio (painel lateral do Kanban) ----------

router.get("/deals/:id/activities", async (req, res) => {
  res.json(await listDealActivities(req.accountId, req.params.id));
});

router.post("/deals/:id/activities", async (req, res) => {
  const { description } = req.body;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: "description é obrigatório" });
  }
  const activity = await addDealActivity({
    accountId: req.accountId,
    dealId: req.params.id,
    type: "note",
    description: description.trim(),
    createdBy: req.userName
  });
  res.status(201).json(activity);
});

// ---------- Estatísticas ----------

router.get("/stats/overview", async (req, res) => {
  const { dateFrom, dateTo, departmentId, agentId, channelId } = req.query;
  const stats = await getOverviewStats(req.accountId, {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    departmentId: departmentId || undefined,
    agentId: agentId || undefined,
    channelId: channelId || undefined
  });
  res.json(stats);
});

export default router;
