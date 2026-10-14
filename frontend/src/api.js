import axios from "axios";
import { supabase } from "./supabaseClient.js";

export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export const api = axios.create({
  baseURL: `${API_BASE}/api`
});

// Toda chamada leva o token de sessão do Supabase Auth — é assim que o
// backend sabe quem está logado e de qual conta (multi-tenant).
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return config;
});

// ---- Conversas ----
export const getConversations = () => api.get("/conversations").then((r) => r.data);
export const getConversationMessages = (id) =>
  api.get(`/conversations/${id}/messages`).then((r) => r.data);
export const sendMessage = (id, text) =>
  api.post(`/conversations/${id}/send`, { text }).then((r) => r.data);
export const setConversationMode = (id, mode) =>
  api.post(`/conversations/${id}/mode`, { mode }).then((r) => r.data);
export const setConversationStatus = (id, status) =>
  api.post(`/conversations/${id}/status`, { status }).then((r) => r.data);
export const setConversationPriority = (id, priority) =>
  api.post(`/conversations/${id}/priority`, { priority }).then((r) => r.data);
export const setConversationLabels = (id, labelIds) =>
  api.post(`/conversations/${id}/labels`, { labelIds }).then((r) => r.data);
export const setConversationDepartment = (id, departmentId) =>
  api.post(`/conversations/${id}/department`, { departmentId }).then((r) => r.data);
export const assignConversation = (id, agentId) =>
  api.post(`/conversations/${id}/assign`, { agentId }).then((r) => r.data);
export const sendMediaMessage = (id, file, caption) => {
  const form = new FormData();
  form.append("file", file);
  if (caption) form.append("caption", caption);
  return api.post(`/conversations/${id}/send-media`, form).then((r) => r.data);
};
export const sendAudioMessage = (id, blob) => {
  const form = new FormData();
  form.append("file", blob, "audio.webm");
  return api.post(`/conversations/${id}/send-audio`, form).then((r) => r.data);
};

// ---- Reações ----
export const reactToMessage = (messageId, emoji) =>
  api.post(`/messages/${messageId}/react`, { emoji }).then((r) => r.data);

// ---- Setores (departamentos) ----
export const getDepartments = () => api.get("/departments").then((r) => r.data);
export const createDepartmentApi = (name) => api.post("/departments", { name }).then((r) => r.data);
export const removeDepartment = (id) => api.delete(`/departments/${id}`);

// ---- Equipe ----
export const getTeam = () => api.get("/team").then((r) => r.data);
export const setProfileDepartmentsApi = (profileId, departmentIds) =>
  api.post(`/team/${profileId}/departments`, { departmentIds }).then((r) => r.data);

// ---- Canais (dispositivos WhatsApp / Messenger / Instagram) ----
export const getChannels = () => api.get("/channels").then((r) => r.data);
export const createChannelApi = (platform, name, departmentId) =>
  api.post("/channels", { platform, name, departmentId }).then((r) => r.data);
export const updateChannelApi = (id, patch) => api.post(`/channels/${id}`, patch).then((r) => r.data);
export const removeChannel = (id) => api.delete(`/channels/${id}`);
export const getChannelStatusApi = (id) => api.get(`/channels/${id}/status`).then((r) => r.data);
export const connectWhatsAppApi = (id) => api.post(`/channels/${id}/whatsapp/connect`).then((r) => r.data);
export const resetWhatsAppApi = (id) => api.post(`/channels/${id}/whatsapp/reset`).then((r) => r.data);
export const requestPairingCodeApi = (id, phone) =>
  api.post(`/channels/${id}/whatsapp/pairing-code`, { phone }).then((r) => r.data);
export const logoutWhatsAppApi = (id) => api.post(`/channels/${id}/whatsapp/logout`).then((r) => r.data);
export const getChannelPermissionsApi = (id) => api.get(`/channels/${id}/permissions`).then((r) => r.data);
export const setChannelPermissionsApi = (id, profileIds) =>
  api.post(`/channels/${id}/permissions`, { profileIds }).then((r) => r.data);

// ---- Notas internas ----
export const getNotes = (conversationId) =>
  api.get(`/conversations/${conversationId}/notes`).then((r) => r.data);
export const createNote = (conversationId, content) =>
  api.post(`/conversations/${conversationId}/notes`, { content }).then((r) => r.data);

// ---- Etiquetas ----
export const getLabels = () => api.get("/labels").then((r) => r.data);
export const createLabelApi = (title, color) =>
  api.post("/labels", { title, color }).then((r) => r.data);
export const removeLabel = (id) => api.delete(`/labels/${id}`);

// ---- Respostas prontas do atendente ----
export const getCannedResponses = () => api.get("/canned-responses").then((r) => r.data);
export const createCannedResponseApi = (shortCode, content) =>
  api.post("/canned-responses", { shortCode, content }).then((r) => r.data);
export const removeCannedResponse = (id) => api.delete(`/canned-responses/${id}`);

// ---- Estatísticas ----
export const getOverviewStats = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.departmentId) params.set("departmentId", filters.departmentId);
  if (filters.agentId) params.set("agentId", filters.agentId);
  if (filters.channelId) params.set("channelId", filters.channelId);
  const qs = params.toString();
  return api.get(`/stats/overview${qs ? `?${qs}` : ""}`).then((r) => r.data);
};

// ---- WhatsApp ----
export const getWhatsAppStatus = () => api.get("/whatsapp/status").then((r) => r.data);

// ---- Respostas automáticas ----
export const getAutoReplies = () => api.get("/autoreplies").then((r) => r.data);
export const createAutoReply = (keyword, response) =>
  api.post("/autoreplies", { keyword, response }).then((r) => r.data);
export const removeAutoReply = (id) => api.delete(`/autoreplies/${id}`);

// ---- Fluxo do bot (construtor de árvore de decisão) ----
export const getBotFlow = () => api.get("/bot-flow").then((r) => r.data.flow);
export const saveBotFlow = (flow) => api.post("/bot-flow", { flow }).then((r) => r.data.flow);

// ---- Admin (só super admin) ----
export const getAdminAccounts = () => api.get("/admin/accounts").then((r) => r.data);
export const createAdminAccount = (name, ownerEmail, ownerName) =>
  api.post("/admin/accounts", { name, ownerEmail, ownerName }).then((r) => r.data);
export const getAdminUsers = () => api.get("/admin/users").then((r) => r.data);

// ---- Comunicados ----
export const getAnnouncements = () => api.get("/announcements").then((r) => r.data);
export const getAdminAnnouncements = () => api.get("/admin/announcements").then((r) => r.data);
export const createAdminAnnouncement = (data) => api.post("/admin/announcements", data).then((r) => r.data);
export const removeAdminAnnouncement = (id) => api.delete(`/admin/announcements/${id}`);

// ---- Mensagens agendadas ----
export const getScheduledMessages = () => api.get("/scheduled-messages").then((r) => r.data);
export const createScheduledMessageApi = (data) => api.post("/scheduled-messages", data).then((r) => r.data);
export const cancelScheduledMessageApi = (id) => api.delete(`/scheduled-messages/${id}`);

// ---- Conta (rodapé editável) ----
export const getAccount = () => api.get("/account").then((r) => r.data);
export const updateFooterNote = (footerNote) =>
  api.post("/account/footer-note", { footerNote }).then((r) => r.data);

// ---- Perfil do usuário logado (avatar) ----
export const getMyProfile = () => api.get("/profile").then((r) => r.data);
export const uploadAvatar = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/profile/avatar", form).then((r) => r.data);
};

// ---- Negócios (funil de vendas) ----
export const getDeals = () => api.get("/deals").then((r) => r.data);
export const createDealApi = (data) => api.post("/deals", data).then((r) => r.data);
export const updateDealApi = (id, patch) => api.post(`/deals/${id}`, patch).then((r) => r.data);
export const removeDeal = (id) => api.delete(`/deals/${id}`);
export const getDealActivities = (id) => api.get(`/deals/${id}/activities`).then((r) => r.data);
export const addDealActivityApi = (id, description) =>
  api.post(`/deals/${id}/activities`, { description }).then((r) => r.data);
