import "dotenv/config";
import express from "express";
import cors from "cors";

import apiRoutes from "./routes/api.js";
import adminRoutes from "./routes/admin.js";
import metaWebhookRoutes from "./meta/webhookRoutes.js";
import { startAllChannels } from "./whatsapp/baileysClient.js";
import { startScheduledMessagesDispatcher } from "./scheduler.js";
import { startCampaignDispatcher } from "./campaignRunner.js";
import publicRoutes from "./routes/public.js";
import { autoMigrateIfNeeded } from "./migrateSupabase.js";
import { startBillingScheduler, markInvoicePaid } from "./billing.js";
import { supabase as db } from "./config/db.js";
import { supabase } from "./config/db.js";
import { sendEmail, emailConfigured } from "./email.js";

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
app.use("/public/v1", cors(), express.json({ limit: "2mb" }), publicRoutes);
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || FRONTEND_ORIGINS.includes(origin))
  })
);
app.use(express.json());

// Rotas
app.use("/api/admin", adminRoutes);
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
  const redirectTo = `${FRONTEND_ORIGINS[0]}/?reset=1`;
  try {
    if (emailConfigured() && process.env.EMAILJS_TEMPLATE_RESET) {
      const { data, error } = await supabase.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
      if (!error && data?.properties?.action_link) {
        await sendEmail("EMAILJS_TEMPLATE_RESET", { to_email: email, to_name: "", reset_link: data.properties.action_link });
      }
    } else {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    }
  } catch (err) {
    console.error("[Senha] Falha ao enviar recuperação:", err.response?.data || err.message);
  }
  res.json(ok);
});

// Usado pelo healthcheck do Railway.
app.get("/health", (req, res) => res.json({ ok: true }));

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[key]) console.error(`[Config] Variável ${key} não definida — o backend não vai funcionar.`);
}

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
startBillingScheduler();

// Migração de banco (só roda se OLD_SUPABASE_* estiver configurado e o banco atual vazio)
autoMigrateIfNeeded().catch((err) => console.error("[Migração]", err.message));

// Fica de olho nas mensagens agendadas (Etapa 8) e dispara quando vencem.
startScheduledMessagesDispatcher();

// Campanhas (disparo em massa): verifica a cada 30s o que precisa rodar.
startCampaignDispatcher();
