/**
 * E-mails via EmailJS (API REST, chamada pelo servidor).
 * Um único modelo no EmailJS ("Helora padrão") serve para TODOS os e-mails:
 * o servidor manda assunto, título, texto e botão prontos.
 *
 * Variáveis no Railway (backend):
 *   EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY
 *   EMAILJS_TEMPLATE_DEFAULT  (modelo padrão — obrigatório)
 *   EMAILJS_TEMPLATE_RESET / EMAILJS_TEMPLATE_NOTICE (opcionais, modelos antigos)
 * No EmailJS: Account → Security → marcar "Allow EmailJS API for non-browser applications".
 */
import axios from "axios";

export const appUrl = () => (process.env.FRONTEND_ORIGIN || "").split(",")[0].replace(/\/$/, "");
export const emailConfigured = () =>
  !!(process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_PUBLIC_KEY && process.env.EMAILJS_PRIVATE_KEY &&
    (process.env.EMAILJS_TEMPLATE_DEFAULT || process.env.EMAILJS_TEMPLATE_NOTICE));

async function post(templateId, params) {
  await axios.post(
    "https://api.emailjs.com/api/v1.0/email/send",
    {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: { app_name: "Helora", app_url: appUrl(), year: new Date().getFullYear(), ...params }
    },
    { timeout: 15000 }
  );
}

/** Compatibilidade: modelos antigos (RESET / NOTICE). Sem eles, usa o modelo padrão. */
export async function sendEmail(templateEnvVar, params) {
  const specific = process.env[templateEnvVar];
  if (specific) return post(specific, params);
  if (templateEnvVar === "EMAILJS_TEMPLATE_RESET")
    return sendMail({
      to: params.to_email, name: params.to_name, subject: "Redefinir sua senha – Helora", title: "Redefinir sua senha",
      message: "Recebemos um pedido para redefinir a sua senha. Toque no botão abaixo para criar uma nova. O link vale por 1 hora.",
      buttonText: "Criar nova senha", buttonLink: params.reset_link, note: "Não foi você? Pode ignorar este e-mail — sua senha continua a mesma."
    });
  return sendMail({
    to: params.to_email, name: params.to_name, subject: params.title, title: params.title, message: params.message,
    buttonText: params.button_text || "Abrir o Helora", buttonLink: params.link || appUrl(), label: "Comunicado"
  });
}

/** E-mail no modelo padrão. */
export async function sendMail({ to, name, subject, title, message, buttonText, buttonLink, note, label }) {
  const templateId = process.env.EMAILJS_TEMPLATE_DEFAULT || process.env.EMAILJS_TEMPLATE_NOTICE;
  if (!emailConfigured() || !templateId || !to) {
    console.warn(`[E-mail] não enviado (EmailJS não configurado): ${subject} → ${to}`);
    return false;
  }
  await post(templateId, {
    to_email: to,
    to_name: name || "",
    subject: subject || title,
    label: label || "",
    title,
    message,
    button_text: buttonText || "Abrir o Helora",
    button_link: buttonLink || appUrl(),
    link: buttonLink || appUrl(),
    note: note || ""
  });
  return true;
}
