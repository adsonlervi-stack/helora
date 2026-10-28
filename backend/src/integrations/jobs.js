// Rotinas das Conexões: copia os e-mails novos para o cérebro (empresas com "sincronizar sozinho").
import { supabase } from "../config/db.js";
import { syncMail } from "./mail.js";
import { saveIntegration } from "./store.js";

export function startMailSync() {
  const run = async () => {
    try {
      const { data } = await supabase.from("account_integrations").select("account_id, config").eq("provider", "email");
      for (const r of data || []) {
        if (!r.config?.autoSync) continue;
        try {
          await syncMail(r.account_id, { limit: 30 });
          await saveIntegration(r.account_id, "email", { ...r.config, lastSync: new Date().toISOString() });
        } catch (err) { console.warn("[E-mail] sincronização:", err.message); }
      }
    } catch {}
  };
  setTimeout(run, 5 * 60 * 1000);
  setInterval(run, 60 * 60 * 1000);
}
