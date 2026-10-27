/**
 * Lembretes por data do CRM: em campos de data (ex.: data da viagem, vigência do seguro)
 * o gestor configura "X dias antes, mandar esta mensagem". Roda de hora em hora, das 8h às 20h
 * (horário de Brasília), e nunca manda o mesmo lembrete duas vezes para o mesmo card.
 */
import { supabase } from "./config/db.js";
import { leadConversation } from "./routes/crm.js";
import { sendTextToConversation, sendMediaUrlToConversation } from "./messaging.js";

const SERVER = String(process.env.SERVER_ID || "1").replace(/^main$/, "1");

function todaySP() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: parseInt(g("hour"), 10) % 24 };
}
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
function fill(text, lead, pipe) {
  const fmt = (f, v) => (v == null || v === "" ? "" : f?.type === "date" ? String(v).slice(0, 10).split("-").reverse().join("/") : f?.type === "currency" ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : String(v));
  const vars = {
    nome: String(lead.name || "").split(" ")[0], nome_completo: lead.name || "", empresa: lead.company || "",
    valor: lead.value != null ? Number(lead.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    etapa: (pipe.stages || []).find((s) => s.id === lead.stage)?.name || ""
  };
  for (const f of pipe.fields || []) vars[f.id] = fmt(f, (lead.custom || {})[f.id]);
  return String(text).replace(/\{([a-z0-9_]+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

let running = false;
export async function runCrmReminders() {
  if (running) return;
  running = true;
  try {
    const { date: today, hour } = todaySP();
    if (hour < 8 || hour >= 20) return;
    const { data: pipes } = await supabase.from("crm_pipelines").select("id, account_id, name, stages, fields");
    for (const pipe of pipes || []) {
      const dateFields = (pipe.fields || []).filter((f) => f.type === "date" && (f.reminders || []).length);
      if (!dateFields.length) continue;
      const { data: acc } = await supabase.from("accounts").select("server_id, status").eq("id", pipe.account_id).maybeSingle();
      if (acc && String(acc.server_id || "1").replace(/^main$/, "1") !== SERVER) continue;
      const { data: leads } = await supabase.from("crm_leads").select("*").eq("pipeline_id", pipe.id).not("phone", "is", null).limit(5000);
      for (const lead of leads || []) {
        if (lead.outcome === "lost" || lead.deleted_at || lead.archived_at || lead.snooze_until) continue;
        for (const f of dateFields) {
          const when = String((lead.custom || {})[f.id] || "").slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(when)) continue;
          const left = daysBetween(today, when);
          for (const r of f.reminders) {
            if (left !== r.days) continue;
            const key = `${f.id}:${r.days}:${when}`;
            if ((lead.history || []).some((h) => h.type === "reminder" && h.key === key)) continue;
            try {
              const conv = await leadConversation(pipe.account_id, lead, {});
              const text = fill(r.text, lead, pipe);
              await sendTextToConversation(pipe.account_id, conv, text, { sign: false });
              if (r.sendFiles) {
                for (const a of (lead.attachments || []).slice(0, 10)) {
                  const mediaType = /^image\//.test(a.type || "") ? "image" : /^video\//.test(a.type || "") ? "video" : "document";
                  await sendMediaUrlToConversation(pipe.account_id, conv, { url: a.url, mediaType, caption: a.name }, { fromBot: true }).catch(() => {});
                }
              }
              const entry = { id: `r_${Date.now().toString(36)}`, type: "reminder", key, text, at: new Date().toISOString(), by: "Lembrete automático" };
              lead.history = [...(lead.history || []), entry].slice(-300);
              await supabase.from("crm_leads").update({ history: lead.history, last_interaction_at: entry.at }).eq("id", lead.id);
            } catch (err) {
              console.warn("[CRM lembrete]", lead.id, err.message);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("[CRM lembretes]", err.message);
  } finally {
    running = false;
  }
}

export function startCrmReminders() {
  setTimeout(runCrmReminders, 60 * 1000);
  setInterval(runCrmReminders, 60 * 60 * 1000);
}
