import { supabase } from "./config/db.js";
import { sendMail, appUrl, emailConfigured } from "./email.js";

/**
 * Governança (V6 fase 4): permissões por aba no servidor, log de acessos,
 * auditoria de conversas, alerta de suporte por e-mail e e-mail do contrato.
 */

// ---------------------------------------------------------------- Abas no servidor
const DEFAULT_AGENT_TABS = ["home", "conversations", "deals", "contacts", "reports", "tasks"];
const TAB_BY_PATH = [
  [/^\/api\/crm(\/|$)/, "crm"],
  [/^\/api\/campaigns(\/|$)/, "campaigns"],
  [/^\/api\/(flows|bot-flow|agents)(\/|$)/, "agents"],
  [/^\/api\/reports(\/|$)/, "reports"],
  [/^\/api\/deals(\/|$)/, "deals"],
  [/^\/api\/tasks(\/|$)/, "tasks"],
  [/^\/api\/(api-keys|webhooks)(\/|$)/, "api"]
];
const tabCache = new Map(); // accountId -> { at, enabled, agent }

async function accountTabs(accountId) {
  const hit = tabCache.get(accountId);
  if (hit && Date.now() - hit.at < 30000) return hit;
  const { data } = await supabase.from("accounts").select("enabled_tabs, agent_tabs").eq("id", accountId).maybeSingle();
  const v = {
    at: Date.now(),
    enabled: Array.isArray(data?.enabled_tabs) ? data.enabled_tabs : null,
    agent: Array.isArray(data?.agent_tabs) ? data.agent_tabs : DEFAULT_AGENT_TABS
  };
  tabCache.set(accountId, v);
  return v;
}
/** API/integrações: só para empresas liberadas explicitamente pela Gestora. */
export async function apiEnabled(accountId) {
  const t = await accountTabs(accountId);
  return !!t.enabled?.includes("api");
}
export const invalidateTabs = (accountId) => tabCache.delete(accountId);

/** Bloqueia no servidor as abas que a empresa não contratou ou que o atendente não pode ver. */
export async function enforceTabs(req, res, next) {
  try {
    if (req.isSuperAdmin) return next();
    const url = (req.originalUrl || "").split("?")[0];
    const rule = TAB_BY_PATH.find(([re]) => re.test(url));
    if (!rule) return next();
    const tab = rule[1];
    const t = await accountTabs(req.accountId);
    if (tab === "api") return t.enabled?.includes("api") ? next() : res.status(403).json({ error: "API e integrações não estão liberadas para a sua empresa. Fale com o suporte." });
    if (t.enabled && !t.enabled.includes(tab)) return res.status(403).json({ error: "Este módulo não está liberado para a sua empresa." });
    // Atendente: leitura de relatórios/pipeline/tarefas só se a aba estiver liberada a ele
    if (req.role === "agent" && !t.agent.includes(tab)) {
      // tarefas automáticas e o próprio pipeline ainda podem ser lidos por outras telas (ex.: painel do cliente)
      if (req.method === "GET" && (tab === "deals" || tab === "tasks")) return next();
      return res.status(403).json({ error: "Seu perfil não tem acesso a este módulo." });
    }
    next();
  } catch {
    next();
  }
}

// ---------------------------------------------------------------- Log de acessos
export function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.headers["x-real-ip"] || req.socket?.remoteAddress || null;
}

export async function logAccess(req, event = "login") {
  try {
    await supabase.from("access_logs").insert({
      user_id: req.userId, account_id: req.accountId, user_name: req.userName,
      ip: clientIp(req), user_agent: String(req.headers["user-agent"] || "").slice(0, 300), event
    });
  } catch (err) {
    console.warn("[Acessos] não registrado:", err.message);
  }
}

export async function listAccessLogs({ accountId, userId, limit = 300 } = {}) {
  let q = supabase.from("access_logs").select("*, accounts(name)").order("created_at", { ascending: false }).limit(limit);
  if (accountId) q = q.eq("account_id", accountId);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw error;
  return data.map((l) => ({
    id: l.id, userId: l.user_id, userName: l.user_name, accountId: l.account_id, accountName: l.accounts?.name || null,
    ip: l.ip, userAgent: l.user_agent, event: l.event, createdAt: l.created_at
  }));
}

// ---------------------------------------------------------------- Auditoria de conversas
export async function listConversationAudit(accountId, conversationId) {
  const { data, error } = await supabase
    .from("message_audit")
    .select("*")
    .eq("account_id", accountId)
    .eq("conversation_id", conversationId)
    .order("at", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return data.map((a) => ({
    id: a.id, messageId: a.message_id, action: a.action, author: a.author, direction: a.direction,
    senderName: a.sender_name, text: a.text, mediaUrl: a.media_url, mediaType: a.media_type, at: a.at
  }));
}

// ---------------------------------------------------------------- Alerta de suporte
const lastAlert = new Map();
async function superAdminEmails() {
  if (process.env.SUPPORT_ALERT_EMAIL) return process.env.SUPPORT_ALERT_EMAIL.split(",").map((s) => s.trim()).filter(Boolean);
  const { data } = await supabase.from("profiles").select("id").eq("is_super_admin", true);
  const out = [];
  for (const p of data || []) {
    const { data: u } = await supabase.auth.admin.getUserById(p.id).catch(() => ({ data: null }));
    if (u?.user?.email) out.push(u.user.email);
  }
  return out;
}

/** Cliente abriu/escreveu no suporte → e-mail para a Gestora (no máx. 1 a cada 20 min por empresa). */
export async function notifySupport({ accountId, userName, text }) {
  if (!emailConfigured()) return;
  const k = accountId;
  if (Date.now() - (lastAlert.get(k) || 0) < 20 * 60 * 1000) return;
  lastAlert.set(k, Date.now());
  try {
    const { data: acc } = await supabase.from("accounts").select("name").eq("id", accountId).maybeSingle();
    const to = await superAdminEmails();
    for (const email of to) {
      await sendMail({
        to: email, name: "Equipe Helora", label: "Suporte", subject: `Novo chamado de suporte · ${acc?.name || "Empresa"}`,
        title: `${acc?.name || "Uma empresa"} pediu suporte`,
        message: `${userName || "Um usuário"} escreveu:\n\n"${String(text || "").slice(0, 600)}"`,
        buttonText: "Abrir o suporte", buttonLink: `${appUrl()}/`, note: "Responda pelo Painel Helora → Suporte."
      });
    }
  } catch (err) {
    console.warn("[Suporte] alerta por e-mail falhou:", err.message);
  }
}

// ---------------------------------------------------------------- Contrato
export async function emailContract({ userId, accountId }) {
  if (!emailConfigured()) return;
  try {
    const [{ data: acc }, { data: u }] = await Promise.all([
      supabase.from("accounts").select("name, contact_email, contract_accepted_at").eq("id", accountId).maybeSingle(),
      supabase.auth.admin.getUserById(userId)
    ]);
    const when = new Date(acc?.contract_accepted_at || Date.now()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const recipients = [...new Set([u?.user?.email, acc?.contact_email].filter(Boolean))];
    for (const to of recipients) {
      await sendMail({
        to, name: acc?.name || "Cliente", label: "Contrato", subject: "Contrato Helora aceito — sua cópia",
        title: "Contrato de prestação de serviços",
        message: `O contrato da Helora para ${acc?.name || "sua empresa"} foi aceito em ${when} por ${u?.user?.email || "um gestor"}.\n\nGuarde este e-mail como comprovante. A íntegra do contrato está no link abaixo.`,
        buttonText: "Ver o contrato", buttonLink: `${appUrl()}/contrato.html`, note: "Dúvidas? Responda este e-mail ou fale com o suporte dentro do sistema."
      });
    }
  } catch (err) {
    console.warn("[Contrato] e-mail não enviado:", err.message);
  }
}
