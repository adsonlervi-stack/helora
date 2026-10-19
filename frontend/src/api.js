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
  // Super admin "dentro" de uma empresa: o backend só aceita isso de super admin.
  const acting = getActingAccount();
  if (acting?.id) config.headers["X-Account-Id"] = acting.id;
  return config;
});

// Empresa bloqueada por falta de pagamento: o backend responde 402 e o app mostra o Financeiro.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 402 && err.response.data?.billingBlocked) {
      window.dispatchEvent(new CustomEvent("helora:billing-blocked"));
    }
    return Promise.reject(err);
  }
);

// ---- Super admin: entrar numa empresa ----
const ACTING_KEY = "helora_acting_account";
export function getActingAccount() {
  try {
    return JSON.parse(localStorage.getItem(ACTING_KEY) || "null");
  } catch {
    return null;
  }
}
export function enterAccount(account) {
  try {
    localStorage.setItem(ACTING_KEY, JSON.stringify({ id: account.id, name: account.name }));
  } catch {}
  window.location.reload();
}
export function leaveAccount() {
  try {
    localStorage.removeItem(ACTING_KEY);
  } catch {}
  window.location.reload();
}

// ---- Conversas ----
export const getConversations = () => api.get("/conversations").then((r) => r.data);
export const getConversationMessages = (id) =>
  api.get(`/conversations/${id}/messages`).then((r) => r.data);
export const sendMessage = (id, text, sign = true, quotedId = null) =>
  api.post(`/conversations/${id}/send`, { text, sign, quotedId }).then((r) => r.data);
export const sendSpecialApi = (id, payload) => api.post(`/conversations/${id}/send-special`, payload).then((r) => r.data);
export const getConversationChannelStatus = (id) => api.get(`/conversations/${id}/channel-status`).then((r) => r.data);
export const downloadMediaApi = (messageId) => api.post(`/messages/${messageId}/download`).then((r) => r.data);
export const deleteMessageApi = (messageId) => api.post(`/messages/${messageId}/delete`).then((r) => r.data);
export const forwardMessageApi = (messageId, conversationIds) =>
  api.post(`/messages/${messageId}/forward`, { conversationIds }).then((r) => r.data);
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
export const sendMediaMessage = (id, file, caption, quotedId) => {
  const form = new FormData();
  form.append("file", file);
  if (caption) form.append("caption", caption);
  if (quotedId) form.append("quotedId", quotedId);
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
export const getAllDepartments = () => api.get("/departments").then((r) => r.data);
export const getDepartments = () => getAllDepartments().then((l) => l.filter((d) => d.active !== false));
export const createDepartmentApi = (name) => api.post("/departments", { name }).then((r) => r.data);
export const updateDepartmentApi = (id, data) => api.patch(`/departments/${id}`, data).then((r) => r.data);
export const removeDepartment = (id) => api.delete(`/departments/${id}`);

// ---- Equipe ----
export const getTeam = () => api.get("/team").then((r) => r.data);
export const createTeamMemberApi = (data) => api.post("/team", data).then((r) => r.data);
export const updateTeamMemberApi = (id, patch) => api.patch(`/team/${id}`, patch).then((r) => r.data);
export const setTeamMemberPasswordApi = (id, password) => api.post(`/team/${id}/password`, { password });
export const removeTeamMemberApi = (id) => api.delete(`/team/${id}`);
export const setProfileDepartmentsApi = (profileId, departmentIds) =>
  api.post(`/team/${profileId}/departments`, { departmentIds }).then((r) => r.data);

// ---- Canais (dispositivos WhatsApp / Messenger / Instagram) ----
export const getChannels = () => api.get("/channels").then((r) => r.data);
export const createChannelApi = (platform, name, departmentId, flowId, extra = {}) =>
  api.post("/channels", { platform, name, departmentId, flowId, ...extra }).then((r) => r.data);
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
export const updateLabelApi = (id, data) => api.patch(`/labels/${id}`, data).then((r) => r.data);
export const getPipelineStagesApi = () => api.get("/pipeline/stages").then((r) => r.data.stages);
export const savePipelineStagesApi = (stages) => api.put("/pipeline/stages", { stages }).then((r) => r.data.stages);
export const removeLabel = (id) => api.delete(`/labels/${id}`);

// ---- Respostas prontas do atendente ----
export const getCannedResponses = () => api.get("/canned-responses").then((r) => r.data);
export const createCannedResponseApi = (shortCode, content, personal = false) =>
  api.post("/canned-responses", { shortCode, content, personal }).then((r) => r.data);
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
export const createAdminAccount = (data) => api.post("/admin/accounts", data).then((r) => r.data);
export const updateAdminAccountApi = (id, patch) => api.patch(`/admin/accounts/${id}`, patch).then((r) => r.data);
export const getAdminUsers = () => api.get("/admin/users").then((r) => r.data);

// ---- Comunicados ----
export const getAnnouncements = () => api.get("/announcements").then((r) => r.data);
export const getAdminAnnouncements = () => api.get("/admin/announcements").then((r) => r.data);
export const createAdminAnnouncement = (data) => api.post("/admin/announcements", data).then((r) => r.data);
export const removeAdminAnnouncement = (id) => api.delete(`/admin/announcements/${id}`);

// ---- Mensagens agendadas ----
export const getScheduledMessages = () => api.get("/scheduled-messages").then((r) => r.data);
export const createScheduledMessageApi = (data, file) => {
  if (!file) return api.post("/scheduled-messages", data).then((r) => r.data);
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => v !== undefined && v !== null && fd.append(k, String(v)));
  fd.append("file", file);
  return api.post("/scheduled-messages", fd).then((r) => r.data);
};
export const attachScheduledFileApi = (id, file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post(`/scheduled-messages/${id}/attachment`, fd).then((r) => r.data);
};
export const getTasksApi = (scope) => api.get("/tasks", { params: scope ? { scope } : {} }).then((r) => r.data);
export const createTaskApi = (data) => api.post("/tasks", data).then((r) => r.data);
export const updateTaskApi = (id, data) => api.patch(`/tasks/${id}`, data).then((r) => r.data);
export const deleteTaskApi = (id) => api.delete(`/tasks/${id}`);
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

// ---- Gestão Helora (super admin) ----
export const getManagementDashboard = () => api.get("/admin/dashboard").then((r) => r.data);
export const getInvoices = (params = {}) => api.get("/admin/invoices", { params }).then((r) => r.data);
export const generateInvoicesApi = (reference) => api.post("/admin/invoices/generate", { reference }).then((r) => r.data);
export const createInvoiceApi = (data) => api.post("/admin/invoices", data).then((r) => r.data);
export const updateInvoiceApi = (id, patch) => api.patch(`/admin/invoices/${id}`, patch).then((r) => r.data);

// ---- Contatos e nova conversa ----
export const getContacts = (search = "") => api.get("/contacts", { params: { search } }).then((r) => r.data);
export const getContactsPage = (search = "", page = 1) => api.get("/contacts", { params: { search, page } }).then((r) => r.data);
export const createContactApi = (data) => api.post("/contacts", data).then((r) => r.data);
export const updateContactApi = (id, data) => api.patch(`/contacts/${id}`, data).then((r) => r.data);
export const removeContactApi = (id) => api.delete(`/contacts/${id}`);
export const importContactsApi = () => api.post("/contacts/import").then((r) => r.data);
export const startConversationApi = (data) => api.post("/conversations/start", data).then((r) => r.data);

// ---- Suporte ----
export const getSupportChat = () => api.get("/support").then((r) => r.data);
export const sendSupportMessage = (text) => api.post("/support/messages", { text }).then((r) => r.data);
export const getSupportThreadsAdmin = () => api.get("/admin/support").then((r) => r.data);
export const getSupportMessagesAdmin = (id) => api.get(`/admin/support/${id}`).then((r) => r.data);
export const replySupportAdmin = (id, text) => api.post(`/admin/support/${id}/messages`, { text }).then((r) => r.data);
export const setSupportStatusAdmin = (id, status) => api.patch(`/admin/support/${id}`, { status });

// ---- Fluxos (construtor em canvas) ----
export const getFlows = () => api.get("/flows").then((r) => r.data);
export const createFlowApi = (data) => api.post("/flows", data).then((r) => r.data);
export const getFlowApi = (id, days = 7) => api.get(`/flows/${id}`, { params: { days } }).then((r) => r.data);
export const saveFlowApi = (id, data) => api.put(`/flows/${id}`, data).then((r) => r.data);
export const setFlowActiveApi = (id, active) => api.post(`/flows/${id}/active`, { active }).then((r) => r.data);
export const deleteFlowApi = (id) => api.delete(`/flows/${id}`);
export const simulateFlowApi = (id, data) => api.post(`/flows/${id}/simulate`, data).then((r) => r.data);

// ---- Atendimento: transferir, não lido, painel do cliente ----
export const transferConversationApi = (id, data) => api.post(`/conversations/${id}/transfer`, data).then((r) => r.data);
export const markUnreadApi = (id) => api.post(`/conversations/${id}/unread`);
export const getConversationContact = (id) => api.get(`/conversations/${id}/contact`).then((r) => r.data);
export const updateContactLeadApi = (id, data) => api.patch(`/contacts/${id}/lead`, data).then((r) => r.data);
export const createConversationDealApi = (id, data) => api.post(`/conversations/${id}/deals`, data).then((r) => r.data);

// ---- Permissões e grupos ----
export const getGroups = () => api.get("/groups").then((r) => r.data);
export const getMemberPermissions = (id) => api.get(`/team/${id}/permissions`).then((r) => r.data);

// ---- Créditos, campanhas e API ----
export const getCredits = () => api.get("/credits").then((r) => r.data);
export const getCampaigns = () => api.get("/campaigns").then((r) => r.data);
export const getCampaignApi = (id) => api.get(`/campaigns/${id}`).then((r) => r.data);
export const createCampaignApi = (data) => api.post("/campaigns", data).then((r) => r.data);
export const campaignActionApi = (id, action) => api.post(`/campaigns/${id}/${action}`).then((r) => r.data);
export const deleteCampaignApi = (id) => api.delete(`/campaigns/${id}`);
export const getApiKeys = () => api.get("/api-keys").then((r) => r.data);
export const createApiKeyApi = (name) => api.post("/api-keys", { name }).then((r) => r.data);
export const revokeApiKeyApi = (id) => api.delete(`/api-keys/${id}`);

// ---- Gestão: créditos ----
export const getAdminCredits = () => api.get("/admin/credits").then((r) => r.data);
export const getAdminCreditLedger = (accountId) => api.get(`/admin/credits/${accountId}`).then((r) => r.data);
export const setAdminMonthlyCredits = (accountId, monthly) => api.patch(`/admin/credits/${accountId}`, { monthly }).then((r) => r.data);
export const addAdminCredits = (accountId, amount, note) => api.post(`/admin/credits/${accountId}`, { amount, note }).then((r) => r.data);

// ---- Recuperar senha (público) ----
export const forgotPasswordApi = (email) => axios.post(`${API_BASE}/auth/forgot`, { email }).then((r) => r.data);

// ---- v3 ----
export const updateMyProfileApi = (name) => api.patch("/profile", { name }).then((r) => r.data);
export const changeMyPasswordApi = (password) => api.post("/profile/password", { password });
export const getAccountSettingsApi = () => api.get("/account-settings").then((r) => r.data);
export const updateAccountSettingsApi = (patch) => api.patch("/account-settings", patch).then((r) => r.data);
export const sendTypingApi = (id, typing) => api.post(`/conversations/${id}/typing`, { typing }).catch(() => {});
export const getPresenceApi = (id) => api.get(`/conversations/${id}/presence`).then((r) => r.data);
export const getStickersApi = () => api.get("/stickers").then((r) => r.data);
export const sendStickerApi = (id, { url, file }) => {
  if (file) {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/conversations/${id}/send-sticker`, form).then((r) => r.data);
  }
  return api.post(`/conversations/${id}/send-sticker`, { url }).then((r) => r.data);
};
export const acceptSupportApi = (id) => api.post(`/admin/support/${id}/accept`);

// ---- v5: cobrança ----
export const getInvoicePixApi = (id) => api.get(`/billing/invoices/${id}/pix`).then((r) => r.data);
export const adminBillingStatus = () => api.get("/admin/billing/status").then((r) => r.data);
export const adminRunBilling = () => api.post("/admin/billing/run").then((r) => r.data);
export const adminChargeInvoice = (id) => api.post(`/admin/invoices/${id}/charge`).then((r) => r.data);
export const adminTestEmail = (to) => api.post("/admin/email/test", { to }).then((r) => r.data);

// ---- v4 ----
export const getBillingApi = () => api.get("/billing").then((r) => r.data);
export const getAttendancesApi = (params) => api.get("/reports/attendances", { params }).then((r) => r.data);
export const getReportsApi = (params) => api.get("/reports", { params }).then((r) => r.data);
export const getLegalStatusApi = () => api.get("/legal/status").then((r) => r.data);
export const acceptLegalApi = (contract) => api.post("/legal/accept", { contract });
export const getPlansAdmin = () => api.get("/admin/plans").then((r) => r.data);
export const savePlanAdmin = (id, data) => (id ? api.patch(`/admin/plans/${id}`, data) : api.post("/admin/plans", data)).then((r) => r.data);
export const deletePlanAdmin = (id) => api.delete(`/admin/plans/${id}`);
export const setAccountPlanAdmin = (accountId, planId) => api.post(`/admin/accounts/${accountId}/plan`, { planId });

// ---- V6: abas liberadas ----
export const getAccountTabsApi = () => api.get("/account/tabs").then((r) => r.data);
export const setAgentTabsApi = (tabs) => api.put("/account/agent-tabs", { tabs }).then((r) => r.data);

// ---- V6: CRM ----
export const crm = {
  pipelines: () => api.get("/crm/pipelines").then((r) => r.data),
  createPipeline: (d) => api.post("/crm/pipelines", d).then((r) => r.data),
  updatePipeline: (id, d) => api.patch(`/crm/pipelines/${id}`, d).then((r) => r.data),
  deletePipeline: (id) => api.delete(`/crm/pipelines/${id}`),
  leads: (params) => api.get("/crm/leads", { params }).then((r) => r.data),
  createLead: (d) => api.post("/crm/leads", d).then((r) => r.data),
  updateLead: (id, d) => api.patch(`/crm/leads/${id}`, d).then((r) => r.data),
  deleteLead: (id) => api.delete(`/crm/leads/${id}`),
  importLeads: (d) => api.post("/crm/leads/import", d).then((r) => r.data),
  setLeadProducts: (id, items) => api.put(`/crm/leads/${id}/products`, { items }).then((r) => r.data),
  tags: () => api.get("/crm/tags").then((r) => r.data),
  createTag: (d) => api.post("/crm/tags", d).then((r) => r.data),
  updateTag: (id, d) => api.patch(`/crm/tags/${id}`, d).then((r) => r.data),
  deleteTag: (id) => api.delete(`/crm/tags/${id}`),
  products: () => api.get("/crm/products").then((r) => r.data),
  createProduct: (d) => api.post("/crm/products", d).then((r) => r.data),
  updateProduct: (id, d) => api.patch(`/crm/products/${id}`, d).then((r) => r.data),
  deleteProduct: (id) => api.delete(`/crm/products/${id}`),
  events: (params) => api.get("/crm/events", { params }).then((r) => r.data),
  createEvent: (d) => api.post("/crm/events", d).then((r) => r.data),
  updateEvent: (id, d) => api.patch(`/crm/events/${id}`, d).then((r) => r.data),
  deleteEvent: (id) => api.delete(`/crm/events/${id}`)
};

// ---- V6: governança ----
export const logSessionApi = () => api.post("/session/login").catch(() => {});
export const getAccessLogsApi = () => api.get("/access-logs").then((r) => r.data);
export const getConversationAuditApi = (id) => api.get(`/conversations/${id}/audit`).then((r) => r.data);
export const adminAccessLogs = (accountId) => api.get("/admin/logs/access", { params: accountId ? { accountId } : {} }).then((r) => r.data);
export const adminMasters = () => api.get("/admin/masters").then((r) => r.data);
export const adminCreateMaster = (d) => api.post("/admin/masters", d).then((r) => r.data);
export const adminUpdateMaster = (id, d) => api.patch(`/admin/masters/${id}`, d);
export const adminDeleteMaster = (id) => api.delete(`/admin/masters/${id}`);
export const adminUploadBoleto = (id, file) => { const fd = new FormData(); fd.append("file", file); return api.post(`/admin/invoices/${id}/boleto`, fd).then((r) => r.data); };
