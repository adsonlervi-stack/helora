import waTemplates from "./meta/waTemplates.js";
import { igRouter, igCallbackRouter, refreshInstagramTokens } from "./meta/instagram.js";
import { metaRouter, metaCallbackRouter } from "./meta/oauth.js";
import "dotenv/config";
import express from "express";
import cors from "cors";

import apiRoutes from "./routes/api.js";
import adminRoutes from "./routes/admin.js";
import crmRoutes from "./routes/crm.js";
import aiRoutes from "./routes/ai.js";
import integrationsRoutes, { publicFormHandler } from "./routes/integrations.js";
import { canvaCallback } from "./integrations/canva.js";
import { startMailSync } from "./integrations/jobs.js";
import { startBrainLearning } from "./integrations/learn.js";
import { startMeetingReminders } from "./meetingNotify.js";
import { googleRouter, googleCallbackRouter } from "./google.js";
import { pushRouter } from "./push.js";
import { startCrmReminders } from "./crmReminders.js";
import { startRetentionJob } from "./retention.js";
import metaWebhookRoutes from "./meta/webhookRoutes.js";
import { startAllChannels } from "./whatsapp/baileysClient.js";
import { startScheduledMessagesDispatcher } from "./scheduler.js";
import { startCampaignDispatcher } from "./campaignRunner.js";
import publicRoutes from "./routes/public.js";
import publicDocs from "./routes/publicDocs.js";
import { autoMigrateIfNeeded } from "./migrateSupabase.js";
import { startBillingScheduler, markInvoicePaid } from "./billing.js";
import { supabase as db } from "./config/db.js";
import { supabase } from "./config/db.js";
import { sendEmail, sendMail, emailConfigured } from "./email.js";
import { startSupportWatcher } from "./governance.js";

const PORT = process.env.PORT || 4000;
// Aceita uma ou várias URLs separadas por vírgula (ex: domínio do Railway + domínio próprio).
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const app = express();
app.set("trust proxy", 1);

// API aberta: aceita chamadas de qualquer site (protegida pela chave X-API-Key)
// Webhook do Asaas (pagamento confirmado → fatura paga e empresa liberada)
app.post("/webhook/asaas", express.json(), async (req, res) => {
  const token = req.headers["asaas-access-token"];
  if (process.env.ASAAS_WEBHOOK_TOKEN && token !== process.env.ASAAS_WEBHOOK_TOKEN) return res.sendStatus(401);
  res.sendStatus(200);
  const { event, payment } = req.body || {};
  if (!payment?.id || !["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event)) return;
  try {
    let { data: inv } = await db.from("invoices").select("id").eq("asaas_payment_id", payment.id).maybeSingle();
    if (!inv && payment.externalReference) ({ data: inv } = await db.from("invoices").select("id").eq("id", payment.externalReference).maybeSingle());
    if (inv) await markInvoicePaid(inv.id, { method: "pix" });
  } catch (err) {
    console.error("[Asaas webhook]", err.message);
  }
});

// Planos (para o site da Helora) — público, sem chave
app.get("/public/plans", cors(), async (req, res) => {
  try {
    const { listPlans } = await import("./config/db.js");
    res.json(await listPlans({ onlyActive: true }));
  } catch {
    res.json([]);
  }
});
// Formulários (site, landing page, Google Forms): cria o lead no CRM da empresa
app.options("/public/forms/:token", cors());
app.post("/public/forms/:token", cors(), express.urlencoded({ extended: true, limit: "1mb" }), express.json({ limit: "1mb" }), publicFormHandler);
// Retorno do login do Canva
app.get("/integrations/canva/callback", canvaCallback);
app.use("/public", cors(), publicDocs);
app.use("/public/v1", cors(), express.json({ limit: "2mb" }), publicRoutes);
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || FRONTEND_ORIGINS.includes(origin))
  })
);
app.use(express.json());

// Rotas
app.use("/api/admin", adminRoutes);
app.use("/api/crm", crmRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/integrations", integrationsRoutes);
app.use("/api/google", googleRouter);
app.use("/api/meta", metaRouter);
app.use("/api/wa", waTemplates);
app.use("/api/instagram", igRouter);
app.use("/", igCallbackRouter);
app.use("/", metaCallbackRouter);
app.use("/api/push", pushRouter);
app.use("/", googleCallbackRouter);
app.use("/api", apiRoutes);
app.use("/", metaWebhookRoutes); // expõe GET/POST /webhook/meta

app.get("/", (req, res) => {
  res.json({ ok: true, service: "helora-backend" });
});

// Esqueci minha senha (público). Usa EmailJS se configurado; senão, o e-mail padrão do Supabase.
const forgotHits = new Map();
app.post("/auth/forgot", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const ip = req.ip;
  const now = Date.now();
  const recent = (forgotHits.get(ip) || []).filter((t) => now - t < 10 * 60000);
  if (recent.length >= 5) return res.status(429).json({ error: "Muitas tentativas. Tente de novo em alguns minutos." });
  forgotHits.set(ip, [...recent, now]);
  const ok = { ok: true, message: "Se esse e-mail estiver cadastrado, enviamos um link para criar uma nova senha." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json(ok);
  // Volta para o mesmo domínio em que a pessoa pediu (o Helora tem vários domínios)
  const origin = String(req.get("origin") || "").replace(/\/$/, "");
  const base = FRONTEND_ORIGINS.includes(origin) ? origin : FRONTEND_ORIGINS[0];
  try {
    const { data, error } = await supabase.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${base}/?reset=1` } });
    if (error || !data?.properties?.hashed_token) {
      if (error && !/not found|no user/i.test(error.message)) console.warn("[Senha] generateLink:", error.message);
      return res.json(ok);
    }
    // Link direto para o Helora: o próprio app valida o token (não depende da lista de redirecionamento do Supabase)
    const link = `${base}/?reset=1&token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`;
    const nome = String(data.user?.user_metadata?.name || data.user?.user_metadata?.full_name || "").split(" ")[0];
    if (emailConfigured()) {
      try { await sendEmail("EMAILJS_TEMPLATE_RESET", { to_email: email, to_name: nome, reset_link: link }); }
      catch (e) {
        console.warn("[Senha] modelo recuperar_senha falhou, usando o genérico:", e.response?.data || e.message);
        await sendMail({ to: email, name: nome, subject: "Crie sua nova senha do Helora", title: "Recuperar senha", label: "Segurança",
          message: "Recebemos um pedido para criar uma nova senha para a sua conta. Clique no botão abaixo. O link vale por 1 hora.",
          note: "Se não foi você, pode ignorar este e-mail. Sua senha atual continua a mesma.", buttonText: "Criar nova senha", buttonLink: link });
      }
    } else {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${base}/?reset=1` });
    }
  } catch (err) {
    console.error("[Senha] Falha ao enviar recuperação:", err.response?.data || err.message);
  }
  res.json(ok);
});

// Formulário do site (heloracrm.com.br): avisa a Helora por e-mail e, se configurado, cria o lead no CRM
const siteHits = new Map();
app.post("/public/site-lead", cors(), express.json({ limit: "20kb" }), async (req, res) => {
  const b = req.body || {};
  if (b.site) return res.json({ ok: true }); // robô
  const now = Date.now(), recent = (siteHits.get(req.ip) || []).filter((t) => now - t < 3600000);
  if (recent.length >= 8) return res.status(429).json({ error: "Muitas tentativas." });
  siteHits.set(req.ip, [...recent, now]);
  const clip = (v, n = 120) => String(v || "").trim().slice(0, n);
  const lead = { nome: clip(b.nome), empresa: clip(b.empresa), whatsapp: clip(b.whatsapp, 30), email: clip(b.email), equipe: clip(b.equipe, 40) };
  if (!lead.nome || !lead.whatsapp || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return res.status(400).json({ error: "Dados incompletos." });
  console.log("[Site] novo lead:", JSON.stringify(lead));
  try {
    const accId = process.env.SITE_LEADS_ACCOUNT_ID;
    if (accId) {
      const { data: pipe } = await supabase.from("crm_pipelines").select("id, stages").eq("account_id", accId).order("created_at").limit(1).maybeSingle();
      if (pipe) await supabase.from("crm_leads").insert({ account_id: accId, pipeline_id: pipe.id, stage: pipe.stages?.[0]?.id, name: lead.nome, phone: lead.whatsapp.replace(/\D/g, ""), email: lead.email, company: lead.empresa, source: "Site", custom: { equipe: lead.equipe }, stage_changed_at: new Date().toISOString() });
    }
    const { data: admins } = await supabase.from("profiles").select("id").eq("is_super_admin", true);
    const to = new Set(String(process.env.SUPPORT_ALERT_EMAIL || "").split(",").map((x) => x.trim()).filter(Boolean));
    for (const a of admins || []) { const { data: u } = await supabase.auth.admin.getUserById(a.id).catch(() => ({ data: null })); if (u?.user?.email) to.add(u.user.email); }
    for (const t of to) await sendMail({ to: t, subject: `Novo interessado no site: ${lead.nome}`, title: "Novo interessado no Helora", label: "Site",
      message: `Nome: ${lead.nome}\nEmpresa: ${lead.empresa}\nWhatsApp: ${lead.whatsapp}\nE-mail: ${lead.email}\nEquipe: ${lead.equipe}`,
      buttonText: "Chamar no WhatsApp", buttonLink: `https://wa.me/${lead.whatsapp.replace(/\D/g, "").replace(/^(?!55)/, "55")}` }).catch((e) => console.warn("[Site] e-mail:", e.message));
  } catch (e) { console.warn("[Site] lead:", e.message); }
  res.json({ ok: true });
});

// Usado pelo healthcheck do Railway.
app.get("/health", (req, res) => res.json({ ok: true }));

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[key]) console.error(`[Config] Variável ${key} não definida — o backend não vai funcionar.`);
}

startSupportWatcher();
setTimeout(refreshInstagramTokens, 120000); setInterval(refreshInstagramTokens, 24 * 60 * 60 * 1000);
import("./routes/crm.js").then(({ runPolicyJobs }) => { setTimeout(runPolicyJobs, 90 * 1000); setInterval(runPolicyJobs, 6 * 60 * 60 * 1000); }).catch(() => {});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Backend] Rodando em http://localhost:${PORT}`);
});

// Liga a conexão de WhatsApp de CADA dispositivo de cada conta ativa (uma
// sessão Baileys por número, isolada). Dispositivos novos são iniciados
// sob demanda quando criados pela tela de Canais.
startAllChannels().catch((err) => {
  console.error("[WhatsApp] Erro ao iniciar dispositivos:", err);
});

// Cobrança automática das mensalidades (PIX/Asaas + e-mails + bloqueio)
// Tarefas gerais (cobrança, limpeza) rodam em um servidor só. Nos servidores extras use RUN_JOBS=0.
if (process.env.RUN_JOBS !== "0") {
  startBillingScheduler();
  startRetentionJob();
}

// Migração de banco (só roda se OLD_SUPABASE_* estiver configurado e o banco atual vazio)
autoMigrateIfNeeded().catch((err) => console.error("[Migração]", err.message));

// Fica de olho nas mensagens agendadas (Etapa 8) e dispara quando vencem.
startScheduledMessagesDispatcher();

// Campanhas (disparo em massa): verifica a cada 30s o que precisa rodar.
startCampaignDispatcher();

// Lembretes por data do CRM (ex.: "faltam 3 dias para a viagem")
startCrmReminders();
startMailSync();
startBrainLearning();
startMeetingReminders();
