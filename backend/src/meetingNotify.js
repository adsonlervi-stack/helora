// Reunião agendada no CRM → avisa o cliente (WhatsApp e/ou e-mail com convite .ics) e manda lembretes.
import { supabase } from "./config/db.js";
import { leadConversation } from "./routes/crm.js";
import { sendTextToConversation } from "./messaging.js";
import { sendCompanyMail } from "./integrations/mail.js";
import { sendMail } from "./email.js";

const TZ = "America/Sao_Paulo";
const fmtDay = (d) => new Date(d).toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long" });
const fmtTime = (d) => new Date(d).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEsc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);

export function buildIcs({ uid, title, startsAt, endsAt, description, location, organizerEmail, organizerName, attendeeEmail }) {
  const end = endsAt || new Date(new Date(startsAt).getTime() + 60 * 60000).toISOString();
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Helora//Agenda//PT", "METHOD:REQUEST", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${uid}@helora`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(startsAt)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEsc(title)}`, description ? `DESCRIPTION:${icsEsc(description)}` : null, location ? `LOCATION:${icsEsc(location)}` : null,
    organizerEmail ? `ORGANIZER;CN=${icsEsc(organizerName || organizerEmail)}:mailto:${organizerEmail}` : null,
    attendeeEmail ? `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendeeEmail}` : null,
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Lembrete", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");
}
const gcalLink = ({ title, startsAt, endsAt, details }) => {
  const end = endsAt || new Date(new Date(startsAt).getTime() + 60 * 60000).toISOString();
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${icsDate(startsAt)}/${icsDate(end)}`, details: details || "" })}`;
};

async function loadAll(accountId, eventId) {
  const { data: ev } = await supabase.from("crm_events").select("*").eq("account_id", accountId).eq("id", eventId).maybeSingle();
  if (!ev?.lead_id) return {};
  const [{ data: lead }, { data: acc }] = await Promise.all([
    supabase.from("crm_leads").select("*").eq("id", ev.lead_id).maybeSingle(),
    supabase.from("accounts").select("name").eq("id", accountId).maybeSingle()
  ]);
  return { ev, lead, company: acc?.name || "" };
}

/** Envia a confirmação da reunião ao cliente. channels: { whatsapp, email }. Devolve o que foi enviado. */
export async function notifyMeeting(accountId, eventId, channels = {}, byName = null) {
  const { ev, lead, company } = await loadAll(accountId, eventId);
  if (!ev || !lead) throw new Error("A reunião precisa estar ligada a um cliente do CRM.");
  const first = String(lead.name || "").split(" ")[0] || "";
  const when = `${fmtDay(ev.starts_at)}, às ${fmtTime(ev.starts_at)}`;
  const link = ev.meet_link ? `\n🔗 Link da reunião: ${ev.meet_link}` : "";
  const result = { whatsapp: null, email: null };
  if (channels.whatsapp) {
    try {
      const conv = await leadConversation(accountId, lead);
      const text = `Olá${first ? `, ${first}` : ""}! 👋\n\nSua *${ev.title}*${company ? ` com a ${company}` : ""} está confirmada:\n📅 ${when.charAt(0).toUpperCase() + when.slice(1)}${link}${ev.notes ? `\n\n${ev.notes}` : ""}\n\nSe precisar remarcar, é só responder esta mensagem.`;
      await sendTextToConversation(accountId, conv, text, { senderName: byName || null });
      result.whatsapp = "enviado";
    } catch (err) { result.whatsapp = `erro: ${err.message}`; }
  }
  if (channels.email) {
    if (!lead.email) result.email = "erro: o cliente não tem e-mail no card";
    else {
      const subject = `Convite: ${ev.title}${company ? ` · ${company}` : ""} — ${new Date(ev.starts_at).toLocaleDateString("pt-BR", { timeZone: TZ })} ${fmtTime(ev.starts_at)}`;
      const body = `Olá${first ? `, ${first}` : ""}!\n\nSua ${ev.title}${company ? ` com a ${company}` : ""} está agendada para ${when}.${ev.meet_link ? `\n\nLink da reunião: ${ev.meet_link}` : ""}${ev.notes ? `\n\n${ev.notes}` : ""}\n\nO convite está em anexo — abra para adicionar à sua agenda.`;
      try {
        const ics = buildIcs({ uid: ev.id, title: `${ev.title}${company ? ` · ${company}` : ""}`, startsAt: ev.starts_at, endsAt: ev.ends_at, description: body, location: ev.meet_link || "", attendeeEmail: lead.email });
        const sent = await sendCompanyMail(accountId, { to: lead.email, subject, text: body, attachments: [{ filename: "convite.ics", content: ics, contentType: "text/calendar; charset=utf-8; method=REQUEST" }], icalEvent: undefined });
        if (sent) result.email = "enviado";
        else {
          const ok = await sendMail({ to: lead.email, name: lead.name, label: "Reunião", subject, title: ev.title, message: body.replace("O convite está em anexo — abra para adicionar à sua agenda.", "Toque no botão para adicionar à sua agenda."), buttonText: "Adicionar à agenda", buttonLink: gcalLink({ title: ev.title, startsAt: ev.starts_at, endsAt: ev.ends_at, details: ev.meet_link || "" }) });
          result.email = ok === false ? "erro: conecte o e-mail da empresa na aba Conexões" : "enviado";
        }
      } catch (err) { result.email = `erro: ${err.message}`; }
    }
  }
  const notify = { ...(ev.notify || {}), ...(channels.reminders !== undefined ? { reminders: !!channels.reminders } : {}), sent: { ...(ev.notify?.sent || {}), ...Object.fromEntries(Object.entries(result).filter(([, v]) => v === "enviado").map(([k]) => [k, new Date().toISOString()])) } };
  await supabase.from("crm_events").update({ notify }).eq("id", ev.id).then(() => {}, () => {});
  return result;
}

/** Lembretes pelo WhatsApp: 1 dia antes e 1 hora antes (só reuniões com lembrete ligado). */
export async function runMeetingReminders() {
  try {
    const now = Date.now();
    const { data } = await supabase.from("crm_events").select("id, account_id, lead_id, title, starts_at, meet_link, notify, done")
      .eq("done", false).gte("starts_at", new Date(now).toISOString()).lte("starts_at", new Date(now + 26 * 3600000).toISOString()).limit(500);
    for (const ev of data || []) {
      const n = ev.notify || {};
      if (!n.reminders || !ev.lead_id) continue;
      const mins = (new Date(ev.starts_at).getTime() - now) / 60000;
      const key = mins <= 75 ? "r1h" : mins <= 25 * 60 && mins >= 20 * 60 ? "r24h" : null;
      if (!key || n[key]) continue;
      try {
        const { data: lead } = await supabase.from("crm_leads").select("*").eq("id", ev.lead_id).maybeSingle();
        if (!lead?.phone) continue;
        const conv = await leadConversation(ev.account_id, lead);
        const first = String(lead.name || "").split(" ")[0] || "";
        const text = key === "r1h"
          ? `Oi${first ? `, ${first}` : ""}! ⏰ Lembrete: sua *${ev.title}* começa às ${fmtTime(ev.starts_at)}.${ev.meet_link ? `\n🔗 ${ev.meet_link}` : ""}`
          : `Oi${first ? `, ${first}` : ""}! 📅 Passando para lembrar da sua *${ev.title}* amanhã (${fmtDay(ev.starts_at)}) às ${fmtTime(ev.starts_at)}.${ev.meet_link ? `\n🔗 ${ev.meet_link}` : ""}\n\nConfirma presença?`;
        await sendTextToConversation(ev.account_id, conv, text, { senderName: null });
        await supabase.from("crm_events").update({ notify: { ...n, [key]: new Date().toISOString() } }).eq("id", ev.id);
      } catch (err) { console.warn("[Lembrete reunião]", err.message); }
    }
  } catch {}
}
export function startMeetingReminders() {
  setTimeout(runMeetingReminders, 2 * 60 * 1000);
  setInterval(runMeetingReminders, 10 * 60 * 1000);
}
