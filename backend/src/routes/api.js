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
  deleteAuthUser,
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  upsertContacts,
  onlyDigits,
  findOrCreateConversation,
  setConversationAvatar,
  getOpenSupportThread,
  listSupportMessages,
  addSupportMessage,
  markSupportRead,
  listFlows,
  getFlow,
  createFlow,
  updateFlow,
  setFlowActive,
  deleteFlow,
  getFlowStats,
  getAgentAccess,
  canAgentSee,
  getProfilePermissions,
  setProfilePermissions,
  listGroups,
  markConversationUnread,
  getOrCreateContactForConversation,
  updateContactLead,
  listDealsForConversation,
  getCreditBalance,
  listCreditLedger,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listCampaignRecipients,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  updateMessageFields,
  listPhonesByLabels,
  getMessage as getMessageById,
  supportQueuePosition,
  getCannedResponse,
  checkChannelLimit,
  getAccountSettings,
  updateAccountSettings,
  updateMyName,
  listStickerUrls
} from "../config/db.js";
import { runGraph } from "../bot/flowRunner.js";
import {
  getWhatsAppStatus,
  sendWhatsAppMessage,
  sendWhatsAppMedia,
  sendWhatsAppReaction,
  startWhatsAppForChannel,
  stopWhatsAppForChannel,
  connectWhatsAppChannel,
  resetWhatsAppChannel,
  requestWhatsAppPairingCode,
  importWhatsAppContacts,
  resolveWhatsAppNumber,
  fetchWhatsAppAvatar,
  deleteWhatsAppMessage,
  sendWhatsAppMediaUrl,
  getWhatsAppStatus as waStatus,
  sendPresence,
  watchPresence,
  sendWhatsAppPayload
} from "../whatsapp/baileysClient.js";
import { toJpeg, toWebp } from "../imageTools.js";
import { sendMetaMessage } from "../meta/metaClient.js";
import { CSAT_PROMPT_TEXT } from "../bot/engine.js";
import { sendTextToConversation, sendSpecialToConversation, baileysQuoted } from "../messaging.js";
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
async function assertConversationAccess(req, res, conversation) {
  if (!conversation) {
    res.status(404).json({ error: "Conversa não encontrada" });
    return false;
  }
  if (req.role === "agent" && !req.isSuperAdmin) {
    const access = await getAgentAccess(req.accountId, req.userId, req.departmentIds);
    if (!canAgentSee(conversation, access)) {
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

// Meu perfil: qualquer usuário altera o próprio nome e senha (o e-mail não muda).
router.patch("/profile", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (name.length < 2) return res.status(400).json({ error: "Informe seu nome." });
  await updateMyName(req.userId, name.slice(0, 80));
  res.json(await getMyProfile(req.userId));
});

router.post("/profile/password", async (req, res) => {
  const password = String(req.body?.password || "");
  if (password.length < 6) return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres." });
  try {
    await setUserPassword(req.userId, password);
    res.sendStatus(204);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Configurações da empresa (pesquisa de satisfação e horário de atendimento)
router.get("/account-settings", async (req, res) => {
  res.json(await getAccountSettings(req.accountId));
});

router.patch("/account-settings", requireOwner, async (req, res) => {
  try {
    res.json(await updateAccountSettings(req.accountId, req.body || {}));
  } catch (err) {
    res.status(400).json({ error: /column/.test(err.message) ? "Rode a migration 017 no Supabase." : err.message });
  }
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
    const { channelIds, departmentIds, groupIds } = req.body || {};
    await setProfilePermissions(req.accountId, user.id, { channelIds, departmentIds, groupIds }).catch((e) =>
      console.error("[Equipe] permissões:", e.message)
    );
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
  const updated = await updateProfileInAccount(req.accountId, member.id, { name, role });
  const { channelIds, departmentIds, groupIds } = req.body || {};
  if (channelIds || departmentIds || groupIds) {
    await setProfilePermissions(req.accountId, member.id, { channelIds, departmentIds, groupIds });
  }
  res.json(updated);
});

router.get("/team/:profileId/permissions", requireOwner, async (req, res) => {
  const member = await getProfileInAccount(req.accountId, req.params.profileId);
  if (!member) return res.status(404).json({ error: "Usuário não encontrado nesta empresa." });
  res.json(await getProfilePermissions(req.accountId, member.id));
});

router.get("/groups", async (req, res) => {
  res.json(await listGroups(req.accountId));
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
  const { platform, name, departmentId, flowId } = req.body;
  if (!platform || !["whatsapp", "messenger", "instagram"].includes(platform)) {
    return res.status(400).json({ error: "platform inválida" });
  }
  try {
    await checkChannelLimit(req.accountId, platform);
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
  let channel = await createChannel({ accountId: req.accountId, platform, name, departmentId });
  if (flowId) channel = (await updateChannel(req.accountId, channel.id, { flowId }).catch(() => null)) || channel;

  if (platform === "whatsapp") {
    startWhatsAppForChannel(channel.id, req.accountId).catch((err) => {
      console.error(`[WhatsApp] Erro ao iniciar dispositivo ${channel.id}:`, err);
    });
  }

  res.status(201).json(channel);
});

router.post("/channels/:id", requireOwner, async (req, res) => {
  const { name, departmentId, flowId } = req.body;
  try {
    res.json(await updateChannel(req.accountId, req.params.id, { name, departmentId, flowId }));
  } catch (err) {
    res.status(400).json({ error: /flow_id/.test(err.message) ? "Rode a migration 016 no Supabase para escolher o fluxo do canal." : err.message });
  }
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

// ---------- Contatos ----------

router.get("/contacts", async (req, res) => {
  try {
    res.json(await listContacts(req.accountId, req.query.search));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/contacts", async (req, res) => {
  const phone = onlyDigits(req.body?.phone);
  if (phone.length < 10) return res.status(400).json({ error: "Telefone inválido. Use DDI + DDD + número." });
  try {
    res.status(201).json(await createContact(req.accountId, { ...req.body, phone }));
  } catch (err) {
    res.status(400).json({ error: /duplicate|unique/i.test(err.message) ? "Já existe um contato com esse número." : err.message });
  }
});

router.patch("/contacts/:id", async (req, res) => {
  try {
    res.json(await updateContact(req.accountId, req.params.id, req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/contacts/:id", requireOwner, async (req, res) => {
  await deleteContact(req.accountId, req.params.id);
  res.sendStatus(204);
});

// Importa a agenda do WhatsApp conectado + todo mundo que já conversou.
router.post("/contacts/import", async (req, res) => {
  const channelId = await getPrimaryWhatsAppChannel(req.accountId);
  if (!channelId) return res.status(400).json({ error: "Nenhum WhatsApp cadastrado nesta empresa." });
  try {
    const { received } = await importWhatsAppContacts(channelId);
    const convs = await listConversations(req.accountId, { role: "owner" });
    const fromConvs = convs
      .filter((c) => c.platform === "whatsapp" && /@s\.whatsapp\.net$/.test(c.externalId))
      .map((c) => ({ phone: c.externalId.split("@")[0], pushName: c.name }));
    const r = await upsertContacts(req.accountId, channelId, fromConvs, "conversa");
    res.json({ fromWhatsApp: received, fromConversations: r.created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Inicia (ou reabre) uma conversa de WhatsApp pelo número e já manda a 1ª mensagem.
router.post("/conversations/start", async (req, res) => {
  const phone = onlyDigits(req.body?.phone);
  const text = String(req.body?.text || "").trim();
  if (phone.length < 10) return res.status(400).json({ error: "Telefone inválido. Use DDI + DDD + número." });
  if (!text) return res.status(400).json({ error: "Escreva a primeira mensagem." });

  const channelId = await getPrimaryWhatsAppChannel(req.accountId);
  if (!channelId) return res.status(400).json({ error: "Nenhum WhatsApp cadastrado nesta empresa." });

  try {
    const jid = await resolveWhatsAppNumber(channelId, phone);
    const name = req.body?.name?.trim() || phone;
    let conversation = await findOrCreateConversation({
      accountId: req.accountId,
      platform: "whatsapp",
      externalId: jid,
      name,
      channelId
    });
    conversation = await updateConversation(req.accountId, conversation.id, {
      status: "open",
      mode: "human",
      assignedAgentId: req.userId,
      isNew: false
    });
    // Grava com o número oficial do WhatsApp (no Brasil às vezes sem o 9 extra).
    await upsertContacts(req.accountId, channelId, [{ phone: jid.split("@")[0], name: req.body?.name?.trim() || null }], "manual");
    fetchWhatsAppAvatar(channelId, jid).then((url) => url && setConversationAvatar(conversation.id, url));
    await sendTextToConversation(req.accountId, conversation, text, { senderName: req.userName, sign: req.body?.sign !== false });
    res.status(201).json(conversation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- Suporte (fala com a Helora) ----------

router.get("/support", async (req, res) => {
  try {
    const thread = await getOpenSupportThread(req.accountId);
    if (!thread) return res.json({ thread: null, messages: [] });
    await markSupportRead(thread.id, "user");
    res.json({
      thread: {
        id: thread.id,
        status: thread.status,
        acceptedBy: thread.accepted_by || null,
        queuePosition: thread.status === "waiting" ? await supportQueuePosition(thread.id) : null
      },
      messages: await listSupportMessages(thread.id)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/support/messages", async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Escreva uma mensagem." });
  try {
    res.status(201).json(
      await addSupportMessage({
        accountId: req.accountId,
        userId: req.userId,
        authorName: req.userName,
        fromAdmin: false,
        text
      })
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Atendimento: não lido, transferência, painel do cliente ----------

router.post("/conversations/:id/unread", async (req, res) => {
  const conversation = await getConversation(req.accountId, req.params.id);
  if (!(await assertConversationAccess(req, res, conversation))) return;
  await markConversationUnread(req.accountId, req.params.id);
  res.sendStatus(204);
});

router.post("/conversations/:id/transfer", async (req, res) => {
  const conversation = await getConversation(req.accountId, req.params.id);
  if (!(await assertConversationAccess(req, res, conversation))) return;
  const { departmentId, agentId, note } = req.body || {};
  if (!departmentId && !agentId) return res.status(400).json({ error: "Escolha um setor ou um atendente." });
  const patch = { mode: "human" };
  if (departmentId !== undefined) patch.departmentId = departmentId || null;
  patch.assignedAgentId = agentId || null; // sem atendente = vai para Pendentes do setor
  const updated = await updateConversation(req.accountId, req.params.id, patch);
  const team = await listTeam(req.accountId);
  const deps = await listDepartments(req.accountId);
  const to = [deps.find((d) => d.id === departmentId)?.name, team.find((t) => t.id === agentId)?.name].filter(Boolean).join(" / ");
  await addNote({
    accountId: req.accountId,
    conversationId: req.params.id,
    content: `🔁 Transferido por ${req.userName || "atendente"} para ${to || "a fila"}${note ? `\nObservação: ${note}` : ""}`
  });
  res.json(updated);
});

router.get("/conversations/:id/contact", async (req, res) => {
  const conversation = await getConversation(req.accountId, req.params.id);
  if (!(await assertConversationAccess(req, res, conversation))) return;
  try {
    const contact = await getOrCreateContactForConversation(req.accountId, conversation);
    const deals = await listDealsForConversation(req.accountId, conversation.id, contact?.phone);
    res.json({ contact, deals });
  } catch (err) {
    res.json({ contact: null, deals: [], error: err.message });
  }
});

router.patch("/contacts/:id/lead", async (req, res) => {
  try {
    res.json(await updateContactLead(req.accountId, req.params.id, req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/conversations/:id/deals", async (req, res) => {
  const conversation = await getConversation(req.accountId, req.params.id);
  if (!(await assertConversationAccess(req, res, conversation))) return;
  const { title, value, stage } = req.body || {};
  const phone = String(conversation.externalId || "").split("@")[0];
  try {
    res.status(201).json(
      await createDeal({
        accountId: req.accountId,
        conversationId: conversation.id,
        title: title || conversation.name,
        value,
        stage,
        ownerId: req.userId,
        contactName: conversation.name,
        contactPhone: /^\d{10,15}$/.test(phone) ? phone : null,
        source: "conversa"
      })
    );
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- Créditos ----------

router.get("/credits", async (req, res) => {
  res.json({ balance: await getCreditBalance(req.accountId), ledger: await listCreditLedger(req.accountId, 50) });
});

// ---------- Campanhas (disparo em massa) ----------

router.get("/campaigns", async (req, res) => {
  try {
    res.json(await listCampaigns(req.accountId));
  } catch (err) {
    res.status(500).json({ error: /campaigns/.test(err.message) ? "Rode o arquivo migration_015 no Supabase." : err.message });
  }
});

router.get("/campaigns/:id", async (req, res) => {
  const c = await getCampaign(req.accountId, req.params.id);
  if (!c) return res.status(404).json({ error: "Campanha não encontrada." });
  res.json({ ...c, recipients: await listCampaignRecipients(req.accountId, c.id) });
});

router.post("/campaigns", requireOwner, async (req, res) => {
  const b = req.body || {};
  if (!String(b.message || "").trim()) return res.status(400).json({ error: "Escreva a mensagem." });
  try {
    let recipients = Array.isArray(b.recipients) ? b.recipients : [];
    if (b.allContacts || (Array.isArray(b.contactIds) && b.contactIds.length)) {
      const all = await listContacts(req.accountId, "");
      const ids = new Set(b.contactIds || []);
      recipients = recipients.concat(
        all.filter((c) => b.allContacts || ids.has(c.id)).map((c) => ({ phone: c.phone, name: c.name || c.pushName }))
      );
    }
    if (Array.isArray(b.labelIds) && b.labelIds.length) {
      recipients = recipients.concat(await listPhonesByLabels(req.accountId, b.labelIds));
    }
    if (recipients.length > 5000) return res.status(400).json({ error: "Máximo de 5000 destinatários por campanha." });
    res.status(201).json(await createCampaign(req.accountId, req.userId, b, recipients));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/campaigns/:id/:action(start|pause|cancel)", requireOwner, async (req, res) => {
  const c = await getCampaign(req.accountId, req.params.id);
  if (!c) return res.status(404).json({ error: "Campanha não encontrada." });
  const action = req.params.action;
  if (action === "start") {
    if (["done", "canceled"].includes(c.status)) return res.status(400).json({ error: "Campanha já encerrada." });
    const balance = await getCreditBalance(req.accountId);
    const pending = c.total - c.sent - c.failed;
    if (balance <= 0) return res.status(402).json({ error: "Sem créditos. Fale com a Helora para liberar mais." });
    const patch = { status: "running", pause_reason: balance < pending ? `Saldo (${balance}) menor que o restante (${pending}); vai pausar quando acabar.` : null };
    if (!c.startedAt) patch.started_at = new Date().toISOString();
    return res.json(await updateCampaign(req.accountId, c.id, patch));
  }
  if (action === "pause") return res.json(await updateCampaign(req.accountId, c.id, { status: "paused", pause_reason: "Pausada manualmente." }));
  return res.json(await updateCampaign(req.accountId, c.id, { status: "canceled", finished_at: new Date().toISOString() }));
});

router.delete("/campaigns/:id", requireOwner, async (req, res) => {
  await deleteCampaign(req.accountId, req.params.id);
  res.sendStatus(204);
});

// ---------- Chaves da API aberta ----------

router.get("/api-keys", requireOwner, async (req, res) => {
  try {
    res.json(await listApiKeys(req.accountId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api-keys", requireOwner, async (req, res) => {
  try {
    res.status(201).json(await createApiKey(req.accountId, req.userId, String(req.body?.name || "Chave").slice(0, 60)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/api-keys/:id", requireOwner, async (req, res) => {
  await revokeApiKey(req.accountId, req.params.id);
  res.sendStatus(204);
});

router.get("/conversations/:id/messages", async (req, res) => {
  const conversation = await getConversation(req.accountId, req.params.id);
  if (!(await assertConversationAccess(req, res, conversation))) return;

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
  if (!(await assertConversationAccess(req, res, existing))) return;
  const conversation = await updateConversation(req.accountId, req.params.id, { mode });
  res.json(conversation);
});

router.post("/conversations/:id/status", async (req, res) => {
  const { status } = req.body; // 'open' | 'resolved'
  if (!["open", "resolved"].includes(status)) {
    return res.status(400).json({ error: "status deve ser 'open' ou 'resolved'" });
  }

  const before = await getConversation(req.accountId, req.params.id);
  if (!(await assertConversationAccess(req, res, before))) return;

  const conversation = await updateConversation(req.accountId, req.params.id, { status });

  // Dispara a pesquisa de satisfação só quando a conversa vira "resolvida"
  // agora (evita reenviar toda vez que reabre/resolve de novo).
  const csatOn = (await getAccountSettings(req.accountId).catch(() => ({ csatEnabled: true }))).csatEnabled;
  if (status === "resolved" && before.status !== "resolved" && csatOn && !conversation.isGroup) {
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
  if (!(await assertConversationAccess(req, res, existing))) return;
  const conversation = await updateConversation(req.accountId, req.params.id, { priority });
  res.json(conversation);
});

// Setor da conversa (roteamento/triagem)
router.post("/conversations/:id/department", async (req, res) => {
  const { departmentId } = req.body;
  const existing = await getConversation(req.accountId, req.params.id);
  if (!(await assertConversationAccess(req, res, existing))) return;
  const conversation = await updateConversation(req.accountId, req.params.id, { departmentId });
  res.json(conversation);
});

// Atribuir a conversa a um atendente específico ("Transferir")
router.post("/conversations/:id/assign", async (req, res) => {
  const { agentId } = req.body;
  const existing = await getConversation(req.accountId, req.params.id);
  if (!(await assertConversationAccess(req, res, existing))) return;
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
  if (!(await assertConversationAccess(req, res, existing))) return;
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
  if (!(await assertConversationAccess(req, res, conversation))) return;

  let message;
  try {
    message = await sendTextToConversation(req.accountId, conversation, text, {
      senderName: req.userName,
      sign: req.body?.sign !== false,
      quotedId: req.body?.quotedId || null
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json(message);
});

// "Digitando…": o atendente avisa o cliente (WhatsApp) e o painel vê quando o cliente digita.
router.post("/conversations/:id/typing", async (req, res) => {
  const conversation = await getConversation(req.accountId, req.params.id);
  if (!conversation || conversation.platform !== "whatsapp" || conversation.isGroup) return res.sendStatus(204);
  const channelId = conversation.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
  sendPresence(channelId, conversation.externalId, req.body?.typing ? "composing" : "paused").catch(() => {});
  res.sendStatus(204);
});

router.get("/conversations/:id/presence", async (req, res) => {
  const conversation = await getConversation(req.accountId, req.params.id);
  if (!conversation || conversation.platform !== "whatsapp") return res.json({ typing: false });
  const channelId = conversation.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
  res.json(await watchPresence(channelId, conversation.externalId));
});

// Figurinhas: lista as recebidas (as do WhatsApp da empresa) e envia uma delas
router.get("/stickers", async (req, res) => {
  res.json(await listStickerUrls(req.accountId));
});

router.post("/conversations/:id/send-sticker", upload.single("file"), async (req, res) => {
  const conversation = await getConversation(req.accountId, req.params.id);
  if (!(await assertConversationAccess(req, res, conversation))) return;
  if (conversation.platform !== "whatsapp") return res.status(400).json({ error: "Figurinhas só no WhatsApp." });
  try {
    let buffer;
    if (req.file) buffer = (await toWebp(req.file.buffer, { maxSize: 512, quality: 80 })) || req.file.buffer;
    else if (req.body?.url) buffer = Buffer.from(await (await fetch(req.body.url)).arrayBuffer());
    else return res.status(400).json({ error: "Escolha uma figurinha." });
    const channelId = conversation.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
    const waId = await sendWhatsAppPayload(channelId, conversation.externalId, { sticker: buffer });
    const mediaUrl = req.body?.url || (await uploadMedia({ accountId: req.accountId, buffer, extension: "webp", contentType: "image/webp" }));
    const message = await addMessage({
      accountId: req.accountId, conversationId: conversation.id, direction: "out", author: "operator",
      text: "", mediaUrl, mediaType: "sticker", whatsappMessageId: waId, senderName: req.userName, status: "sent"
    });
    await updateConversation(req.accountId, conversation.id, { mode: "human" });
    res.json(message);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Contato (vCard) e localização
router.post("/conversations/:id/send-special", async (req, res) => {
  const conversation = await getConversation(req.accountId, req.params.id);
  if (!(await assertConversationAccess(req, res, conversation))) return;
  try {
    res.json(await sendSpecialToConversation(req.accountId, conversation, req.body || {}, { senderName: req.userName }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Status do WhatsApp do canal desta conversa (bloqueia o campo de mensagem quando cai)
router.get("/conversations/:id/channel-status", async (req, res) => {
  const conversation = await getConversation(req.accountId, req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversa não encontrada" });
  if (conversation.platform !== "whatsapp") return res.json({ status: "connected" });
  const channelId = conversation.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
  if (!channelId) return res.json({ status: "disconnected", channelId: null });
  res.json({ status: waStatus(channelId).status, channelId });
});

// Apagar mensagem enviada (para todos no WhatsApp)
router.post("/messages/:id/delete", async (req, res) => {
  const message = await getMessageById(req.accountId, req.params.id);
  if (!message) return res.status(404).json({ error: "Mensagem não encontrada." });
  const conversation = await getConversation(req.accountId, message.conversationId);
  if (!(await assertConversationAccess(req, res, conversation))) return;
  if (message.direction !== "out") return res.status(400).json({ error: "Só dá para apagar mensagens enviadas pela empresa." });
  if (message.deletedAt) return res.json(message);
  if (Date.now() - new Date(message.timestamp).getTime() > 2 * 24 * 3600 * 1000) {
    return res.status(400).json({ error: "O WhatsApp só deixa apagar para todos até 2 dias depois do envio." });
  }
  try {
    if (conversation.platform === "whatsapp" && message.whatsappMessageId) {
      const channelId = conversation.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
      await deleteWhatsAppMessage(channelId, conversation.externalId, { id: message.whatsappMessageId, fromMe: true });
    }
    res.json(await updateMessageFields(req.accountId, message.id, { deleted_at: new Date().toISOString(), deleted_by: req.userName || "atendente" }));
  } catch (err) {
    res.status(400).json({ error: /deleted_at/.test(err.message) ? "Rode a migration 016 no Supabase." : err.message });
  }
});

// Encaminhar para outras conversas
router.post("/messages/:id/forward", async (req, res) => {
  const message = await getMessageById(req.accountId, req.params.id);
  if (!message) return res.status(404).json({ error: "Mensagem não encontrada." });
  const source = await getConversation(req.accountId, message.conversationId);
  if (!(await assertConversationAccess(req, res, source))) return;
  const ids = (Array.isArray(req.body?.conversationIds) ? req.body.conversationIds : []).slice(0, 20);
  if (!ids.length) return res.status(400).json({ error: "Escolha pelo menos uma conversa." });
  const results = [];
  for (const id of ids) {
    try {
      const target = await getConversation(req.accountId, id);
      if (!target) throw new Error("Conversa não encontrada");
      if (message.extra?.type) {
        await sendSpecialToConversation(req.accountId, target, message.extra, { senderName: req.userName });
      } else if (message.mediaUrl) {
        const channelId = target.channelId || (await getPrimaryWhatsAppChannel(req.accountId));
        const waId = await sendWhatsAppMediaUrl(channelId, target.externalId, {
          url: message.mediaUrl,
          mediaType: message.mediaType === "audio" ? "document" : message.mediaType,
          caption: message.text || undefined
        });
        await addMessage({
          accountId: req.accountId, conversationId: target.id, direction: "out", author: "operator",
          text: message.text || "", mediaUrl: message.mediaUrl, mediaType: message.mediaType,
          whatsappMessageId: waId, senderName: req.userName, status: "sent", forwarded: true
        });
      } else {
        await sendTextToConversation(req.accountId, target, message.text, { senderName: req.userName, sign: false, forwarded: true });
      }
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }
  res.json({ results });
});

// Envio de anexo (imagem, vídeo ou documento) — só WhatsApp por enquanto.
router.post("/conversations/:id/send-media", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

  const conversation = await getConversation(req.accountId, req.params.id);
  if (!(await assertConversationAccess(req, res, conversation))) return;

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

    // Imagem: JPEG comprimido para o WhatsApp e WebP leve para o painel.
    let waBuffer = req.file.buffer;
    let store = { buffer: req.file.buffer, extension, contentType: req.file.mimetype };
    if (mediaType === "image" && !/gif/.test(req.file.mimetype)) {
      waBuffer = (await toJpeg(req.file.buffer)) || req.file.buffer;
      const webp = await toWebp(req.file.buffer);
      if (webp) store = { buffer: webp, extension: "webp", contentType: "image/webp" };
    }
    let quoted = null;
    if (req.body.quotedId) {
      const q = await getMessageById(req.accountId, req.body.quotedId).catch(() => null);
      if (q?.conversationId === conversation.id) quoted = baileysQuoted(conversation, q);
    }

    const whatsappMessageId = await sendWhatsAppMedia(channelId, conversation.externalId, {
      buffer: waBuffer,
      mediaType,
      mimetype: req.file.mimetype,
      fileName: req.file.originalname,
      caption: req.body.caption || undefined,
      quoted
    });

    const mediaUrl = await uploadMedia({ accountId: req.accountId, ...store });

    const message = await addMessage({
      accountId: req.accountId,
      conversationId: conversation.id,
      direction: "out",
      author: "operator",
      text: req.body.caption || "",
      mediaUrl,
      mediaType,
      whatsappMessageId,
      senderName: req.userName,
      status: "sent"
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
  if (!(await assertConversationAccess(req, res, conversation))) return;

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
  if (!(await assertConversationAccess(req, res, conversation))) return;

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
  if (!(await assertConversationAccess(req, res, conversation))) return;

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

// ---------- Fluxos (construtor em canvas) ----------

const STARTER_GRAPH = () => ({
  nodes: [
    { id: "start", type: "trigger", x: 80, y: 220, data: {} },
    {
      id: "boas-vindas",
      type: "options",
      x: 380,
      y: 160,
      data: {
        text: "Olá! 👋 Seja bem-vindo(a). Como podemos ajudar?",
        options: [
          { id: "op1", label: "Comercial" },
          { id: "op2", label: "Financeiro" },
          { id: "op3", label: "Falar com atendente" }
        ],
        invalidText: "Não entendi. Responda com o número da opção:",
        maxRetries: 2
      }
    },
    { id: "transferir", type: "action", x: 760, y: 220, data: { action: "transfer", text: "Só um momento, já vou te passar para nossa equipe! 😊" } }
  ],
  edges: [
    { id: "e1", from: "start", port: "out", to: "boas-vindas" },
    { id: "e2", from: "boas-vindas", port: "op1", to: "transferir" },
    { id: "e3", from: "boas-vindas", port: "op2", to: "transferir" },
    { id: "e4", from: "boas-vindas", port: "op3", to: "transferir" }
  ]
});

function validateGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return "Fluxo inválido.";
  if (graph.nodes.filter((n) => n.type === "trigger").length !== 1) return "O fluxo precisa ter exatamente 1 bloco de início.";
  if (graph.nodes.length > 300) return "Fluxo grande demais (máx. 300 blocos).";
  return null;
}

router.get("/flows", async (req, res) => {
  try {
    res.json(await listFlows(req.accountId));
  } catch (err) {
    res.status(500).json({ error: /flows/.test(err.message) ? "Rode o arquivo migration_014_fluxos.sql no Supabase." : err.message });
  }
});

router.post("/flows", requireOwner, async (req, res) => {
  const name = String(req.body?.name || "").trim() || "Novo fluxo";
  try {
    const source = req.body?.duplicateFrom ? await getFlow(req.accountId, req.body.duplicateFrom) : null;
    res.status(201).json(
      await createFlow(req.accountId, { name, description: req.body?.description, graph: source ? source.graph : STARTER_GRAPH() })
    );
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/flows/:id", async (req, res) => {
  const flow = await getFlow(req.accountId, req.params.id);
  if (!flow) return res.status(404).json({ error: "Fluxo não encontrado." });
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
  const stats = await getFlowStats(req.accountId, flow.id, days).catch(() => ({}));
  res.json({ ...flow, stats });
});

router.put("/flows/:id", requireOwner, async (req, res) => {
  const { name, description, graph } = req.body || {};
  if (graph) {
    const problem = validateGraph(graph);
    if (problem) return res.status(400).json({ error: problem });
  }
  const flow = await updateFlow(req.accountId, req.params.id, { name, description, graph });
  if (!flow) return res.status(404).json({ error: "Fluxo não encontrado." });
  res.json(flow);
});

router.post("/flows/:id/active", requireOwner, async (req, res) => {
  try {
    res.json(await setFlowActive(req.accountId, req.params.id, !!req.body?.active));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/flows/:id", requireOwner, async (req, res) => {
  await deleteFlow(req.accountId, req.params.id);
  res.sendStatus(204);
});

// Testar o fluxo: simula uma conversa sem enviar nada para ninguém.
router.post("/flows/:id/simulate", async (req, res) => {
  const saved = await getFlow(req.accountId, req.params.id);
  if (!saved) return res.status(404).json({ error: "Fluxo não encontrado." });
  const graph = req.body?.graph || saved.graph;
  const problem = validateGraph(graph);
  if (problem) return res.status(400).json({ error: problem });
  const state = req.body?.state || {};
  const fake = {
    id: "simulacao",
    name: "Cliente teste",
    externalId: "5584999990000@s.whatsapp.net",
    botNodeId: state.botNodeId || null,
    flowVars: state.flowVars || {}
  };
  try {
    const r = await runGraph({ accountId: req.accountId, conversation: fake, flow: { ...saved, graph }, text: req.body?.text || "", dryRun: true });
    res.json({ messages: r.log, state: { botNodeId: r.state.botNodeId || null, flowVars: r.state.flowVars || {} }, ended: !r.state.botNodeId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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
  res.json(await listCannedResponses(req.accountId, req.userId));
});

router.post("/canned-responses", async (req, res) => {
  const { shortCode, content } = req.body;
  if (!shortCode || !content) {
    return res.status(400).json({ error: "shortCode e content são obrigatórios" });
  }
  // Atendente só cria respostas pessoais; gestor escolhe (empresa ou só para ele).
  const personal = req.role !== "owner" && !req.isSuperAdmin ? true : !!req.body.personal;
  try {
    res.json(await createCannedResponse({ accountId: req.accountId, shortCode, content, ownerId: personal ? req.userId : null }));
  } catch (err) {
    res.status(400).json({ error: /owner_id/.test(err.message) ? "Rode a migration 017 no Supabase." : err.message });
  }
});

router.delete("/canned-responses/:id", async (req, res) => {
  const c = await getCannedResponse(req.accountId, req.params.id);
  if (!c) return res.sendStatus(204);
  const isManager = req.role === "owner" || req.isSuperAdmin;
  if (c.personal ? c.ownerId !== req.userId : !isManager) return res.status(403).json({ error: "Você não pode apagar esta resposta." });
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
