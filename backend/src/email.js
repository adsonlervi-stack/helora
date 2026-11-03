/**
 * E-mails via EmailJS (API REST, chamada pelo servidor).
 * Modelos no EmailJS: comunicado (genérico), boas_vindas, recuperar_senha, cobranca, lembrete_vencimento, suporte_aguardando.
 * Variáveis no Railway (backend): EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY
 * Opcional: SUPPORT_ALERT_EMAIL (destino do aviso de suporte) e SUPPORT_ALERT_MINUTES (padrão 10).
 * No EmailJS: Account → Security → "Allow EmailJS API for non-browser applications".
 */
import axios from "axios";

export const appUrl = () => (process.env.FRONTEND_ORIGIN || "").split(",")[0].replace(/\/$/, "");
export const emailConfigured = () =>
  !!(process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_PUBLIC_KEY && process.env.EMAILJS_PRIVATE_KEY);

/** Modelos cadastrados no EmailJS (IDs fixos). Dá para trocar por variável EMAILJS_TPL_<NOME>. */
const TEMPLATES = {
  default: "comunicado",
  welcome: "boas_vindas",
  reset: "recuperar_senha",
  invoice: "cobranca",
  reminder: "lembrete_vencimento",
  support: "suporte_aguardando"
};
const templateId = (kind) =>
  process.env[`EMAILJS_TPL_${kind.toUpperCase()}`] || TEMPLATES[kind];

async function post(id, params) {
  await axios.post(
    "https://api.emailjs.com/api/v1.0/email/send",
    {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: id,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: { app_name: "Helora", app_url: appUrl(), year: new Date().getFullYear(), ...params }
    },
    { timeout: 15000 }
  );
}

/** Envia um dos modelos próprios (boas-vindas, cobrança, lembrete, senha, suporte). */
export async function sendTemplate(kind, to, params = {}) {
  if (!emailConfigured() || !to) {
    console.warn(`[E-mail] não enviado (EmailJS não configurado): ${kind} → ${to}`);
    return false;
  }
  await post(templateId(kind), { to_email: to, link: appUrl(), ...params });
  return true;
}

/** Compatibilidade com chamadas antigas. */
export async function sendEmail(templateEnvVar, params) {
  if (templateEnvVar === "EMAILJS_TEMPLATE_RESET")
    return sendTemplate("reset", params.to_email, { nome: params.to_name || "", link: params.reset_link });
  return sendMail({
    to: params.to_email, name: params.to_name, subject: params.title, title: params.title, message: params.message,
    buttonText: params.button_text || "Abrir o Helora", buttonLink: params.link || appUrl(), label: "Comunicado"
  });
}

/** E-mail genérico no modelo "comunicado" (título, texto e botão livres). */
export async function sendMail({ to, name, subject, title, message, buttonText, buttonLink, note, label }) {
  const text = [message, note].filter(Boolean).join("\n\n");
  return sendTemplate("default", to, {
    nome: String(name || "").trim().split(" ")[0] || "tudo bem",
    titulo: title || subject,
    assunto: subject || title,
    mensagem: text,
    rotulo: label || "Comunicado",
    botao: buttonText || "Abrir o Helora",
    link: buttonLink || appUrl()
  });
}
