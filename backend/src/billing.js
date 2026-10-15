// Cobrança automática da mensalidade (PIX via Asaas) + e-mails + bloqueio.
//  - Gera a fatura do mês BILLING_DAYS_BEFORE dias antes do vencimento (padrão 10) e avisa por e-mail.
//  - 1 dia antes do vencimento: lembrete.
//  - 2 dias após o vencimento sem pagamento: bloqueia o painel da empresa (status suspended, motivo "billing").
//  - Pagamento confirmado (webhook do Asaas): marca paga e libera na hora.
import { supabase, listUserEmails } from "./config/db.js";
import { asaasConfigured, ensureCustomer, createPixPayment, getPixQrCode } from "./asaas.js";
import { mailInvoiceAvailable, mailInvoiceReminder, mailAccountBlocked, mailPaymentConfirmed } from "./emails.js";

const DAYS_BEFORE = () => parseInt(process.env.BILLING_DAYS_BEFORE || "10", 10);
const GRACE_DAYS = 2;
const iso = (d) => d.toISOString().slice(0, 10);
const todayBR = () => iso(new Date(Date.now() - 3 * 3600 * 1000));
const addDays = (s, n) => iso(new Date(new Date(`${s}T12:00:00Z`).getTime() + n * 86400000));

async function billingContacts(account) {
  const owners = await listUserEmails({ accountId: account.id, onlyOwners: true }).catch(() => []);
  const list = [...owners];
  if (account.contact_email && !list.some((o) => o.email === account.contact_email)) list.unshift({ email: account.contact_email, name: account.contact_name });
  return list;
}

/** Garante a cobrança PIX no Asaas para uma fatura (cria cliente e cobrança se faltar). */
export async function ensureAsaasCharge(invoiceId) {
  if (!asaasConfigured()) throw new Error("Asaas não configurado (ASAAS_API_KEY no Railway).");
  const { data: inv, error } = await supabase.from("invoices").select("*, accounts(*)").eq("id", invoiceId).single();
  if (error) throw error;
  if (inv.asaas_payment_id) return inv;
  const acc = inv.accounts;
  const owners = await billingContacts(acc);
  const customer = await ensureCustomer({
    customerId: acc.asaas_customer_id,
    name: acc.name,
    cpfCnpj: acc.document,
    email: owners[0]?.email,
    phone: acc.contact_phone,
    externalReference: acc.id
  });
  if (customer !== acc.asaas_customer_id) await supabase.from("accounts").update({ asaas_customer_id: customer }).eq("id", acc.id);
  const pay = await createPixPayment({
    customer,
    value: inv.amount,
    dueDate: inv.due_date,
    description: `Helora – mensalidade ${inv.reference} (${acc.name})`,
    externalReference: inv.id
  });
  const { data: upd } = await supabase
    .from("invoices")
    .update({ asaas_payment_id: pay.id, invoice_url: pay.invoiceUrl, payment_method: "pix" })
    .eq("id", inv.id)
    .select("*, accounts(*)")
    .single();
  return upd;
}

export async function getInvoicePix(accountId, invoiceId) {
  const { data: inv } = await supabase.from("invoices").select("id, account_id, status").eq("id", invoiceId).maybeSingle();
  if (!inv || inv.account_id !== accountId) throw new Error("Fatura não encontrada.");
  if (inv.status !== "pending") throw new Error("Esta fatura não está em aberto.");
  const full = await ensureAsaasCharge(invoiceId);
  const qr = await getPixQrCode(full.asaas_payment_id);
  return { ...qr, invoiceUrl: full.invoice_url, amount: Number(full.amount), dueDate: full.due_date };
}

/** Rodada diária (o servidor chama de hora em hora; cada etapa só age uma vez por fatura). */
export async function runBillingCycle() {
  const today = todayBR();
  const log = [];

  // 1) Gera as faturas que vencem nos próximos N dias
  const { data: accounts } = await supabase.from("accounts").select("*").in("status", ["active", "suspended"]).gt("monthly_price", 0);
  for (const a of accounts || []) {
    const due = nextDueDate(a.due_day || 10, today);
    if (due > addDays(today, DAYS_BEFORE())) continue;
    const reference = due.slice(0, 7);
    const { data: exists } = await supabase.from("invoices").select("id").eq("account_id", a.id).eq("reference", reference).maybeSingle();
    if (exists) continue;
    const { data: created, error } = await supabase
      .from("invoices")
      .insert({ account_id: a.id, reference, amount: a.monthly_price, due_date: due })
      .select()
      .single();
    if (!error) log.push(`fatura ${reference} criada para ${a.name}`);
    void created;
  }

  // 2) Faturas em aberto: cobrança PIX + e-mail "disponível", lembrete na véspera, bloqueio após 2 dias
  const { data: open } = await supabase.from("invoices").select("*, accounts(*)").eq("status", "pending");
  for (const inv of open || []) {
    const acc = inv.accounts;
    if (!acc) continue;
    const contacts = await billingContacts(acc);
    try {
      if (!inv.available_sent_at && inv.due_date >= today) {
        if (asaasConfigured() && !inv.asaas_payment_id) await ensureAsaasCharge(inv.id).catch((e) => log.push(`${acc.name}: ${e.message}`));
        for (const c of contacts) await mailInvoiceAvailable({ to: c.email, name: c.name, company: acc.name, amount: inv.amount, dueDate: inv.due_date, reference: inv.reference });
        await supabase.from("invoices").update({ available_sent_at: new Date().toISOString() }).eq("id", inv.id);
        log.push(`aviso de fatura enviado: ${acc.name}`);
      }
      if (!inv.reminder_sent_at && inv.due_date === addDays(today, 1)) {
        for (const c of contacts) await mailInvoiceReminder({ to: c.email, name: c.name, company: acc.name, amount: inv.amount, dueDate: inv.due_date });
        await supabase.from("invoices").update({ reminder_sent_at: new Date().toISOString() }).eq("id", inv.id);
        log.push(`lembrete enviado: ${acc.name}`);
      }
      if (today > addDays(inv.due_date, GRACE_DAYS - 1) && acc.status === "active") {
        await supabase.from("accounts").update({ status: "suspended", blocked_reason: "billing" }).eq("id", acc.id);
        for (const c of contacts) await mailAccountBlocked({ to: c.email, name: c.name, company: acc.name, amount: inv.amount, dueDate: inv.due_date });
        log.push(`bloqueada por falta de pagamento: ${acc.name}`);
      }
    } catch (e) {
      log.push(`${acc.name}: ${e.message}`);
    }
  }
  if (log.length) console.log("[Cobrança]", log.join(" | "));
  return log;
}

function nextDueDate(day, today) {
  const [y, m] = today.split("-").map(Number);
  const d = Math.min(28, Math.max(1, day));
  const thisMonth = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (thisMonth >= today) return thisMonth;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Pagamento confirmado (webhook do Asaas ou baixa manual). Libera a empresa se não houver outra em atraso. */
export async function markInvoicePaid(invoiceId, { method = "pix" } = {}) {
  const { data: inv } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_method: method })
    .eq("id", invoiceId)
    .neq("status", "paid")
    .select("*, accounts(*)")
    .maybeSingle();
  if (!inv) return null;
  const acc = inv.accounts;
  const today = todayBR();
  const { data: stillLate } = await supabase
    .from("invoices")
    .select("id")
    .eq("account_id", acc.id)
    .eq("status", "pending")
    .lt("due_date", addDays(today, -(GRACE_DAYS - 1)));
  if (acc.status === "suspended" && acc.blocked_reason === "billing" && !stillLate?.length) {
    await supabase.from("accounts").update({ status: "active", blocked_reason: null }).eq("id", acc.id);
  }
  for (const c of await billingContacts(acc)) await mailPaymentConfirmed({ to: c.email, name: c.name, company: acc.name, amount: inv.amount, reference: inv.reference });
  return inv;
}

export function startBillingScheduler() {
  const tick = () => runBillingCycle().catch((e) => console.error("[Cobrança]", e.message));
  setTimeout(tick, 60 * 1000);
  setInterval(tick, 60 * 60 * 1000);
}
