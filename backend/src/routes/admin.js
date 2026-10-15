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
  deleteAnnouncement,
  createAuthUser,
  setAccountStatus,
  renameAccount,
  listAccountsWithStats,
  updateAccountCommercial,
  listInvoices,
  generateMonthlyInvoices,
  createInvoice,
  updateInvoice,
  getManagementDashboard,
  listSupportThreads,
  listSupportMessages,
  addSupportMessage,
  markSupportRead,
  setSupportThreadStatus,
  listCreditsOverview,
  setMonthlyCredits,
  addCreditEntry,
  listCreditLedger,
  getCreditBalance,
  listUserEmails
} from "../config/db.js";
import { sendEmail, emailConfigured } from "../email.js";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, requireSuperAdmin);

router.get("/accounts", async (req, res) => {
  res.json(await listAccountsWithStats());
});

router.get("/users", async (req, res) => {
  res.json(await listAllUsers());
});

// Cria uma empresa nova. O dono é opcional: dá pra criar a empresa,
// "Entrar" nela e cadastrar os usuários por dentro (Configurações → Equipe).
// Com senha, o dono já entra direto; sem senha, recebe convite por e-mail.
router.post("/accounts", async (req, res) => {
  const { name, ownerEmail, ownerName, ownerPassword } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Informe o nome da empresa." });
  if (ownerPassword && String(ownerPassword).length < 6) {
    return res.status(400).json({ error: "A senha do gestor precisa ter pelo menos 6 caracteres." });
  }

  // Cria o login antes da empresa: se o e-mail já existir, nada fica pela metade.
  let ownerUser = null;
  if (ownerEmail?.trim()) {
    try {
      ownerUser = await createAuthUser({ email: ownerEmail.trim().toLowerCase(), password: ownerPassword });
    } catch (err) {
      const msg = /already|registered|exists/i.test(err.message)
        ? "Já existe um usuário com esse e-mail."
        : `Falha ao criar o login do gestor: ${err.message}`;
      return res.status(400).json({ error: msg });
    }
  }

  const account = await createAccount({ name: name.trim() });

  if (ownerUser) {
    await createProfile({
      userId: ownerUser.id,
      accountId: account.id,
      role: "owner",
      name: ownerName?.trim() || ownerEmail.trim(),
      isSuperAdmin: false
    });
  }

  // Primeiro dispositivo de WhatsApp já criado; o QR é gerado quando
  // alguém clicar em "Conectar" (não fica gerando QR sem ninguém olhando).
  await createChannel({ accountId: account.id, platform: "whatsapp", name: "Principal" });

  res.status(201).json({ account, ownerEmail: ownerEmail || null, invited: !!ownerUser && !ownerPassword });
});

// Suspender / reativar / renomear empresa.
router.patch("/accounts/:id", async (req, res) => {
  const { status, name } = req.body || {};
  try {
    let account = null;
    if (status) {
      if (!["active", "suspended", "trial"].includes(status)) {
        return res.status(400).json({ error: "Status inválido." });
      }
      account = await setAccountStatus(req.params.id, status);
    }
    if (name?.trim()) account = await renameAccount(req.params.id, name);
    account = await updateAccountCommercial(req.params.id, req.body || {});
    res.json(account);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- Gestão: painel e cobranças ----------

router.get("/dashboard", async (req, res) => {
  try {
    res.json(await getManagementDashboard());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/invoices", async (req, res) => {
  try {
    res.json(await listInvoices({ status: req.query.status, reference: req.query.reference }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gera as cobranças do mês (ex: { reference: "2026-11" }) para todas as empresas ativas.
router.post("/invoices/generate", async (req, res) => {
  const reference = req.body?.reference;
  if (!/^\d{4}-\d{2}$/.test(reference || "")) return res.status(400).json({ error: "Mês inválido (use AAAA-MM)." });
  try {
    res.json(await generateMonthlyInvoices(reference));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/invoices", async (req, res) => {
  const { accountId, reference, amount, dueDate } = req.body || {};
  if (!accountId || !/^\d{4}-\d{2}$/.test(reference || "") || !amount || !dueDate) {
    return res.status(400).json({ error: "Informe empresa, mês (AAAA-MM), valor e vencimento." });
  }
  try {
    res.status(201).json(await createInvoice(req.body));
  } catch (err) {
    const msg = /duplicate|unique/i.test(err.message) ? "Essa empresa já tem cobrança nesse mês." : err.message;
    res.status(400).json({ error: msg });
  }
});

router.patch("/invoices/:id", async (req, res) => {
  const { status } = req.body || {};
  if (status && !["pending", "paid", "canceled"].includes(status)) {
    return res.status(400).json({ error: "Status inválido." });
  }
  try {
    res.json(await updateInvoice(req.params.id, req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- Suporte: conversas das empresas com a Helora ----------

router.get("/support", async (req, res) => {
  try {
    res.json(await listSupportThreads());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/support/:id", async (req, res) => {
  await markSupportRead(req.params.id, "admin");
  res.json(await listSupportMessages(req.params.id));
});

router.post("/support/:id/messages", async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Escreva uma mensagem." });
  const { data: thread } = await supabase.from("support_threads").select("account_id").eq("id", req.params.id).maybeSingle();
  if (!thread) return res.status(404).json({ error: "Conversa de suporte não encontrada." });
  res.status(201).json(
    await addSupportMessage({
      accountId: thread.account_id,
      threadId: req.params.id,
      userId: req.userId,
      authorName: "Suporte Helora",
      fromAdmin: true,
      text
    })
  );
});

router.patch("/support/:id", async (req, res) => {
  const { status } = req.body || {};
  if (!["open", "closed"].includes(status)) return res.status(400).json({ error: "Status inválido." });
  await setSupportThreadStatus(req.params.id, status);
  res.sendStatus(204);
});

// ---------- Créditos (liberação mensal e avulsa) ----------

router.get("/credits", async (req, res) => {
  try {
    res.json(await listCreditsOverview());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/credits/:accountId", async (req, res) => {
  res.json({ balance: await getCreditBalance(req.params.accountId), ledger: await listCreditLedger(req.params.accountId, 200) });
});

// Define a cota mensal (liberada automaticamente todo dia 1º)
router.patch("/credits/:accountId", async (req, res) => {
  try {
    await setMonthlyCredits(req.params.accountId, req.body?.monthly);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Lança créditos avulsos (positivo = libera, negativo = retira)
router.post("/credits/:accountId", async (req, res) => {
  const amount = parseInt(req.body?.amount, 10);
  if (!amount) return res.status(400).json({ error: "Informe a quantidade." });
  try {
    await addCreditEntry(req.params.accountId, amount, amount > 0 ? "manual" : "adjust", { note: req.body?.note || null });
    res.json({ balance: await getCreditBalance(req.params.accountId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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

  // Também por e-mail (EmailJS), se marcado e configurado. Roda em segundo plano.
  let email = null;
  if (req.body.sendEmail) {
    if (!emailConfigured()) {
      email = { error: "E-mail ainda não configurado (EmailJS)." };
    } else {
      let targets;
      if (scope === "user") {
        const { data } = await supabase.auth.admin.getUserById(userId);
        targets = data?.user?.email ? [{ name: "", email: data.user.email }] : [];
      } else {
        targets = await listUserEmails({ accountId: scope === "account" ? accountId : null });
      }
      email = { queued: targets.length };
      (async () => {
        for (const t of targets) {
          await sendEmail("EMAILJS_TEMPLATE_NOTICE", { to_email: t.email, to_name: t.name || "", title, message, link: link || "" }).catch((e) =>
            console.error("[E-mail] comunicado:", e.response?.data || e.message)
          );
          await new Promise((r) => setTimeout(r, 1200)); // EmailJS limita a ~1 envio/segundo
        }
      })();
    }
  }
  res.status(201).json({ ...created, email });
});

router.delete("/announcements/:id", async (req, res) => {
  await deleteAnnouncement(req.params.id);
  res.sendStatus(204);
});

export default router;
