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
  acceptSupportThread,
  listPlans,
  savePlan,
  deletePlan,
  setAccountPlan,
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
import { runMigration, migrationState } from "../migrateSupabase.js";
import { mailWelcomeCompany } from "../emails.js";
import { ensureAsaasCharge, runBillingCycle, markInvoicePaid } from "../billing.js";
import { sendMail } from "../email.js";
import { asaasConfigured } from "../asaas.js";
import multer from "multer";
import { uploadMedia } from "../storage.js";
import { invalidateTabs, listAccessLogs } from "../governance.js";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const router = Router();

router.use(requireAuth, requireSuperAdmin);

// Migração do Supabase (uso único, só super admin)
router.post("/migrate-supabase", async (req, res) => {
  if (!(process.env.NEW_SUPABASE_URL && process.env.NEW_SUPABASE_SERVICE_ROLE_KEY) && !(process.env.OLD_SUPABASE_URL && process.env.OLD_SUPABASE_SERVICE_ROLE_KEY))
    return res.status(400).json({ error: "Configure OLD_SUPABASE_URL e OLD_SUPABASE_SERVICE_ROLE_KEY no Railway." });
  if (migrationState.running) return res.status(409).json({ error: "Já está rodando." });
  runMigration().catch(() => {});
  res.status(202).json({ started: true });
});
router.get("/migrate-supabase", (req, res) => res.json(migrationState));

// ---------- Cobrança (Asaas / PIX) ----------
router.get("/billing/status", (req, res) => res.json({ asaas: asaasConfigured(), email: emailConfigured(), sandbox: process.env.ASAAS_SANDBOX === "1" }));
router.post("/billing/run", async (req, res) => {
  try {
    res.json({ log: await runBillingCycle() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router.post("/invoices/:id/charge", async (req, res) => {
  try {
    const inv = await ensureAsaasCharge(req.params.id);
    res.json({ asaasPaymentId: inv.asaas_payment_id, invoiceUrl: inv.invoice_url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router.post("/invoices/:id/paid", async (req, res) => {
  await markInvoicePaid(req.params.id, { method: req.body?.method || "manual" });
  res.sendStatus(204);
});
router.post("/email/test", async (req, res) => {
  try {
    const ok = await sendMail({
      to: req.body?.to,
      subject: "Teste de e-mail – Helora",
      title: "Está funcionando! ✅",
      message: "Este é um e-mail de teste do Helora. Se chegou, o EmailJS está configurado certinho.",
      buttonText: "Abrir o Helora"
    });
    res.json({ sent: ok });
  } catch (err) {
    res.status(400).json({ error: err.response?.data || err.message });
  }
});

// ---------- Planos ----------
router.get("/plans", async (req, res) => {
  try {
    res.json(await listPlans());
  } catch (err) {
    res.status(500).json({ error: /plans/.test(err.message) ? "Rode a migration 018 no Supabase." : err.message });
  }
});
router.post("/plans", async (req, res) => {
  try {
    res.status(201).json(await savePlan(null, req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router.patch("/plans/:id", async (req, res) => {
  try {
    res.json(await savePlan(req.params.id, req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
router.delete("/plans/:id", async (req, res) => {
  await deletePlan(req.params.id);
  res.sendStatus(204);
});
router.post("/accounts/:id/plan", async (req, res) => {
  try {
    await setAccountPlan(req.params.id, req.body?.planId || null);
    res.sendStatus(204);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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
  const { name, ownerEmail, ownerName, ownerPassword, maxUsers, maxWhatsappChannels, allowCloudApi } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Informe o nome da empresa." });
  if (!(parseInt(maxUsers, 10) >= 1)) return res.status(400).json({ error: "Informe a quantidade de usuários da empresa." });
  if (!(parseInt(maxWhatsappChannels, 10) >= 0) || maxWhatsappChannels === "" || maxWhatsappChannels == null)
    return res.status(400).json({ error: "Informe a quantidade de canais de WhatsApp da empresa." });
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

  const account = await createAccount({ name: name.trim(), maxUsers, maxWhatsappChannels, allowCloudApi: !!allowCloudApi });

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

  if (ownerUser && ownerEmail) mailWelcomeCompany({ to: ownerEmail.trim().toLowerCase(), name: ownerName, company: account.name, password: !!ownerPassword });
  res.status(201).json({ account, ownerEmail: ownerEmail || null, invited: !!ownerUser && !ownerPassword });
});

// Suspender / reativar / renomear empresa.
router.patch("/accounts/:id", async (req, res) => {
  const { status, name } = req.body || {};
  invalidateTabs(req.params.id);
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
    // Baixa manual também libera a empresa bloqueada e manda o e-mail de confirmação
    if (status === "paid") {
      await markInvoicePaid(req.params.id, { method: req.body.paymentMethod || "manual" });
      return res.json({ ok: true });
    }
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
  const { data: thread } = await supabase.from("support_threads").select("account_id, status").eq("id", req.params.id).maybeSingle();
  if (!thread) return res.status(404).json({ error: "Conversa de suporte não encontrada." });
  if (thread.status === "waiting") return res.status(409).json({ error: "Aceite o chamado antes de responder." });
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

router.post("/support/:id/accept", async (req, res) => {
  try {
    await acceptSupportThread(req.params.id, req.userName || "Suporte");
    res.sendStatus(204);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
  const { title, message, link, buttonText, scope, accountId, userId } = req.body;
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
    buttonText,
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
          await sendEmail("EMAILJS_TEMPLATE_NOTICE", { to_email: t.email, to_name: t.name || "", title, message, link: link || (process.env.FRONTEND_ORIGIN || "").split(",")[0], button_text: buttonText || "Abrir o Helora" }).catch((e) =>
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


// ---------------------------------------------------------------- V6 fase 4
// Logs de acesso (todas as empresas ou uma)
router.get("/logs/access", async (req, res) => {
  try {
    res.json(await listAccessLogs({ accountId: req.query.accountId || undefined, limit: 500 }));
  } catch (err) {
    res.status(500).json({ error: /access_logs/.test(err.message) ? "Rode a migration 024 no Supabase." : err.message });
  }
});

// Usuários da Gestora (Master = tudo; Suporte = sem financeiro/planos)
router.get("/masters", async (req, res) => {
  try {
    const { data, error } = await supabase.from("profiles").select("id, name, admin_level, created_at").eq("is_super_admin", true).order("created_at");
    if (error) throw error;
    const out = [];
    for (const p of data) {
      const { data: u } = await supabase.auth.admin.getUserById(p.id).catch(() => ({ data: null }));
      out.push({ id: p.id, name: p.name, level: p.admin_level || "master", email: u?.user?.email || null, createdAt: p.created_at, me: p.id === req.userId });
    }
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post("/masters", async (req, res) => {
  try {
    const { name, email, password, level } = req.body || {};
    if (!email?.trim() || !name?.trim()) return res.status(400).json({ error: "Informe nome e e-mail." });
    if (password && String(password).length < 6) return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres." });
    const user = await createAuthUser({ email: email.trim().toLowerCase(), password: password || undefined });
    const { data: me } = await supabase.from("profiles").select("account_id").eq("id", req.userId).maybeSingle();
    await createProfile({ userId: user.id, accountId: me?.account_id, role: "owner", name: name.trim(), isSuperAdmin: true });
    await supabase.from("profiles").update({ admin_level: level === "support" ? "support" : "master" }).eq("id", user.id);
    res.status(201).json({ id: user.id, invited: !password });
  } catch (err) {
    res.status(400).json({ error: /already|registered|exists/i.test(err.message) ? "Já existe um usuário com esse e-mail." : err.message });
  }
});
router.patch("/masters/:id", async (req, res) => {
  try {
    if (req.params.id === req.userId) return res.status(400).json({ error: "Você não pode alterar o seu próprio nível." });
    const patch = {};
    if (req.body?.level) patch.admin_level = req.body.level === "support" ? "support" : "master";
    if (req.body?.name) patch.name = String(req.body.name).trim();
    const { error } = await supabase.from("profiles").update(patch).eq("id", req.params.id).eq("is_super_admin", true);
    if (error) throw error;
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.delete("/masters/:id", async (req, res) => {
  try {
    if (req.params.id === req.userId) return res.status(400).json({ error: "Você não pode remover o seu próprio acesso." });
    const { error } = await supabase.from("profiles").update({ is_super_admin: false, admin_level: null }).eq("id", req.params.id);
    if (error) throw error;
    await supabase.auth.admin.updateUserById(req.params.id, { ban_duration: "876000h" }).catch(() => {});
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Boleto anexado manualmente na cobrança → fica no Financeiro da empresa e vai por e-mail
router.post("/invoices/:id/boleto", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Envie o arquivo do boleto." });
    const { data: inv, error } = await supabase.from("invoices").select("*, accounts(name, contact_email, contact_name)").eq("id", req.params.id).maybeSingle();
    if (error || !inv) return res.status(404).json({ error: "Cobrança não encontrada." });
    const ext = (req.file.originalname.split(".").pop() || "pdf").toLowerCase().slice(0, 6);
    const url = await uploadMedia({ accountId: inv.account_id, buffer: req.file.buffer, extension: ext, contentType: req.file.mimetype || "application/pdf" });
    const { error: upErr } = await supabase.from("invoices").update({ boleto_url: url }).eq("id", inv.id);
    if (upErr) throw new Error(/boleto_url/.test(upErr.message) ? "Rode a migration 024 no Supabase." : upErr.message);
    let emailed = false;
    if (req.body?.send !== "false" && inv.accounts?.contact_email && emailConfigured()) {
      const due = inv.due_date ? inv.due_date.split("-").reverse().join("/") : "";
      emailed = await sendMail({
        to: inv.accounts.contact_email, name: inv.accounts.contact_name || inv.accounts.name, label: "Fatura disponível",
        subject: `Sua fatura Helora ${inv.reference || ""} está disponível`, title: "Seu boleto chegou",
        message: `A fatura de ${inv.reference || "este mês"} de ${Number(inv.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${due ? `, com vencimento em ${due},` : ""} está disponível.`,
        buttonText: "Baixar boleto", buttonLink: url, note: "O boleto também fica em Financeiro, dentro do sistema."
      }).then(() => true).catch(() => false);
    }
    res.json({ url, emailed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
