import { Router } from "express";
import {
  listAccounts,
  createAccount,
  createProfile,
  createChannel,
  listAllUsers,
  supabase,
  listAllAnnouncements,
  createAnnouncement,
  deleteAnnouncement
} from "../config/db.js";
import { startWhatsAppForChannel } from "../whatsapp/baileysClient.js";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, requireSuperAdmin);

router.get("/accounts", async (req, res) => {
  res.json(await listAccounts());
});

router.get("/users", async (req, res) => {
  res.json(await listAllUsers());
});

// Cria uma conta nova (cliente) e convida o dono por e-mail.
router.post("/accounts", async (req, res) => {
  const { name, ownerEmail, ownerName } = req.body;
  if (!name || !ownerEmail) {
    return res.status(400).json({ error: "name e ownerEmail são obrigatórios" });
  }

  const account = await createAccount({ name });

  // Envia um e-mail de convite (magic link) pra pessoa definir a senha dela.
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    ownerEmail
  );

  if (inviteError) {
    return res.status(500).json({
      error: `Conta criada, mas falhou ao convidar o usuário: ${inviteError.message}`,
      account
    });
  }

  await createProfile({
    userId: invited.user.id,
    accountId: account.id,
    role: "owner",
    name: ownerName || ownerEmail,
    isSuperAdmin: false
  });

  // Cria o primeiro dispositivo de WhatsApp dessa conta e já deixa a
  // conexão pronta pra gerar QR Code assim que o dono entrar no painel.
  const channel = await createChannel({ accountId: account.id, platform: "whatsapp", name: "Principal" });
  startWhatsAppForChannel(channel.id, account.id).catch((err) => {
    console.error(`[WhatsApp] Erro ao iniciar dispositivo da conta recém-criada ${account.id}:`, err);
  });

  res.status(201).json({ account, ownerEmail, invited: true });
});

// ---------- Comunicados (avisos do super admin pras contas/usuários) ----------

router.get("/announcements", async (req, res) => {
  res.json(await listAllAnnouncements());
});

router.post("/announcements", async (req, res) => {
  const { title, message, link, scope, accountId, userId } = req.body;
  if (!title || !message || !scope) {
    return res.status(400).json({ error: "title, message e scope são obrigatórios" });
  }
  if (!["all", "account", "user"].includes(scope)) {
    return res.status(400).json({ error: "scope deve ser 'all', 'account' ou 'user'" });
  }
  if (scope === "account" && !accountId) {
    return res.status(400).json({ error: "Escolha a conta de destino." });
  }
  if (scope === "user" && !userId) {
    return res.status(400).json({ error: "Escolha o usuário de destino." });
  }

  const created = await createAnnouncement({
    title,
    message,
    link,
    scope,
    accountId,
    userId,
    createdBy: req.userName
  });
  res.status(201).json(created);
});

router.delete("/announcements/:id", async (req, res) => {
  await deleteAnnouncement(req.params.id);
  res.sendStatus(204);
});

export default router;
