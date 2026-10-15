// Cobranças via Asaas (PIX). Chave em ASAAS_API_KEY (Railway). Ambiente: produção, ou
// sandbox se ASAAS_SANDBOX=1. Webhook: POST /webhook/asaas com o token ASAAS_WEBHOOK_TOKEN.
import axios from "axios";

const base = () => (process.env.ASAAS_SANDBOX === "1" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3");
export const asaasConfigured = () => !!process.env.ASAAS_API_KEY;

const api = () =>
  axios.create({
    baseURL: base(),
    timeout: 20000,
    headers: { access_token: process.env.ASAAS_API_KEY, "Content-Type": "application/json", "User-Agent": "Helora" }
  });

const err = (e) => {
  const d = e.response?.data;
  const msg = d?.errors?.map((x) => x.description).join(" ") || e.message;
  return new Error(`Asaas: ${msg}`);
};

/** Cliente no Asaas para a empresa (cria se ainda não existir). */
export async function ensureCustomer({ customerId, name, cpfCnpj, email, phone, externalReference }) {
  if (customerId) return customerId;
  const doc = String(cpfCnpj || "").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) throw new Error("Cadastre o CNPJ/CPF da empresa (Gestão → Empresas → Comercial) para gerar a cobrança.");
  try {
    const { data } = await api().post("/customers", {
      name,
      cpfCnpj: doc,
      email: email || undefined,
      mobilePhone: phone ? String(phone).replace(/\D/g, "").replace(/^55/, "") : undefined,
      externalReference,
      notificationDisabled: true // os avisos saem pelos e-mails da Helora
    });
    return data.id;
  } catch (e) {
    throw err(e);
  }
}

/** Cobrança PIX. Retorna { id, invoiceUrl }. */
export async function createPixPayment({ customer, value, dueDate, description, externalReference }) {
  try {
    const { data } = await api().post("/payments", { customer, billingType: "PIX", value: Number(value), dueDate, description, externalReference });
    return { id: data.id, invoiceUrl: data.invoiceUrl, status: data.status };
  } catch (e) {
    throw err(e);
  }
}

/** QR Code + "copia e cola". */
export async function getPixQrCode(paymentId) {
  try {
    const { data } = await api().get(`/payments/${paymentId}/pixQrCode`);
    return { image: data.encodedImage, payload: data.payload, expiresAt: data.expirationDate };
  } catch (e) {
    throw err(e);
  }
}

export async function getPayment(paymentId) {
  try {
    const { data } = await api().get(`/payments/${paymentId}`);
    return data;
  } catch (e) {
    throw err(e);
  }
}
