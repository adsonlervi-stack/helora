// Textos de todos os e-mails automáticos da Helora (enviados pelo modelo padrão do EmailJS).
import { sendMail, sendTemplate, appUrl } from "./email.js";

const num = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
const first = (n) => String(n || "").trim().split(" ")[0];
const safe = (p) => p.catch((e) => console.error("[E-mail]", e.response?.data || e.message));

export const mailWelcomeCompany = ({ to, name, company }) =>
  safe(sendTemplate("welcome", to, { nome: first(name) || "tudo bem", empresa: company, email: to, link: appUrl() }));


export const mailWelcomeUser = ({ to, name, company }) =>
  safe(sendTemplate("welcome", to, { nome: first(name) || "tudo bem", empresa: company, email: to, link: appUrl() }));


export const mailInvoiceAvailable = ({ to, name, company, amount, dueDate, reference, plan, link }) =>
  safe(sendTemplate("invoice", to, {
    nome: first(name) || "tudo bem", empresa: company, referencia: reference || "este mês", plano: plan || "Helora",
    valor: num(amount), vencimento: dt(dueDate), link_pagamento: link || `${appUrl()}/?secao=financeiro`
  }));


export const mailInvoiceReminder = ({ to, name, company, amount, dueDate, link, when = "amanhã" }) =>
  safe(sendTemplate("reminder", to, {
    nome: first(name) || "tudo bem", empresa: company, quando: when, valor: num(amount), vencimento: dt(dueDate),
    link_pagamento: link || `${appUrl()}/?secao=financeiro`
  }));


export const mailAccountBlocked = ({ to, name, company, amount, dueDate }) =>
  safe(sendMail({
    to, name,
    label: "Acesso bloqueado",
    subject: "Acesso ao Helora bloqueado por falta de pagamento",
    title: "Seu acesso foi bloqueado temporariamente",
    message:
      `Olá${name ? `, ${first(name)}` : ""}. Não identificamos o pagamento da fatura da ${company} ` +
      `(${brl(amount)}, vencida em ${dt(dueDate)}), por isso o painel foi bloqueado.\n\n` +
      `Assim que o PIX for pago, o acesso volta sozinho em poucos minutos. O WhatsApp da empresa continua conectado.`,
    buttonText: "Pagar e liberar acesso",
    buttonLink: `${appUrl()}/?secao=financeiro`
  }));

export const mailPaymentConfirmed = ({ to, name, company, amount, reference }) =>
  safe(sendMail({
    to, name,
    label: "Pagamento confirmado",
    subject: `Pagamento recebido – Helora ${reference}`,
    title: "Recebemos seu pagamento ✅",
    message: `Obrigado${name ? `, ${first(name)}` : ""}! O pagamento de ${brl(amount)} da ${company} (${reference}) foi confirmado.`,
    buttonText: "Ver no Financeiro",
    buttonLink: `${appUrl()}/?secao=financeiro`
  }));
