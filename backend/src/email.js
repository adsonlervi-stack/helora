/**
 * E-mails via EmailJS (API REST, chamada pelo servidor).
 * Variáveis no Railway (serviço backend):
 *   EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY,
 *   EMAILJS_TEMPLATE_RESET   (recuperar senha)
 *   EMAILJS_TEMPLATE_NOTICE  (comunicados / avisos)
 * No painel do EmailJS: Account → Security → marcar "Allow EmailJS API for non-browser applications".
 */
import axios from "axios";

export const emailConfigured = () =>
  !!(process.env.EMAILJS_SERVICE_ID && process.env.EMAILJS_PUBLIC_KEY && process.env.EMAILJS_PRIVATE_KEY);

export async function sendEmail(templateEnvVar, params) {
  const templateId = process.env[templateEnvVar];
  if (!emailConfigured() || !templateId) {
    throw new Error("E-mail ainda não configurado (EmailJS). Defina as variáveis EMAILJS_* no backend.");
  }
  await axios.post(
    "https://api.emailjs.com/api/v1.0/email/send",
    {
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: { app_name: "Helora", app_url: (process.env.FRONTEND_ORIGIN || "").split(",")[0], year: new Date().getFullYear(), ...params }
    },
    { timeout: 15000 }
  );
}
