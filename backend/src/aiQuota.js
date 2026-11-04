/**
 * Limite mensal da Helora IA por plano.
 *
 * Regra (simples e auditável):
 * - 1 atendimento = 1 conversa respondida pelo atendente IA dentro do mês (horário de Brasília).
 *   Várias mensagens na mesma conversa, no mesmo mês, contam 1 vez só.
 * - Cada atendimento vira um registro único em account_integrations
 *   (provider "ai_at_AAAAMM_<conversa>"). A contagem é o número desses registros:
 *   não há somas que se percam, e dá para listar conversa por conversa se o cliente questionar.
 * - Ao chegar no limite, a IA para de abrir atendimentos NOVOS (as conversas já abertas no mês seguem até o fim)
 *   e a conversa nova segue para o fluxo/atendente humano. O gestor recebe aviso em 80% e em 100%.
 */
import { supabase } from "./config/db.js";
import { sendMail, appUrl } from "./email.js";

export const AI_PLANS = {
  essencial: { name: "Essencial", limit: 500, web: false, images: false },
  profissional: { name: "Profissional", limit: 1000, web: true, images: false },
  avancado: { name: "Avançado", limit: 3000, web: true, images: true },
  personalizado: { name: "Personalizado", limit: null, web: true, images: true }
};

/** Mês corrente no fuso de Brasília, ex.: "202611". */
export function monthKey(d = new Date()) {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  return s.replace("-", "");
}
const nextMonthStart = () => {
  const [y, m] = monthKey().match(/(\d{4})(\d{2})/).slice(1).map(Number);
  return `01/${String(m === 12 ? 1 : m + 1).padStart(2, "0")}/${m === 12 ? y + 1 : y}`;
};

/** Plano de IA da empresa. Sem plano definido: sem limite (comportamento antigo). */
export async function getAIPlan(accountId) {
  const { data } = await supabase.from("account_integrations").select("config").eq("account_id", accountId).eq("provider", "ai_plan").maybeSingle();
  const c = data?.config || {};
  const base = AI_PLANS[c.plan] || null;
  if (!base) return { plan: null, name: "Sem plano", limit: null, extra: 0, web: true, images: true, alerts: c.alerts || {} };
  const limit = c.plan === "personalizado" ? (Number(c.limit) > 0 ? Number(c.limit) : null) : base.limit;
  return { plan: c.plan, name: base.name, limit, extra: Math.max(0, Number(c.extra) || 0), web: base.web, images: base.images, alerts: c.alerts || {} };
}

export async function setAIPlan(accountId, { plan, limit, extra }) {
  const { data } = await supabase.from("account_integrations").select("config").eq("account_id", accountId).eq("provider", "ai_plan").maybeSingle();
  const cur = data?.config || {};
  const cfg = { ...cur, plan: AI_PLANS[plan] ? plan : null, limit: Number(limit) || null, extra: Math.max(0, Number(extra) || 0) };
  const { error } = await supabase.from("account_integrations").upsert(
    { account_id: accountId, provider: "ai_plan", config: cfg, status: "connected", updated_at: new Date().toISOString() },
    { onConflict: "account_id,provider" }
  );
  if (error) throw error;
  return getAIPlan(accountId);
}

const key = (month, conversationId) => `ai_at_${month}_${conversationId}`;

/** Quantos atendimentos a empresa já usou no mês (contagem exata). */
export async function countAtendimentos(accountId, month = monthKey()) {
  const { count, error } = await supabase.from("account_integrations")
    .select("provider", { count: "exact", head: true })
    .eq("account_id", accountId).like("provider", `ai_at_${month}_%`);
  if (error) throw error;
  return count || 0;
}

/** Lista os atendimentos do mês (para conferência). */
export async function listAtendimentos(accountId, month = monthKey()) {
  const { data } = await supabase.from("account_integrations").select("provider, config, updated_at")
    .eq("account_id", accountId).like("provider", `ai_at_${month}_%`).order("updated_at", { ascending: false }).limit(5000);
  return (data || []).map((r) => ({ conversationId: r.provider.split("_").slice(3).join("_"), name: r.config?.name || "", at: r.config?.at || r.updated_at }));
}

/** Resumo para a tela: plano, limite, usados, restantes. */
export async function aiUsage(accountId) {
  const p = await getAIPlan(accountId);
  const used = await countAtendimentos(accountId);
  const total = p.limit == null ? null : p.limit + p.extra;
  return {
    plan: p.plan, planName: p.name, limit: total, used, remaining: total == null ? null : Math.max(0, total - used),
    percent: total ? Math.min(100, Math.round((used / total) * 100)) : 0, reached: total != null && used >= total,
    web: p.web, images: p.images, resetsOn: nextMonthStart(), month: monthKey()
  };
}

/**
 * Pode a IA atender esta conversa? Registra o atendimento quando é o primeiro do mês nesta conversa.
 * Retorna { ok, reached, used, limit }.
 */
export async function claimAtendimento(accountId, conversation) {
  const month = monthKey();
  const k = key(month, conversation.id);
  const { data: already } = await supabase.from("account_integrations").select("provider").eq("account_id", accountId).eq("provider", k).maybeSingle();
  if (already) return { ok: true, counted: false };
  const p = await getAIPlan(accountId);
  const total = p.limit == null ? null : p.limit + p.extra;
  const used = await countAtendimentos(accountId, month);
  if (total != null && used >= total) {
    alertOnce(accountId, month, "100", used, total).catch(() => {});
    return { ok: false, reached: true, used, limit: total };
  }
  const { error } = await supabase.from("account_integrations").upsert(
    { account_id: accountId, provider: k, status: "connected", config: { name: conversation.name || "", at: new Date().toISOString() }, updated_at: new Date().toISOString() },
    { onConflict: "account_id,provider", ignoreDuplicates: true }
  );
  if (error) console.warn("[IA] atendimento não registrado:", error.message);
  const now = used + 1;
  if (total != null && now >= total) alertOnce(accountId, month, "100", now, total).catch(() => {});
  else if (total != null && now >= Math.ceil(total * 0.8)) alertOnce(accountId, month, "80", now, total).catch(() => {});
  return { ok: true, counted: true, used: now, limit: total };
}

/** Avisa os gestores por e-mail uma única vez por mês e por faixa (80% / 100%). */
async function alertOnce(accountId, month, level, used, total) {
  const { data } = await supabase.from("account_integrations").select("config").eq("account_id", accountId).eq("provider", "ai_plan").maybeSingle();
  const cfg = data?.config || {};
  const alerts = cfg.alerts || {};
  if (alerts[`${month}_${level}`]) return;
  alerts[`${month}_${level}`] = new Date().toISOString();
  await supabase.from("account_integrations").update({ config: { ...cfg, alerts } }).eq("account_id", accountId).eq("provider", "ai_plan");
  const [{ data: acc }, { data: owners }] = await Promise.all([
    supabase.from("accounts").select("name").eq("id", accountId).maybeSingle(),
    supabase.from("profiles").select("id, name").eq("account_id", accountId).eq("role", "owner")
  ]);
  const full = level === "100";
  for (const o of owners || []) {
    const { data: u } = await supabase.auth.admin.getUserById(o.id).catch(() => ({ data: null }));
    if (!u?.user?.email) continue;
    await sendMail({
      to: u.user.email, name: o.name || "", label: "Helora IA",
      subject: full ? "Limite de atendimentos da Helora IA atingido" : "Helora IA: 80% dos atendimentos do mês usados",
      title: full ? "Você atingiu o limite de atendimentos da IA" : "Você já usou 80% dos atendimentos da IA",
      message: full
        ? `A ${acc?.name || "sua empresa"} usou ${used} de ${total} atendimentos da Helora IA neste mês.\n\nAs conversas que já estavam com a IA continuam normalmente. Conversas novas passam para o fluxo e para a equipe até ${nextMonthStart()}, quando o contador zera. Para continuar com a IA agora, fale com a gente e aumente o plano.`
        : `A ${acc?.name || "sua empresa"} já usou ${used} de ${total} atendimentos da Helora IA neste mês. O contador zera em ${nextMonthStart()}.`,
      buttonText: "Ver o uso da IA", buttonLink: `${appUrl()}/?aba=ia`
    }).catch(() => {});
  }
}
