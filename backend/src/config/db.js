import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[Supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados no .env"
  );
}

// O backend usa a service_role key: ela ignora as políticas de RLS,
// então essa chave nunca pode ser exposta no frontend. Isolamento entre
// contas é garantido aqui no código (todo filtro leva account_id).
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------- Helpers de mapeamento (snake_case do banco -> camelCase do app) ----------

function mapConversation(row) {
  if (!row) return null;
  const labels = Array.isArray(row.conversation_labels)
    ? row.conversation_labels.map((cl) => cl.labels).filter(Boolean)
    : undefined;

  return {
    id: row.id,
    accountId: row.account_id,
    platform: row.platform,
    externalId: row.external_id,
    name: row.name,
    mode: row.mode,
    status: row.status,
    priority: row.priority,
    awaitingCsat: row.awaiting_csat,
    departmentId: row.department_id,
    departmentName: row.departments?.name,
    assignedAgentId: row.assigned_agent_id,
    assignedAgentName: row.assigned_profile?.name,
    channelId: row.channel_id,
    channelName: row.channels?.name,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    unread: row.unread,
    isNew: row.is_new,
    botNodeId: row.bot_node_id,
    lastMessagePreview: row.last_message_preview || null,
    flowId: row.flow_id || null,
    isGroup: !!row.is_group,
    flowVars: row.flow_vars || {},
    avatarUrl: row.avatar_url || null,
    ...(labels ? { labels } : {})
  };
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    conversationId: row.conversation_id,
    direction: row.direction,
    author: row.author,
    text: row.text,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    whatsappMessageId: row.whatsapp_message_id,
    reactions: row.reactions || [],
    senderName: row.sender_name,
    timestamp: row.timestamp
  };
}

function toSnakeCasePatch(patch) {
  const map = {
    externalId: "external_id",
    lastMessageAt: "last_message_at",
    isNew: "is_new",
    awaitingCsat: "awaiting_csat",
    departmentId: "department_id",
    assignedAgentId: "assigned_agent_id",
    channelId: "channel_id",
    botNodeId: "bot_node_id",
    flowId: "flow_id",
    flowVars: "flow_vars"
  };
  const out = {};
  for (const [key, value] of Object.entries(patch)) {
    out[map[key] || key] = value;
  }
  return out;
}

const CONVERSATION_SELECT =
  "*, conversation_labels(labels(*)), departments(name), assigned_profile:profiles!conversations_assigned_agent_id_fkey(name), channels(name)";

// ---------- Contas ----------

export async function listAccounts() {
  const { data, error } = await supabase.from("accounts").select("*").order("created_at");
  if (error) throw error;
  return data;
}

export async function listActiveAccountIds() {
  const { data, error } = await supabase.from("accounts").select("id").eq("status", "active");
  if (error) throw error;
  return data.map((a) => a.id);
}

export async function createAccount({ name }) {
  const { data, error } = await supabase.from("accounts").insert({ name }).select().single();
  if (error) throw error;
  return data;
}

export async function getAccount(id) {
  const { data, error } = await supabase.from("accounts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateAccountFooterNote(accountId, footerNote) {
  const { data, error } = await supabase
    .from("accounts")
    .update({ footer_note: footerNote })
    .eq("id", accountId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Fluxo do bot (árvore de decisão configurável em JSON) ----------

// Retorna `null` quando a conta ainda não configurou um fluxo próprio —
// nesse caso o motor do bot (bot/engine.js) usa o menu padrão fixo, pra
// não quebrar quem já estava rodando antes dessa etapa existir.
export async function getBotFlow(accountId) {
  const { data, error } = await supabase
    .from("bot_flows")
    .select("flow")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  return data?.flow || null;
}

export async function saveBotFlow(accountId, flow) {
  const { data, error } = await supabase
    .from("bot_flows")
    .upsert({ account_id: accountId, flow, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data.flow;
}

// ---------- Mensagens agendadas ----------

function mapScheduledMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    conversationName: row.conversations?.name,
    conversationPlatform: row.conversations?.platform,
    text: row.text,
    sendAt: row.send_at,
    status: row.status,
    error: row.error,
    createdBy: row.created_by,
    createdAt: row.created_at,
    sentAt: row.sent_at
  };
}

export async function listScheduledMessages(accountId) {
  const { data, error } = await supabase
    .from("scheduled_messages")
    .select("*, conversations(name, platform)")
    .eq("account_id", accountId)
    .order("send_at", { ascending: true });
  if (error) throw error;
  return data.map(mapScheduledMessage);
}

export async function createScheduledMessage({ accountId, conversationId, text, sendAt, createdBy }) {
  const { data, error } = await supabase
    .from("scheduled_messages")
    .insert({
      account_id: accountId,
      conversation_id: conversationId,
      text,
      send_at: sendAt,
      created_by: createdBy || null
    })
    .select("*, conversations(name, platform)")
    .single();
  if (error) throw error;
  return mapScheduledMessage(data);
}

export async function cancelScheduledMessage(accountId, id) {
  const { error } = await supabase
    .from("scheduled_messages")
    .update({ status: "canceled" })
    .eq("account_id", accountId)
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw error;
}

// Usado só pelo despachante (backend/src/scheduler.js) — varre TODAS as
// contas, por isso não recebe accountId.
export async function getDueScheduledMessages() {
  const { data, error } = await supabase
    .from("scheduled_messages")
    .select("*, conversations(id, account_id, platform, external_id, channel_id, name)")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .limit(50);
  if (error) throw error;
  return data;
}

export async function markScheduledMessageSent(id) {
  const { error } = await supabase
    .from("scheduled_messages")
    .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
    .eq("id", id);
  if (error) throw error;
}

export async function markScheduledMessageFailed(id, errorMessage) {
  const { error } = await supabase
    .from("scheduled_messages")
    .update({ status: "failed", error: errorMessage })
    .eq("id", id);
  if (error) throw error;
}

function mapAnnouncement(row) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    link: row.link,
    scope: row.scope,
    accountId: row.account_id,
    accountName: row.accounts?.name,
    userId: row.user_id,
    userName: row.profiles?.name,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

// Todos os comunicados já enviados — só o super admin vê essa lista
// completa (tela de Admin → Comunicados).
export async function listAllAnnouncements() {
  const { data, error } = await supabase
    .from("announcements")
    .select("*, accounts(name), profiles(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapAnnouncement);
}

// Comunicados relevantes pro usuário logado: os globais (scope 'all'), os
// da própria conta (scope 'account') e os endereçados só a ele (scope
// 'user') — é o que aparece no Início de cada um.
export async function listAnnouncementsFor({ accountId, userId }) {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .or(`scope.eq.all,and(scope.eq.account,account_id.eq.${accountId}),and(scope.eq.user,user_id.eq.${userId})`)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data.map(mapAnnouncement);
}

export async function createAnnouncement({ title, message, link, scope, accountId, userId, createdBy }) {
  const { data, error } = await supabase
    .from("announcements")
    .insert({
      title,
      message,
      link: link || null,
      scope,
      account_id: scope === "account" ? accountId : null,
      user_id: scope === "user" ? userId : null,
      created_by: createdBy || null
    })
    .select("*, accounts(name), profiles(name)")
    .single();
  if (error) throw error;
  return mapAnnouncement(data);
}

export async function deleteAnnouncement(id) {
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw error;
}

// Todos os usuários de todas as contas — só pro super admin, na tela de
// Admin (visão "quem tem acesso à Helora inteira").
export async function listAllUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, is_super_admin, created_at, accounts(id, name, status)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    isSuperAdmin: p.is_super_admin,
    createdAt: p.created_at,
    accountId: p.accounts?.id,
    accountName: p.accounts?.name,
    accountStatus: p.accounts?.status
  }));
}

export async function createProfile({ userId, accountId, role, name, isSuperAdmin }) {
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: userId,
      account_id: accountId,
      role: role || "owner",
      name,
      is_super_admin: !!isSuperAdmin
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Setores (departamentos) ----------

export async function listDepartments(accountId) {
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("account_id", accountId)
    .order("name");
  if (error) throw error;
  return data;
}

export async function createDepartment({ accountId, name }) {
  const { data, error } = await supabase
    .from("departments")
    .insert({ account_id: accountId, name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDepartment(accountId, id) {
  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("account_id", accountId)
    .eq("id", id);
  if (error) throw error;
}

export async function getProfileDepartmentIds(profileId) {
  const { data, error } = await supabase
    .from("profile_departments")
    .select("department_id")
    .eq("profile_id", profileId);
  if (error) throw error;
  return data.map((r) => r.department_id);
}

// Substitui os setores de um atendente pela lista enviada.
export async function setProfileDepartments(profileId, departmentIds) {
  const { error: delError } = await supabase
    .from("profile_departments")
    .delete()
    .eq("profile_id", profileId);
  if (delError) throw delError;

  if (departmentIds.length > 0) {
    const rows = departmentIds.map((departmentId) => ({ profile_id: profileId, department_id: departmentId }));
    const { error: insError } = await supabase.from("profile_departments").insert(rows);
    if (insError) throw insError;
  }
}

// Perfil do próprio usuário logado — usado pra recarregar dados (como a
// foto) sem precisar de um novo login.
export async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, is_super_admin, avatar_url, account_id, accounts(name)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    role: data.role,
    isSuperAdmin: data.is_super_admin,
    avatarUrl: data.avatar_url,
    accountId: data.account_id,
    accountName: data.accounts?.name
  };
}

export async function updateProfileAvatar(userId, avatarUrl) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Lista os atendentes da conta + os setores de cada um (pra tela de Equipe
// e pra montar seletores de "atribuir a").
export async function listTeam(accountId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, is_super_admin, avatar_url, profile_departments(department_id, departments(id, name))")
    .eq("account_id", accountId)
    .order("name");
  if (error) throw error;
  return data.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    isSuperAdmin: p.is_super_admin,
    avatarUrl: p.avatar_url,
    departments: (p.profile_departments || []).map((pd) => pd.departments).filter(Boolean)
  }));
}

// ---------- Canais (WhatsApp / Messenger / Instagram) ----------

// Busca em TODAS as contas, por isso não recebe accountId — é assim que o
// webhook do Meta descobre de qual conta é uma mensagem recebida.
export async function findChannelByPage(platform, externalPageId) {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("platform", platform)
    .eq("external_page_id", externalPageId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { id: data.id, accountId: data.account_id, platform: data.platform, accessToken: data.access_token }
    : null;
}

// Busca o canal (Messenger/Instagram) de UMA conta específica — usado
// quando o próprio backend precisa enviar uma mensagem (resposta manual,
// CSAT), já sabendo de qual conta se trata.
export async function getChannelForAccount(accountId, platform) {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("account_id", accountId)
    .eq("platform", platform)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { id: data.id, accountId: data.account_id, platform: data.platform, accessToken: data.access_token }
    : null;
}

export async function upsertChannel({ accountId, platform, externalPageId, accessToken }) {
  const { data, error } = await supabase
    .from("channels")
    .upsert(
      { account_id: accountId, platform, external_page_id: externalPageId, access_token: accessToken },
      { onConflict: "platform,external_page_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

function mapChannel(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    platform: row.platform,
    name: row.name,
    departmentId: row.department_id,
    departmentName: row.departments?.name,
    createdAt: row.created_at
  };
}

export async function listChannels(accountId) {
  const { data, error } = await supabase
    .from("channels")
    .select("*, departments(name)")
    .eq("account_id", accountId)
    .order("created_at");
  if (error) throw error;
  return data.map(mapChannel);
}

export async function getChannel(accountId, id) {
  const { data, error } = await supabase
    .from("channels")
    .select("*, departments(name)")
    .eq("account_id", accountId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return mapChannel(data);
}

export async function createChannel({ accountId, platform, name, departmentId }) {
  const { data, error } = await supabase
    .from("channels")
    .insert({ account_id: accountId, platform, name, department_id: departmentId || null })
    .select("*, departments(name)")
    .single();
  if (error) throw error;
  return mapChannel(data);
}

export async function updateChannel(accountId, id, patch) {
  const dbPatch = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.departmentId !== undefined) dbPatch.department_id = patch.departmentId;
  const { data, error } = await supabase
    .from("channels")
    .update(dbPatch)
    .eq("account_id", accountId)
    .eq("id", id)
    .select("*, departments(name)")
    .maybeSingle();
  if (error) throw error;
  return mapChannel(data);
}

export async function deleteChannel(accountId, id) {
  const { error } = await supabase.from("channels").delete().eq("account_id", accountId).eq("id", id);
  if (error) throw error;
}

// Todos os dispositivos de WhatsApp de todas as contas ativas (pra ligar
// as conexões no boot do servidor).
export async function listWhatsAppChannels() {
  const { data, error } = await supabase
    .from("channels")
    .select("id, account_id, accounts!inner(status)")
    .eq("platform", "whatsapp")
    .eq("accounts.status", "active");
  if (error) throw error;
  return data.map((c) => ({ channelId: c.id, accountId: c.account_id }));
}

// Dispositivo de WhatsApp "principal" de uma conta — usado como fallback
// quando uma conversa antiga não tem channel_id definido, e pelo botão
// rápido de conectar no topo do painel (a maioria das contas tem só 1).
export async function getPrimaryWhatsAppChannel(accountId) {
  const { data, error } = await supabase
    .from("channels")
    .select("id")
    .eq("account_id", accountId)
    .eq("platform", "whatsapp")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

// ---------- Permissão por canal (quais atendentes veem qual dispositivo) ----------

export async function getChannelPermissions(channelId) {
  const { data, error } = await supabase
    .from("channel_permissions")
    .select("profile_id")
    .eq("channel_id", channelId);
  if (error) throw error;
  return data.map((r) => r.profile_id);
}

export async function setChannelPermissions(channelId, profileIds) {
  const { error: delError } = await supabase
    .from("channel_permissions")
    .delete()
    .eq("channel_id", channelId);
  if (delError) throw delError;

  if (profileIds.length > 0) {
    const rows = profileIds.map((profileId) => ({ channel_id: channelId, profile_id: profileId }));
    const { error: insError } = await supabase.from("channel_permissions").insert(rows);
    if (insError) throw insError;
  }
}

// Um canal sem NENHUMA permissão configurada fica aberto pra conta inteira
// (comportamento padrão, sem restringir nada até ser configurado).
export async function canProfileAccessChannel(channelId, profileId) {
  const permitted = await getChannelPermissions(channelId);
  if (permitted.length === 0) return true;
  return permitted.includes(profileId);
}

// ---------- Status/QR Code por dispositivo de WhatsApp ----------

export async function setChannelStatus(channelId, { status, qr }) {
  const { error } = await supabase
    .from("channel_status")
    .upsert({ channel_id: channelId, status, qr, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function getChannelStatus(channelId) {
  const { data, error } = await supabase
    .from("channel_status")
    .select("*")
    .eq("channel_id", channelId)
    .maybeSingle();
  if (error) throw error;
  return data ? { status: data.status, qr: data.qr } : { status: "disconnected", qr: null };
}

// ---------- Conversas ----------

export async function findOrCreateConversation({ accountId, platform, externalId, name, channelId }) {
  const { data: existing, error: findError } = await supabase
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .eq("account_id", accountId)
    .eq("platform", platform)
    .eq("external_id", externalId)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return mapConversation(existing);

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      account_id: accountId,
      platform,
      external_id: externalId,
      name: name || externalId,
      channel_id: channelId || null
    })
    .select(CONVERSATION_SELECT)
    .single();

  if (error) throw error;
  return mapConversation(data);
}

// scope: { role, departmentIds, userId } — quando role === 'agent', só
// retorna conversas do(s) setor(es) do atendente OU atribuídas a ele
// ("visão de túnel"). Gestor/owner e super admin veem tudo.
export async function listConversations(accountId, scope) {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .eq("account_id", accountId)
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  const all = data.map(mapConversation);
  if (!scope || scope.role !== "agent") return all;
  const access = await getAgentAccess(accountId, scope.userId, scope.departmentIds);
  return all.filter((c) => canAgentSee(c, access));
}

/** O que um atendente pode ver: setores, canais liberados e grupos liberados. */
export async function getAgentAccess(accountId, userId, departmentIds = []) {
  const [mine, channelRules, groups] = await Promise.all([
    supabase.from("profile_channels").select("channel_id").eq("profile_id", userId),
    supabase.from("channel_permissions").select("channel_id, profile_id"),
    supabase.from("group_permissions").select("conversation_id").eq("profile_id", userId)
  ]);
  const myChannels = new Set((mine.data || []).map((r) => r.channel_id));
  const restricted = new Map(); // canal com lista fechada (permissão por canal, tela Canais)
  for (const r of channelRules.data || []) {
    if (!restricted.has(r.channel_id)) restricted.set(r.channel_id, new Set());
    restricted.get(r.channel_id).add(r.profile_id);
  }
  return {
    userId,
    departmentIds,
    myChannels,
    restricted,
    groups: new Set((groups.data || []).map((r) => r.conversation_id))
  };
}

export function canAgentSee(c, a) {
  if (c.channelId) {
    if (a.myChannels.size && !a.myChannels.has(c.channelId)) return false;
    const r = a.restricted.get(c.channelId);
    if (r && !r.has(a.userId)) return false;
  }
  if (c.isGroup) return a.groups.has(c.id);
  return c.assignedAgentId === a.userId || (c.departmentId && a.departmentIds.includes(c.departmentId));
}

export async function getConversation(accountId, id) {
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .eq("account_id", accountId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return mapConversation(data);
}

export async function updateConversation(accountId, id, patch) {
  const dbPatch = toSnakeCasePatch(patch);

  // Preenche/limpa resolved_at automaticamente — é o que alimenta o TMA
  // (tempo médio de atendimento) no dashboard.
  if (patch.status === "resolved") {
    dbPatch.resolved_at = new Date().toISOString();
  } else if (patch.status === "open") {
    dbPatch.resolved_at = null;
  }

  const { data, error } = await supabase
    .from("conversations")
    .update(dbPatch)
    .eq("account_id", accountId)
    .eq("id", id)
    .select(CONVERSATION_SELECT)
    .maybeSingle();

  if (error) throw error;
  return mapConversation(data);
}

export async function markConversationSeen(accountId, id) {
  return updateConversation(accountId, id, { unread: 0, isNew: false });
}

// ---------- Mensagens ----------

export async function addMessage({
  accountId,
  conversationId,
  direction,
  author,
  text,
  mediaUrl,
  mediaType,
  whatsappMessageId,
  senderName
}) {
  const { data: msgRow, error } = await supabase
    .from("messages")
    .insert({
      account_id: accountId,
      conversation_id: conversationId,
      direction,
      author,
      text: text || "",
      media_url: mediaUrl || null,
      media_type: mediaType || null,
      whatsapp_message_id: whatsappMessageId || null,
      sender_name: senderName || null
    })
    .select()
    .single();

  if (error) throw error;

  const preview =
    (text || "").trim().slice(0, 120) ||
    { image: "📷 Foto", video: "🎥 Vídeo", audio: "🎤 Áudio", document: "📄 Documento" }[mediaType] ||
    "";
  const patch = { last_message_at: msgRow.timestamp, last_message_preview: preview };
  if (direction === "in") {
    const { data: conv } = await supabase
      .from("conversations")
      .select("unread")
      .eq("id", conversationId)
      .maybeSingle();
    patch.unread = (conv?.unread || 0) + 1;
  }
  const { error: convErr } = await supabase.from("conversations").update(patch).eq("id", conversationId);
  if (convErr && /last_message_preview/.test(convErr.message)) {
    // Banco ainda sem a migration 013: grava sem a prévia.
    delete patch.last_message_preview;
    await supabase.from("conversations").update(patch).eq("id", conversationId);
  }

  return mapMessage(msgRow);
}

export async function listMessages(accountId, conversationId) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("account_id", accountId)
    .eq("conversation_id", conversationId)
    .order("timestamp", { ascending: true });

  if (error) throw error;
  return data.map(mapMessage);
}

export async function getMessage(accountId, id) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("account_id", accountId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return mapMessage(data);
}

export async function getMessageByWhatsAppId(accountId, whatsappMessageId) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("account_id", accountId)
    .eq("whatsapp_message_id", whatsappMessageId)
    .maybeSingle();
  if (error) throw error;
  return mapMessage(data);
}

export async function addReaction(accountId, messageId, emoji, author) {
  const { data: existing, error: findError } = await supabase
    .from("messages")
    .select("reactions")
    .eq("account_id", accountId)
    .eq("id", messageId)
    .maybeSingle();
  if (findError) throw findError;
  if (!existing) return null;

  const reactions = (existing.reactions || []).filter((r) => r.author !== author);
  if (emoji) reactions.push({ emoji, author });

  const { data, error } = await supabase
    .from("messages")
    .update({ reactions })
    .eq("account_id", accountId)
    .eq("id", messageId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return mapMessage(data);
}

// ---------- Respostas automáticas (bot por palavra-chave) ----------

export async function listAutoReplies(accountId) {
  const { data, error } = await supabase
    .from("auto_replies")
    .select("*")
    .eq("account_id", accountId);
  if (error) throw error;
  return data;
}

export async function addAutoReply({ accountId, keyword, response }) {
  const { data, error } = await supabase
    .from("auto_replies")
    .insert({ account_id: accountId, keyword: keyword.toLowerCase(), response })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAutoReply(accountId, id) {
  const { error } = await supabase
    .from("auto_replies")
    .delete()
    .eq("account_id", accountId)
    .eq("id", id);
  if (error) throw error;
}

// ---------- Etiquetas (labels) ----------

export async function listLabels(accountId) {
  const { data, error } = await supabase
    .from("labels")
    .select("*")
    .eq("account_id", accountId)
    .order("title");
  if (error) throw error;
  return data;
}

export async function createLabel({ accountId, title, color }) {
  const { data, error } = await supabase
    .from("labels")
    .insert({ account_id: accountId, title: title.toLowerCase(), color: color || "#2b82ea" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLabel(accountId, id) {
  const { error } = await supabase.from("labels").delete().eq("account_id", accountId).eq("id", id);
  if (error) throw error;
}

// Substitui todas as etiquetas de uma conversa pela lista enviada.
export async function setConversationLabels(accountId, conversationId, labelIds) {
  const { error: delError } = await supabase
    .from("conversation_labels")
    .delete()
    .eq("account_id", accountId)
    .eq("conversation_id", conversationId);
  if (delError) throw delError;

  if (labelIds.length > 0) {
    const rows = labelIds.map((labelId) => ({
      account_id: accountId,
      conversation_id: conversationId,
      label_id: labelId
    }));
    const { error: insError } = await supabase.from("conversation_labels").insert(rows);
    if (insError) throw insError;
  }

  return getConversation(accountId, conversationId);
}

// ---------- Respostas prontas do atendente (canned responses) ----------

export async function listCannedResponses(accountId) {
  const { data, error } = await supabase
    .from("canned_responses")
    .select("*")
    .eq("account_id", accountId)
    .order("short_code");
  if (error) throw error;
  return data.map((r) => ({ id: r.id, shortCode: r.short_code, content: r.content }));
}

export async function createCannedResponse({ accountId, shortCode, content }) {
  const { data, error } = await supabase
    .from("canned_responses")
    .insert({ account_id: accountId, short_code: shortCode.toLowerCase(), content })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, shortCode: data.short_code, content: data.content };
}

export async function deleteCannedResponse(accountId, id) {
  const { error } = await supabase
    .from("canned_responses")
    .delete()
    .eq("account_id", accountId)
    .eq("id", id);
  if (error) throw error;
}

// ---------- Notas internas ----------

export async function listNotes(accountId, conversationId) {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("account_id", accountId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((n) => ({
    id: n.id,
    conversationId: n.conversation_id,
    content: n.content,
    createdAt: n.created_at
  }));
}

export async function addNote({ accountId, conversationId, content }) {
  const { data, error } = await supabase
    .from("notes")
    .insert({ account_id: accountId, conversation_id: conversationId, content })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, conversationId: data.conversation_id, content: data.content, createdAt: data.created_at };
}

// ---------- Pesquisa de satisfação (CSAT) ----------

export async function addCsatResponse({ accountId, conversationId, rating }) {
  const { data, error } = await supabase
    .from("csat_responses")
    .insert({ account_id: accountId, conversation_id: conversationId, rating })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Negócios (funil de vendas / kanban) ----------

function mapDeal(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    conversationId: row.conversation_id,
    title: row.title,
    value: row.value,
    stage: row.stage,
    ownerId: row.owner_id,
    ownerName: row.owner?.name,
    stageChangedAt: row.stage_changed_at,
    lostReason: row.lost_reason,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    conversationName: row.conversations?.name,
    conversationPlatform: row.conversations?.platform,
    contactName: row.contact_name || row.conversations?.name || null,
    contactPhone: row.contact_phone || null,
    contactEmail: row.contact_email || null,
    source: row.source || null,
    notes: row.notes || null
  };
}

const DEAL_SELECT = "*, conversations(name, platform), owner:profiles!deals_owner_id_fkey(name)";

export async function listDeals(accountId) {
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapDeal);
}

export async function createDeal({ accountId, conversationId, title, value, stage, ownerId, contactName, contactPhone, contactEmail, source, notes }) {
  const row = {
    account_id: accountId,
    conversation_id: conversationId || null,
    owner_id: ownerId || null,
    title,
    value: value || null,
    stage: stage || "novo_lead"
  };
  // Campos da migration 015 (lead vindo de site/API); só envia se preenchidos.
  if (contactName) row.contact_name = contactName;
  if (contactPhone) row.contact_phone = String(contactPhone).replace(/\D/g, "");
  if (contactEmail) row.contact_email = contactEmail;
  if (source) row.source = source;
  if (notes) row.notes = notes;
  const { data, error } = await supabase
    .from("deals")
    .insert(row)
    .select(DEAL_SELECT)
    .single();
  if (error) throw error;

  await addDealActivity({
    accountId,
    dealId: data.id,
    type: "system",
    description: "Negócio criado"
  });

  return mapDeal(data);
}

const DEAL_PATCH_MAP = {
  ownerId: "owner_id",
  lostReason: "lost_reason",
  conversationId: "conversation_id",
  contactName: "contact_name",
  contactPhone: "contact_phone",
  contactEmail: "contact_email"
};

export async function updateDeal(accountId, id, patch) {
  const dbPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    dbPatch[DEAL_PATCH_MAP[key] || key] = value;
  }

  let stageChangeNote = null;
  if (patch.stage) {
    const { data: current } = await supabase
      .from("deals")
      .select("stage")
      .eq("account_id", accountId)
      .eq("id", id)
      .maybeSingle();

    if (current && current.stage !== patch.stage) {
      dbPatch.stage_changed_at = new Date().toISOString();
      stageChangeNote = `Etapa alterada de "${STAGE_LABELS[current.stage] || current.stage}" para "${STAGE_LABELS[patch.stage] || patch.stage}"`;
    }

    if (["fechado", "perdido"].includes(patch.stage)) {
      dbPatch.closed_at = new Date().toISOString();
    } else {
      dbPatch.closed_at = null;
      dbPatch.lost_reason = null;
    }
  }

  const { data, error } = await supabase
    .from("deals")
    .update(dbPatch)
    .eq("account_id", accountId)
    .eq("id", id)
    .select(DEAL_SELECT)
    .maybeSingle();
  if (error) throw error;

  if (stageChangeNote) {
    await addDealActivity({ accountId, dealId: id, type: "stage_change", description: stageChangeNote });
  }

  return mapDeal(data);
}

export async function deleteDeal(accountId, id) {
  const { error } = await supabase.from("deals").delete().eq("account_id", accountId).eq("id", id);
  if (error) throw error;
}

const STAGE_LABELS = {
  novo_lead: "Novo Lead",
  contato: "Primeiro Contato",
  negociacao: "Em Negociação",
  proposta: "Proposta Enviada",
  fechado: "Ganho",
  perdido: "Perdido"
};

// ---------- Histórico do negócio (painel lateral do Kanban) ----------

function mapDealActivity(row) {
  return {
    id: row.id,
    dealId: row.deal_id,
    type: row.type,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export async function listDealActivities(accountId, dealId) {
  const { data, error } = await supabase
    .from("deal_activities")
    .select("*")
    .eq("account_id", accountId)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapDealActivity);
}

export async function addDealActivity({ accountId, dealId, type, description, createdBy }) {
  const { data, error } = await supabase
    .from("deal_activities")
    .insert({
      account_id: accountId,
      deal_id: dealId,
      type: type || "note",
      description,
      created_by: createdBy || null
    })
    .select()
    .single();
  if (error) throw error;
  return mapDealActivity(data);
}

// ---------- Estatísticas (painel / funil) ----------

// ---------- Estatísticas (painel / funil) ----------

// Todo o cálculo pesado roda dentro do Postgres (função overview_stats,
// ver supabase/migration_010) — o Node só repassa os filtros e devolve o
// jsonb pronto. Todos os filtros são opcionais.
export async function getOverviewStats(accountId, filters = {}) {
  const { dateFrom, dateTo, departmentId, agentId, channelId } = filters;
  const { data, error } = await supabase.rpc("overview_stats", {
    p_account_id: accountId,
    p_date_from: dateFrom || null,
    p_date_to: dateTo || null,
    p_department_id: departmentId || null,
    p_agent_id: agentId || null,
    p_channel_id: channelId || null
  });
  if (error) throw error;
  return data;
}


// ============================================================
// Gestão de usuários (criar / editar / remover) e contas
// ============================================================

/** Cria o login no Supabase Auth (com senha) ou manda convite por e-mail. */
export async function createAuthUser({ email, password }) {
  if (password) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error) throw error;
    return data.user;
  }
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
  if (error) throw error;
  return data.user;
}

export async function getProfileInAccount(accountId, profileId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, account_id, role, is_super_admin, name")
    .eq("id", profileId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateProfileInAccount(accountId, profileId, { name, role }) {
  const patch = {};
  if (typeof name === "string") patch.name = name.trim();
  if (role === "owner" || role === "agent") patch.role = role;
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", profileId)
    .eq("account_id", accountId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function countOwners(accountId) {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("role", "owner");
  if (error) throw error;
  return count || 0;
}

export async function getAuthEmails(userIds) {
  const emails = {};
  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await supabase.auth.admin.getUserById(id);
      if (data?.user) emails[id] = data.user.email;
    })
  );
  return emails;
}

export async function setUserPassword(userId, password) {
  // Confirma o e-mail junto: quem foi convidado e nunca clicou no link
  // passa a conseguir entrar com a senha definida pelo gestor.
  const { error } = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
  if (error) throw error;
}

export async function deleteAuthUser(userId) {
  // Apagar o usuário do Auth apaga o perfil junto (on delete cascade).
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

export async function setAccountStatus(accountId, status) {
  const { data, error } = await supabase
    .from("accounts")
    .update({ status })
    .eq("id", accountId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function renameAccount(accountId, name) {
  const { data, error } = await supabase
    .from("accounts")
    .update({ name: name.trim() })
    .eq("id", accountId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listAccountsWithStats() {
  const { data, error } = await supabase
    .from("accounts")
    .select("*, profiles(count), channels(count)")
    .order("created_at");
  if (error) throw error;
  return data.map((a) => ({
    ...a,
    usersCount: a.profiles?.[0]?.count ?? 0,
    channelsCount: a.channels?.[0]?.count ?? 0
  }));
}

// ============================================================
// Gestão Helora: dados comerciais + cobranças (só super admin)
// ============================================================

const ACCOUNT_COMMERCIAL_FIELDS = {
  planName: "plan_name",
  monthlyPrice: "monthly_price",
  dueDay: "due_day",
  document: "document",
  contactName: "contact_name",
  contactPhone: "contact_phone",
  contactEmail: "contact_email",
  notes: "notes",
  soldAt: "sold_at"
};

export async function updateAccountCommercial(accountId, body) {
  const patch = {};
  for (const [key, col] of Object.entries(ACCOUNT_COMMERCIAL_FIELDS)) {
    if (body[key] === undefined) continue;
    let v = body[key];
    if (key === "monthlyPrice") v = Number(String(v).replace(",", ".")) || 0;
    if (key === "dueDay") v = Math.min(28, Math.max(1, parseInt(v, 10) || 10));
    if (typeof v === "string") v = v.trim() || null;
    patch[col] = v;
  }
  if (!Object.keys(patch).length) return getAccount(accountId);
  const { data, error } = await supabase.from("accounts").update(patch).eq("id", accountId).select().single();
  if (error) throw error;
  return data;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export async function listInvoices({ status, reference } = {}) {
  let q = supabase
    .from("invoices")
    .select("*, accounts(id, name, status)")
    .order("due_date", { ascending: false })
    .limit(500);
  if (reference) q = q.eq("reference", reference);
  if (status === "overdue") q = q.eq("status", "pending").lt("due_date", todayISO());
  else if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return data.map((i) => ({
    ...i,
    accountName: i.accounts?.name,
    overdue: i.status === "pending" && i.due_date < todayISO()
  }));
}

/** Gera as cobranças do mês para todas as empresas ativas com valor > 0 (não duplica). */
export async function generateMonthlyInvoices(reference) {
  const [y, m] = reference.split("-").map(Number);
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, monthly_price, due_day, status")
    .eq("status", "active")
    .gt("monthly_price", 0);
  if (error) throw error;
  const rows = accounts.map((a) => ({
    account_id: a.id,
    reference,
    amount: a.monthly_price,
    due_date: `${y}-${String(m).padStart(2, "0")}-${String(a.due_day || 10).padStart(2, "0")}`
  }));
  if (!rows.length) return { created: 0 };
  const { data, error: insErr } = await supabase
    .from("invoices")
    .upsert(rows, { onConflict: "account_id,reference", ignoreDuplicates: true })
    .select("id");
  if (insErr) throw insErr;
  return { created: data?.length || 0, eligible: rows.length };
}

export async function createInvoice({ accountId, reference, amount, dueDate, notes }) {
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      account_id: accountId,
      reference,
      amount: Number(String(amount).replace(",", ".")),
      due_date: dueDate,
      notes: notes || null
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInvoice(id, { status, paymentMethod, notes, amount, dueDate }) {
  const patch = {};
  if (status) {
    patch.status = status;
    patch.paid_at = status === "paid" ? new Date().toISOString() : null;
  }
  if (paymentMethod !== undefined) patch.payment_method = paymentMethod || null;
  if (notes !== undefined) patch.notes = notes || null;
  if (amount !== undefined) patch.amount = Number(String(amount).replace(",", "."));
  if (dueDate) patch.due_date = dueDate;
  const { data, error } = await supabase.from("invoices").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function getManagementDashboard() {
  const today = todayISO();
  const monthStart = today.slice(0, 7) + "-01";
  const [{ data: accounts, error: e1 }, { data: invoices, error: e2 }] = await Promise.all([
    supabase.from("accounts").select("id, status, monthly_price, created_at"),
    supabase.from("invoices").select("amount, status, due_date, paid_at")
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const sum = (arr) => Math.round(arr.reduce((s, x) => s + Number(x.amount ?? x.monthly_price ?? 0), 0) * 100) / 100;
  const active = accounts.filter((a) => a.status === "active");
  const pending = invoices.filter((i) => i.status === "pending");
  const overdue = pending.filter((i) => i.due_date < today);
  const paidThisMonth = invoices.filter((i) => i.status === "paid" && i.paid_at && i.paid_at.slice(0, 10) >= monthStart);
  return {
    accounts: {
      total: accounts.length,
      active: active.length,
      trial: accounts.filter((a) => a.status === "trial").length,
      suspended: accounts.filter((a) => a.status === "suspended").length,
      newThisMonth: accounts.filter((a) => a.created_at.slice(0, 10) >= monthStart).length
    },
    mrr: sum(active.map((a) => ({ amount: a.monthly_price }))),
    receivable: { count: pending.length, amount: sum(pending) },
    overdue: { count: overdue.length, amount: sum(overdue) },
    receivedThisMonth: { count: paidThisMonth.length, amount: sum(paidThisMonth) }
  };
}


// ============================================================
// Contatos
// ============================================================

export const onlyDigits = (v) => String(v || "").replace(/\D/g, "");

function mapContact(r) {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    pushName: r.push_name,
    email: r.email,
    notes: r.notes,
    source: r.source,
    channelId: r.channel_id,
    createdAt: r.created_at
  };
}

export async function listContacts(accountId, search = "") {
  let q = supabase.from("contacts").select("*").eq("account_id", accountId).order("name", { nullsFirst: false }).limit(2000);
  const term = String(search || "").trim();
  if (term) {
    const digits = onlyDigits(term);
    const safe = term.replace(/[%,()]/g, " ");
    q = digits.length >= 3
      ? q.or(`name.ilike.%${safe}%,push_name.ilike.%${safe}%,phone.ilike.%${digits}%`)
      : q.or(`name.ilike.%${safe}%,push_name.ilike.%${safe}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data.map(mapContact);
}

export async function createContact(accountId, { phone, name, email, notes }) {
  const { data, error } = await supabase
    .from("contacts")
    .insert({ account_id: accountId, phone: onlyDigits(phone), name: name?.trim() || null, email: email || null, notes: notes || null, source: "manual" })
    .select()
    .single();
  if (error) throw error;
  return mapContact(data);
}

export async function updateContact(accountId, id, { phone, name, email, notes }) {
  const patch = { updated_at: new Date().toISOString() };
  if (phone !== undefined) patch.phone = onlyDigits(phone);
  if (name !== undefined) patch.name = name?.trim() || null;
  if (email !== undefined) patch.email = email || null;
  if (notes !== undefined) patch.notes = notes || null;
  const { data, error } = await supabase.from("contacts").update(patch).eq("account_id", accountId).eq("id", id).select().single();
  if (error) throw error;
  return mapContact(data);
}

export async function deleteContact(accountId, id) {
  const { error } = await supabase.from("contacts").delete().eq("account_id", accountId).eq("id", id);
  if (error) throw error;
}

/**
 * Grava/atualiza vários contatos de uma vez sem sobrescrever o nome que a
 * empresa editou no painel. list: [{ phone, name, pushName }]
 */
export async function upsertContacts(accountId, channelId, list, source = "whatsapp") {
  const clean = new Map();
  for (const c of list || []) {
    const phone = onlyDigits(c.phone);
    if (phone.length < 10 || phone.length > 15) continue;
    const prev = clean.get(phone) || {};
    clean.set(phone, { phone, name: c.name || prev.name || null, pushName: c.pushName || prev.pushName || null });
  }
  if (!clean.size) return { created: 0, updated: 0 };

  // Brasil: 55 + DDD + 9 + 8 dígitos e 55 + DDD + 8 dígitos são o mesmo número.
  const brTwin = (p) =>
    /^55\d{2}9\d{8}$/.test(p) ? p.slice(0, 4) + p.slice(5) : /^55\d{2}\d{8}$/.test(p) ? p.slice(0, 4) + "9" + p.slice(4) : null;
  const phones = [...new Set([...clean.keys()].flatMap((p) => [p, brTwin(p)].filter(Boolean)))];
  const existing = new Map();
  for (let i = 0; i < phones.length; i += 500) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, phone, name, push_name")
      .eq("account_id", accountId)
      .in("phone", phones.slice(i, i + 500));
    if (error) throw error;
    data.forEach((r) => {
      existing.set(r.phone, r);
      const twin = brTwin(r.phone);
      if (twin && !existing.has(twin)) existing.set(twin, r);
    });
  }

  const inserts = [];
  let updated = 0;
  for (const c of clean.values()) {
    const ex = existing.get(c.phone);
    if (!ex) {
      inserts.push({ account_id: accountId, channel_id: channelId || null, phone: c.phone, name: c.name, push_name: c.pushName, source });
    } else if ((!ex.name && c.name) || (c.pushName && c.pushName !== ex.push_name)) {
      const patch = { updated_at: new Date().toISOString() };
      if (!ex.name && c.name) patch.name = c.name;
      if (c.pushName) patch.push_name = c.pushName;
      await supabase.from("contacts").update(patch).eq("id", ex.id);
      updated++;
    }
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await supabase
      .from("contacts")
      .upsert(inserts.slice(i, i + 500), { onConflict: "account_id,phone", ignoreDuplicates: true });
    if (error) throw error;
  }
  return { created: inserts.length, updated };
}

export async function setConversationAvatar(conversationId, avatarUrl) {
  await supabase.from("conversations").update({ avatar_url: avatarUrl }).eq("id", conversationId);
}

// ============================================================
// Suporte (empresa ↔ Helora)
// ============================================================

function mapSupportMessage(m) {
  return { id: m.id, text: m.text, fromAdmin: m.from_admin, authorName: m.author_name, createdAt: m.created_at };
}

export async function getOpenSupportThread(accountId) {
  const { data, error } = await supabase
    .from("support_threads")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "open")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listSupportMessages(threadId) {
  const { data, error } = await supabase
    .from("support_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at");
  if (error) throw error;
  return data.map(mapSupportMessage);
}

export async function addSupportMessage({ accountId, threadId, userId, authorName, fromAdmin, text }) {
  let thread = threadId ? { id: threadId } : await getOpenSupportThread(accountId);
  if (!thread) {
    const { data, error } = await supabase
      .from("support_threads")
      .insert({ account_id: accountId, user_id: userId, subject: text.slice(0, 80) })
      .select()
      .single();
    if (error) throw error;
    thread = data;
  }
  const { data: msg, error } = await supabase
    .from("support_messages")
    .insert({ thread_id: thread.id, account_id: accountId, author_id: userId, author_name: authorName, from_admin: !!fromAdmin, text })
    .select()
    .single();
  if (error) throw error;

  const { data: t } = await supabase.from("support_threads").select("unread_admin, unread_user").eq("id", thread.id).single();
  await supabase
    .from("support_threads")
    .update({
      last_message_at: msg.created_at,
      status: "open",
      unread_admin: fromAdmin ? 0 : (t?.unread_admin || 0) + 1,
      unread_user: fromAdmin ? (t?.unread_user || 0) + 1 : 0
    })
    .eq("id", thread.id);
  return { threadId: thread.id, message: mapSupportMessage(msg) };
}

export async function markSupportRead(threadId, side) {
  await supabase.from("support_threads").update({ [side === "admin" ? "unread_admin" : "unread_user"]: 0 }).eq("id", threadId);
}

export async function listSupportThreads() {
  const { data, error } = await supabase
    .from("support_threads")
    .select("*, accounts(name), profiles:user_id(name)")
    .order("last_message_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data.map((t) => ({
    id: t.id,
    accountId: t.account_id,
    accountName: t.accounts?.name,
    userName: t.profiles?.name,
    subject: t.subject,
    status: t.status,
    unread: t.unread_admin,
    lastMessageAt: t.last_message_at
  }));
}

export async function setSupportThreadStatus(threadId, status) {
  const { error } = await supabase.from("support_threads").update({ status }).eq("id", threadId);
  if (error) throw error;
}


// ============================================================
// Fluxos (construtor em canvas)
// ============================================================

function mapFlow(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    active: r.active,
    graph: r.graph || { nodes: [], edges: [] },
    version: r.version,
    updatedAt: r.updated_at,
    createdAt: r.created_at
  };
}

export async function listFlows(accountId) {
  const { data, error } = await supabase.from("flows").select("*").eq("account_id", accountId).order("created_at");
  if (error) throw error;
  return data.map(mapFlow);
}

export async function getFlow(accountId, id) {
  const { data, error } = await supabase.from("flows").select("*").eq("account_id", accountId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapFlow(data) : null;
}

export async function getActiveFlow(accountId) {
  const { data, error } = await supabase
    .from("flows")
    .select("*")
    .eq("account_id", accountId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (/relation .*flows/i.test(error.message)) return null; // migration 014 ainda não rodou
    throw error;
  }
  return data ? mapFlow(data) : null;
}

export async function createFlow(accountId, { name, description, graph }) {
  const { data, error } = await supabase
    .from("flows")
    .insert({ account_id: accountId, name, description: description || null, graph: graph || { nodes: [], edges: [] } })
    .select()
    .single();
  if (error) throw error;
  return mapFlow(data);
}

export async function updateFlow(accountId, id, { name, description, graph }) {
  const current = await getFlow(accountId, id);
  if (!current) return null;
  const patch = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (graph !== undefined) {
    patch.graph = graph;
    patch.version = (current.version || 1) + 1;
  }
  const { data, error } = await supabase.from("flows").update(patch).eq("account_id", accountId).eq("id", id).select().single();
  if (error) throw error;
  return mapFlow(data);
}

/** Ativa um fluxo e desativa os outros da empresa (só um responde por vez). */
export async function setFlowActive(accountId, id, active) {
  if (active) {
    await supabase.from("flows").update({ active: false }).eq("account_id", accountId).neq("id", id);
  }
  const { data, error } = await supabase.from("flows").update({ active }).eq("account_id", accountId).eq("id", id).select().single();
  if (error) throw error;
  return mapFlow(data);
}

export async function deleteFlow(accountId, id) {
  const { error } = await supabase.from("flows").delete().eq("account_id", accountId).eq("id", id);
  if (error) throw error;
}

export async function recordFlowEvent(accountId, flowId, nodeId, kind, port = null) {
  const { error } = await supabase.from("flow_events").insert({ account_id: accountId, flow_id: flowId, node_id: nodeId, kind, port });
  if (error) console.error("[Fluxo] Falha ao registrar evento:", error.message);
}

/** Números por bloco: { nodeId: { sent, reply, invalid, ports: { porta: n } } } */
export async function getFlowStats(accountId, flowId, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const out = {};
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("flow_events")
      .select("node_id, kind, port")
      .eq("account_id", accountId)
      .eq("flow_id", flowId)
      .gte("created_at", since)
      .range(from, from + 999);
    if (error) throw error;
    for (const e of data) {
      const n = (out[e.node_id] = out[e.node_id] || { sent: 0, reply: 0, invalid: 0, ports: {} });
      n[e.kind] = (n[e.kind] || 0) + 1;
      if (e.port) n.ports[e.port] = (n.ports[e.port] || 0) + 1;
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

export async function addLabelToConversation(accountId, conversationId, labelId) {
  const { error } = await supabase
    .from("conversation_labels")
    .upsert({ account_id: accountId, conversation_id: conversationId, label_id: labelId }, { onConflict: "conversation_id,label_id", ignoreDuplicates: true });
  if (error) console.error("[Fluxo] Falha ao etiquetar:", error.message);
}

// ============================================================
// Migration 015 — permissões, grupos, painel do cliente
// ============================================================

/** Permissões de um usuário: canais, setores e grupos que ele vê. */
export async function getProfilePermissions(accountId, profileId) {
  const [ch, dp, gp] = await Promise.all([
    supabase.from("profile_channels").select("channel_id").eq("profile_id", profileId),
    supabase.from("profile_departments").select("department_id").eq("profile_id", profileId),
    supabase.from("group_permissions").select("conversation_id").eq("profile_id", profileId)
  ]);
  return {
    channelIds: (ch.data || []).map((r) => r.channel_id),
    departmentIds: (dp.data || []).map((r) => r.department_id),
    groupIds: (gp.data || []).map((r) => r.conversation_id)
  };
}

export async function setProfilePermissions(accountId, profileId, { channelIds, departmentIds, groupIds }) {
  if (Array.isArray(channelIds)) {
    await supabase.from("profile_channels").delete().eq("profile_id", profileId);
    if (channelIds.length) {
      const { error } = await supabase
        .from("profile_channels")
        .insert(channelIds.map((channel_id) => ({ profile_id: profileId, channel_id, account_id: accountId })));
      if (error) throw error;
    }
  }
  if (Array.isArray(departmentIds)) await setProfileDepartments(profileId, departmentIds);
  if (Array.isArray(groupIds)) {
    await supabase.from("group_permissions").delete().eq("profile_id", profileId);
    if (groupIds.length) {
      const { error } = await supabase
        .from("group_permissions")
        .insert(groupIds.map((conversation_id) => ({ conversation_id, profile_id: profileId, account_id: accountId })));
      if (error) throw error;
    }
  }
}

export async function listGroups(accountId) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, name, external_id, last_message_at")
    .eq("account_id", accountId)
    .eq("is_group", true)
    .order("name");
  if (error) return [];
  return data.map((g) => ({ id: g.id, name: g.name, externalId: g.external_id }));
}

export async function markConversationAsGroup(conversationId, name) {
  const patch = { is_group: true, mode: "human" };
  if (name) patch.name = name;
  await supabase.from("conversations").update(patch).eq("id", conversationId);
}

export async function markConversationUnread(accountId, id) {
  const { data } = await supabase.from("conversations").select("unread").eq("id", id).eq("account_id", accountId).maybeSingle();
  await supabase.from("conversations").update({ unread: Math.max(1, data?.unread || 0) }).eq("id", id).eq("account_id", accountId);
}

const BR_TWIN = (p) =>
  /^55\d{2}9\d{8}$/.test(p) ? p.slice(0, 4) + p.slice(5) : /^55\d{2}\d{8}$/.test(p) ? p.slice(0, 4) + "9" + p.slice(4) : null;

function mapContactFull(r) {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    pushName: r.push_name,
    email: r.email,
    notes: r.notes,
    source: r.source,
    leadOrigin: r.lead_origin || null,
    leadStatus: r.lead_status || null,
    defaultAgentId: r.default_agent_id || null,
    defaultDepartmentId: r.default_department_id || null,
    createdAt: r.created_at
  };
}

/** Contato ligado a uma conversa (pelo número). Cria se não existir. */
export async function getOrCreateContactForConversation(accountId, conversation) {
  const phone = String(conversation.externalId || "").split("@")[0];
  if (!/^\d{10,15}$/.test(phone) || conversation.isGroup) return null;
  const phones = [phone, BR_TWIN(phone)].filter(Boolean);
  const { data } = await supabase.from("contacts").select("*").eq("account_id", accountId).in("phone", phones).limit(1);
  if (data?.length) return mapContactFull(data[0]);
  const { data: created, error } = await supabase
    .from("contacts")
    .insert({ account_id: accountId, phone, push_name: conversation.name, source: "conversa", channel_id: conversation.channelId || null })
    .select()
    .single();
  if (error) throw error;
  return mapContactFull(created);
}

export async function updateContactLead(accountId, id, body) {
  const map = {
    name: "name", email: "email", notes: "notes",
    leadOrigin: "lead_origin", leadStatus: "lead_status",
    defaultAgentId: "default_agent_id", defaultDepartmentId: "default_department_id"
  };
  const patch = { updated_at: new Date().toISOString() };
  for (const [k, col] of Object.entries(map)) if (body[k] !== undefined) patch[col] = body[k] === "" ? null : body[k];
  const { data, error } = await supabase.from("contacts").update(patch).eq("account_id", accountId).eq("id", id).select().single();
  if (error) throw error;
  return mapContactFull(data);
}

export async function listDealsForConversation(accountId, conversationId, phone) {
  const ors = [`conversation_id.eq.${conversationId}`];
  if (phone) ors.push(`contact_phone.eq.${phone}`);
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_SELECT)
    .eq("account_id", accountId)
    .or(ors.join(","))
    .order("created_at", { ascending: false });
  if (error) {
    // sem a migration 015 (coluna contact_phone): busca só pela conversa
    const r = await supabase.from("deals").select(DEAL_SELECT).eq("account_id", accountId).eq("conversation_id", conversationId);
    return (r.data || []).map(mapDeal);
  }
  return data.map(mapDeal);
}

// ============================================================
// Créditos (1 crédito = 1 mensagem de campanha / API)
// ============================================================

const monthRef = (d = new Date()) => d.toISOString().slice(0, 7);

/** Libera o crédito do mês (uma vez por mês) quando a empresa tem cota mensal. */
export async function ensureMonthlyGrant(accountId) {
  const { data: acc } = await supabase.from("accounts").select("credits_monthly, status").eq("id", accountId).maybeSingle();
  if (!acc?.credits_monthly || acc.status === "suspended") return;
  await supabase
    .from("credit_ledger")
    .upsert(
      { account_id: accountId, delta: acc.credits_monthly, kind: "monthly", reference: monthRef(), note: "Crédito mensal" },
      { onConflict: "account_id,reference", ignoreDuplicates: true }
    );
}

export async function getCreditBalance(accountId) {
  await ensureMonthlyGrant(accountId).catch(() => {});
  let total = 0;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from("credit_ledger").select("delta").eq("account_id", accountId).range(from, from + 999);
    if (error) return 0;
    total += data.reduce((s, r) => s + r.delta, 0);
    if (data.length < 1000) break;
    from += 1000;
  }
  return total;
}

export async function addCreditEntry(accountId, delta, kind, { reference = null, note = null } = {}) {
  const { error } = await supabase.from("credit_ledger").insert({ account_id: accountId, delta, kind, reference, note });
  if (error) throw error;
}

export async function listCreditLedger(accountId, limit = 100) {
  const { data, error } = await supabase
    .from("credit_ledger")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data.map((r) => ({ id: r.id, delta: r.delta, kind: r.kind, reference: r.reference, note: r.note, createdAt: r.created_at }));
}

/** Resumo de créditos de todas as empresas (Gestão). */
export async function listCreditsOverview() {
  const { data: accounts } = await supabase.from("accounts").select("id, name, status, credits_monthly").order("name");
  const out = [];
  for (const a of accounts || []) {
    const balance = await getCreditBalance(a.id);
    const { data: used } = await supabase
      .from("credit_ledger")
      .select("delta")
      .eq("account_id", a.id)
      .lt("delta", 0)
      .gte("created_at", monthRef() + "-01");
    out.push({
      id: a.id,
      name: a.name,
      status: a.status,
      creditsMonthly: a.credits_monthly || 0,
      balance,
      usedThisMonth: -(used || []).reduce((s, r) => s + r.delta, 0)
    });
  }
  return out;
}

export async function setMonthlyCredits(accountId, credits) {
  const { error } = await supabase.from("accounts").update({ credits_monthly: Math.max(0, parseInt(credits, 10) || 0) }).eq("id", accountId);
  if (error) throw error;
}

// ============================================================
// Campanhas
// ============================================================

function mapCampaign(r) {
  return {
    id: r.id, name: r.name, message: r.message, mediaUrl: r.media_url, mediaType: r.media_type,
    status: r.status, scheduledAt: r.scheduled_at, minDelay: r.min_delay, maxDelay: r.max_delay,
    hourlyLimit: r.hourly_limit, total: r.total, sent: r.sent, failed: r.failed, pauseReason: r.pause_reason,
    createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at
  };
}

export async function listCampaigns(accountId) {
  const { data, error } = await supabase.from("campaigns").select("*").eq("account_id", accountId).order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapCampaign);
}

export async function getCampaign(accountId, id) {
  const { data, error } = await supabase.from("campaigns").select("*").eq("account_id", accountId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapCampaign(data) : null;
}

export async function createCampaign(accountId, userId, body, recipients) {
  const clean = new Map();
  for (const r of recipients || []) {
    const phone = String(r.phone || "").replace(/\D/g, "");
    if (phone.length >= 10 && phone.length <= 15 && !clean.has(phone)) clean.set(phone, { phone, name: r.name || null });
  }
  if (!clean.size) throw new Error("Nenhum número válido na lista.");
  const minDelay = Math.max(5, parseInt(body.minDelay, 10) || 15);
  const maxDelay = Math.max(minDelay, parseInt(body.maxDelay, 10) || 45);
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      account_id: accountId,
      name: body.name || "Campanha",
      message: body.message,
      media_url: body.mediaUrl || null,
      media_type: body.mediaType || null,
      status: body.scheduledAt ? "scheduled" : "draft",
      scheduled_at: body.scheduledAt || null,
      min_delay: minDelay,
      max_delay: maxDelay,
      hourly_limit: Math.min(300, Math.max(10, parseInt(body.hourlyLimit, 10) || 120)),
      total: clean.size,
      created_by: userId || null
    })
    .select()
    .single();
  if (error) throw error;
  const rows = [...clean.values()].map((r) => ({ campaign_id: data.id, account_id: accountId, phone: r.phone, name: r.name }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e2 } = await supabase.from("campaign_recipients").insert(rows.slice(i, i + 500));
    if (e2) throw e2;
  }
  return mapCampaign(data);
}

export async function updateCampaign(accountId, id, patch) {
  const { data, error } = await supabase.from("campaigns").update(patch).eq("account_id", accountId).eq("id", id).select().single();
  if (error) throw error;
  return mapCampaign(data);
}

export async function deleteCampaign(accountId, id) {
  const { error } = await supabase.from("campaigns").delete().eq("account_id", accountId).eq("id", id).in("status", ["draft", "done", "canceled", "paused", "scheduled"]);
  if (error) throw error;
}

export async function listCampaignRecipients(accountId, campaignId, limit = 500) {
  const { data, error } = await supabase
    .from("campaign_recipients")
    .select("*")
    .eq("account_id", accountId)
    .eq("campaign_id", campaignId)
    .order("id")
    .limit(limit);
  if (error) throw error;
  return data.map((r) => ({ id: r.id, phone: r.phone, name: r.name, status: r.status, error: r.error, sentAt: r.sent_at }));
}

/** Campanhas que precisam rodar agora (todas as empresas). */
export async function listRunnableCampaigns() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .or(`status.eq.running,and(status.eq.scheduled,scheduled_at.lte.${now})`);
  if (error) return [];
  return data.map((r) => ({ ...mapCampaign(r), accountId: r.account_id }));
}

export async function nextPendingRecipient(campaignId) {
  const { data } = await supabase
    .from("campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("id")
    .limit(1)
    .maybeSingle();
  return data;
}

export async function markRecipient(id, status, errorText = null) {
  await supabase
    .from("campaign_recipients")
    .update({ status, error: errorText, sent_at: status === "sent" ? new Date().toISOString() : null })
    .eq("id", id);
}

export async function countCampaign(campaignId) {
  const count = async (status) => {
    const { count: n } = await supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", status);
    return n || 0;
  };
  const [sent, failed, pending] = await Promise.all([count("sent"), count("failed"), count("pending")]);
  return { sent, failed, pending };
}

export async function sentInLastHour(campaignId) {
  const since = new Date(Date.now() - 3600000).toISOString();
  const { count } = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "sent")
    .gte("sent_at", since);
  return count || 0;
}

// ============================================================
// API aberta (chaves por empresa)
// ============================================================
import crypto from "crypto";

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");

export async function createApiKey(accountId, userId, name) {
  const key = "hl_" + crypto.randomBytes(24).toString("hex");
  const { data, error } = await supabase
    .from("api_keys")
    .insert({ account_id: accountId, name: name || "Chave", prefix: key.slice(0, 10), key_hash: sha256(key), created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, prefix: data.prefix, createdAt: data.created_at, key };
}

export async function listApiKeys(accountId) {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.created_at, lastUsedAt: k.last_used_at, revoked: !!k.revoked_at }));
}

export async function revokeApiKey(accountId, id) {
  const { error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("account_id", accountId).eq("id", id);
  if (error) throw error;
}

export async function findApiKey(rawKey) {
  if (!rawKey || !rawKey.startsWith("hl_")) return null;
  const { data } = await supabase.from("api_keys").select("id, account_id, revoked_at").eq("key_hash", sha256(rawKey)).maybeSingle();
  if (!data || data.revoked_at) return null;
  supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
  return { keyId: data.id, accountId: data.account_id };
}

/** E-mails de todos os usuários (comunicados por e-mail). */
export async function listUserEmails({ accountId = null, onlyOwners = false } = {}) {
  let q = supabase.from("profiles").select("id, name, role, account_id");
  if (accountId) q = q.eq("account_id", accountId);
  if (onlyOwners) q = q.eq("role", "owner");
  const { data } = await q;
  const out = [];
  for (const p of data || []) {
    const { data: u } = await supabase.auth.admin.getUserById(p.id);
    if (u?.user?.email) out.push({ name: p.name, email: u.user.email });
  }
  return out;
}
