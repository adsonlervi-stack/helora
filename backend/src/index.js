import "dotenv/config";
import express from "express";
import cors from "cors";

import apiRoutes from "./routes/api.js";
import adminRoutes from "./routes/admin.js";
import metaWebhookRoutes from "./meta/webhookRoutes.js";
import { startAllChannels } from "./whatsapp/baileysClient.js";
import { startScheduledMessagesDispatcher } from "./scheduler.js";

const PORT = process.env.PORT || 4000;
// Aceita uma ou várias URLs separadas por vírgula (ex: domínio do Railway + domínio próprio).
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const app = express();
app.set("trust proxy", 1);
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

// Fica de olho nas mensagens agendadas (Etapa 8) e dispara quando vencem.
startScheduledMessagesDispatcher();
