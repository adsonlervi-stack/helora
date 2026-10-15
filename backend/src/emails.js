// Textos de todos os e-mails automáticos da Helora (enviados pelo modelo padrão do EmailJS).
import { sendMail, appUrl } from "./email.js";

const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
const first = (n) => String(n || "").trim().split(" ")[0];
const safe = (p) => p.catch((e) => console.error("[E-mail]", e.response?.data || e.message));

export const mailWelcomeCompany = ({ to, name, company, password }) =>
  safe(sendMail({
    to, name,
    label: "Bem-vindo",
    subject: `Bem-vindo ao Helora, ${company}!`,
    title: `Sua empresa já está no Helora 🎉`,
    message:
      `Olá${name ? `, ${first(name)}` : ""}! A conta da ${company} foi criada.\n\n` +
      `Primeiros passos:\n1. Entre no painel com este e-mail${password ? " e a senha que você recebeu" : ""}.\n` +
      `2. Em Canais, conecte o WhatsApp da empresa (leva 1 minuto).\n3. Em Configurações → Equipe, cadastre seus atendentes.\n\n` +
      `Qualquer dúvida, fale com a gente pelo botão Ajuda dentro do painel.`,
    buttonText: "Entrar no Helora",
    buttonLink: appUrl()
  }));

export const mailWelcomeUser = ({ to, name, company, invitedBy }) =>
  safe(sendMail({
    to, name,
    label: "Bem-vindo",
    subject: `Seu acesso ao Helora da ${company}`,
    title: `Você foi adicionado à equipe da ${company}`,
    message:
      `Olá${name ? `, ${first(name)}` : ""}! ${invitedBy ? `${invitedBy} criou` : "Foi criado"} o seu acesso ao Helora, ` +
      `o sistema de atendimento por WhatsApp da ${company}.\n\nEntre com este e-mail e a senha que o gestor te passou. ` +
      `Se não souber a senha, use "Esqueci minha senha" na tela de login.`,
    buttonText: "Acessar o painel",
    buttonLink: appUrl()
  }));

export const mailInvoiceAvailable = ({ to, name, company, amount, dueDate, reference }) =>
  safe(sendMail({
    to, name,
    label: "Fatura",
    subject: `Sua fatura Helora (${reference}) já está disponível`,
    title: "Sua fatura já está disponível para pagamento",
    message:
      `Olá${name ? `, ${first(name)}` : ""}! A fatura de ${reference} da ${company} já está disponível.\n\n` +
      `Valor: ${brl(amount)}\nVencimento: ${dt(dueDate)}\nForma de pagamento: PIX\n\n` +
      `Pague direto no painel, em Financeiro → Pagar com PIX (QR Code ou copia e cola). A confirmação é automática.`,
    buttonText: "Pagar com PIX",
    buttonLink: `${appUrl()}/?secao=financeiro`
  }));

export const mailInvoiceReminder = ({ to, name, company, amount, dueDate }) =>
  safe(sendMail({
    to, name,
    label: "Lembrete",
    subject: "Lembrete: sua fatura Helora vence amanhã",
    title: `Sua fatura vence amanhã (${dt(dueDate)})`,
    message:
      `Olá${name ? `, ${first(name)}` : ""}! Passando para lembrar que a fatura da ${company}, no valor de ${brl(amount)}, ` +
      `vence amanhã, dia ${dt(dueDate)}.\n\nSe já pagou, pode ignorar este aviso. ` +
      `Para evitar o bloqueio do sistema, o pagamento precisa ser feito em até 2 dias após o vencimento.`,
    buttonText: "Pagar com PIX",
    buttonLink: `${appUrl()}/?secao=financeiro`
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
