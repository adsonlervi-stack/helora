// E-mail da própria empresa: ler a caixa de entrada (IMAP) para o cérebro
// e enviar e-mails pelo endereço da empresa (SMTP) — ex.: convite de reunião.
import { getIntegration } from "./store.js";
import { addDoc } from "./brain.js";

/** Servidores conhecidos — a empresa só digita e-mail e senha de app. */
export function mailPreset(email) {
  const d = String(email || "").split("@")[1]?.toLowerCase() || "";
  if (/gmail\.com$|googlemail\.com$/.test(d)) return { imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 465, note: "Gmail: use uma senha de app (Conta Google → Segurança → Senhas de app)." };
  if (/outlook\.|hotmail\.|live\.|msn\./.test(d)) return { imapHost: "outlook.office365.com", imapPort: 993, smtpHost: "smtp.office365.com", smtpPort: 587 };
  if (/yahoo\./.test(d)) return { imapHost: "imap.mail.yahoo.com", imapPort: 993, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465 };
  if (/icloud\.com$|me\.com$/.test(d)) return { imapHost: "imap.mail.me.com", imapPort: 993, smtpHost: "smtp.mail.me.com", smtpPort: 587 };
  if (/uol\.com\.br$/.test(d)) return { imapHost: "imap.uol.com.br", imapPort: 993, smtpHost: "smtps.uol.com.br", smtpPort: 465 };
  return null;
}

const cfgFull = (c) => {
  const p = mailPreset(c.email) || {};
  return {
    email: c.email, password: c.password,
    imapHost: c.imapHost || p.imapHost, imapPort: Number(c.imapPort || p.imapPort || 993),
    smtpHost: c.smtpHost || p.smtpHost, smtpPort: Number(c.smtpPort || p.smtpPort || 465),
    fromName: c.fromName || ""
  };
};

async function imapClient(c) {
  const { ImapFlow } = await import("imapflow");
  return new ImapFlow({ host: c.imapHost, port: c.imapPort, secure: c.imapPort === 993, auth: { user: c.email, pass: c.password }, logger: false, socketTimeout: 30000 });
}
async function smtpTransport(c) {
  const nodemailer = (await import("nodemailer")).default;
  return nodemailer.createTransport({ host: c.smtpHost, port: c.smtpPort, secure: c.smtpPort === 465, auth: { user: c.email, pass: c.password }, connectionTimeout: 20000 });
}

/** Testa o login no IMAP e no SMTP antes de salvar. */
export async function testMail(raw) {
  const c = cfgFull(raw);
  if (!c.email || !c.password) throw new Error("Informe o e-mail e a senha.");
  if (!c.imapHost || !c.smtpHost) throw new Error("Não reconheci o provedor deste e-mail. Preencha os servidores IMAP e SMTP (o seu provedor informa).");
  const imap = await imapClient(c);
  try { await imap.connect(); } catch (e) { throw new Error(`Não consegui entrar na caixa de entrada (IMAP): ${e.responseText || e.message}. Confira a senha${mailPreset(c.email)?.note ? ` — ${mailPreset(c.email).note}` : ""}.`); }
  await imap.logout().catch(() => {});
  const t = await smtpTransport(c);
  try { await t.verify(); } catch (e) { throw new Error(`Login de envio (SMTP) falhou: ${e.message}`); }
  return c;
}

/** Copia os últimos e-mails da caixa de entrada para o cérebro. */
export async function syncMail(accountId, { limit = 40 } = {}) {
  const it = await getIntegration(accountId, "email");
  if (!it?.config?.email) throw new Error("Conecte o e-mail na aba Conexões.");
  const c = cfgFull(it.config);
  const { simpleParser } = await import("mailparser");
  const imap = await imapClient(c);
  await imap.connect();
  let added = 0;
  try {
    const lock = await imap.getMailboxLock("INBOX");
    try {
      const total = imap.mailbox.exists || 0;
      if (!total) return { added: 0 };
      const from = Math.max(1, total - Math.min(200, limit) + 1);
      for await (const msg of imap.fetch(`${from}:*`, { source: true, envelope: true })) {
        try {
          const m = await simpleParser(msg.source);
          const body = String(m.text || "").replace(/\n{3,}/g, "\n\n").trim();
          if (!body) continue;
          const ref = m.messageId || `${msg.uid}@${c.email}`;
          await addDoc(accountId, {
            source: "email", ref, title: m.subject || "(sem assunto)",
            content: `De: ${m.from?.text || ""}\nPara: ${m.to?.text || ""}\nData: ${m.date ? m.date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : ""}\nAssunto: ${m.subject || ""}\n\n${body.slice(0, 20000)}`,
            meta: { from: m.from?.text || "", date: m.date || null }
          });
          added++;
        } catch {}
      }
    } finally { lock.release(); }
  } finally { await imap.logout().catch(() => {}); }
  return { added };
}

/** Envia pelo e-mail da empresa. Devolve false se a empresa não conectou e-mail. */
export async function sendCompanyMail(accountId, { to, subject, text, html, attachments }) {
  const it = await getIntegration(accountId, "email");
  if (!it?.config?.email || !it?.config?.password) return false;
  const c = cfgFull(it.config);
  const t = await smtpTransport(c);
  await t.sendMail({ from: c.fromName ? `"${c.fromName}" <${c.email}>` : c.email, to, subject, text, html, attachments });
  return true;
}
