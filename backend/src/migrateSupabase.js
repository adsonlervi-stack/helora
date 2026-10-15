// Migração única: copia tudo do Supabase atual (SUPABASE_URL) para o novo
// (NEW_SUPABASE_URL / NEW_SUPABASE_SERVICE_ROLE_KEY): logins, tabelas e arquivos.
// Pode rodar mais de uma vez — o que já existe no destino é mantido (sem duplicar).
import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "accounts", "profiles", "departments", "profile_departments", "flows", "channels", "channel_permissions",
  "channel_status", "labels", "bot_flows", "conversations", "conversation_labels", "messages", "notes",
  "csat_responses", "auto_replies", "canned_responses", "deals", "deal_activities", "scheduled_messages",
  "announcements", "invoices", "contacts", "support_threads", "support_messages", "flow_events",
  "group_permissions", "profile_channels", "credit_ledger", "campaigns", "campaign_recipients", "api_keys"
];
const ORDER = { messages: "timestamp", support_messages: "created_at", flow_events: "created_at" };

export const migrationState = { running: false, log: [], done: false, error: null, startedAt: null };
const log = (m) => {
  migrationState.log.push(`${new Date().toISOString().slice(11, 19)} ${m}`);
  console.log("[Migração]", m);
};

export async function runMigration() {
  if (migrationState.running) throw new Error("Migração já está rodando.");
  const oldUrl = process.env.SUPABASE_URL;
  const newUrl = process.env.NEW_SUPABASE_URL;
  const newKey = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY;
  if (!newUrl || !newKey) throw new Error("Configure NEW_SUPABASE_URL e NEW_SUPABASE_SERVICE_ROLE_KEY no Railway.");
  if (newUrl.replace(/\/$/, "") === oldUrl.replace(/\/$/, "")) throw new Error("NEW_SUPABASE_URL é igual ao atual.");
  Object.assign(migrationState, { running: true, log: [], done: false, error: null, startedAt: new Date().toISOString() });

  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const src = createClient(oldUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);
  const dst = createClient(newUrl, newKey, opts);
  const oldHost = new URL(oldUrl).host;
  const newHost = new URL(newUrl).host;
  const rewrite = (rows) => JSON.parse(JSON.stringify(rows).split(oldHost).join(newHost));

  const importRows = async (tbl, rows) => {
    if (!rows.length) return 0;
    const { data, error } = await dst.rpc("helora_import_rows", { tbl, rows });
    if (!error) return data || 0;
    // Lote falhou: tenta linha a linha (ex.: mensagem citando outra que ainda não existe)
    let ok = 0;
    for (const r of rows) {
      let { data: d, error: e } = await dst.rpc("helora_import_rows", { tbl, rows: [r] });
      if (e && "quoted_id" in r) ({ data: d, error: e } = await dst.rpc("helora_import_rows", { tbl, rows: [{ ...r, quoted_id: null }] }));
      if (e) log(`  ! ${tbl}: ${e.message.slice(0, 140)}`);
      else ok += d || 0;
    }
    return ok;
  };

  try {
    // 1) Logins (com as senhas atuais)
    const { data: auth, error: authErr } = await src.rpc("helora_export_auth");
    if (authErr) throw new Error(`Exportar logins: ${authErr.message} (rodou o arquivo A no Supabase antigo?)`);
    log(`Logins: ${await importRows("auth.users", auth.users)} de ${auth.users.length} copiados`);
    log(`Identidades: ${await importRows("auth.identities", auth.identities)} de ${auth.identities.length}`);

    // 2) Tabelas
    for (const t of TABLES) {
      let from = 0, total = 0, copied = 0;
      const page = 1000;
      for (;;) {
        let q = src.from(t).select("*").range(from, from + page - 1);
        if (ORDER[t]) q = q.order(ORDER[t], { ascending: true });
        const { data, error } = await q;
        if (error) {
          log(`  ${t}: pulada (${error.message.slice(0, 80)})`);
          break;
        }
        total += data.length;
        copied += await importRows(`public.${t}`, rewrite(data));
        if (data.length < page) break;
        from += page;
      }
      log(`${t}: ${copied} novas de ${total}`);
    }
    await dst.rpc("helora_fix_identities");

    // 3) Arquivos (fotos, áudios, documentos, avatares)
    const { data: buckets } = await src.storage.listBuckets();
    for (const b of buckets || []) {
      const { data: have } = await dst.storage.listBuckets();
      if (!(have || []).some((x) => x.name === b.name)) await dst.storage.createBucket(b.name, { public: b.public });
      let files = 0, skipped = 0;
      const walk = async (prefix) => {
        for (let offset = 0; ; offset += 1000) {
          const { data: list, error } = await src.storage.from(b.name).list(prefix, { limit: 1000, offset });
          if (error || !list?.length) return;
          for (const item of list) {
            const path = prefix ? `${prefix}/${item.name}` : item.name;
            if (!item.id) {
              await walk(path);
              continue;
            }
            const { data: blob, error: dlErr } = await src.storage.from(b.name).download(path);
            if (dlErr) { skipped++; continue; }
            const { error: upErr } = await dst.storage
              .from(b.name)
              .upload(path, Buffer.from(await blob.arrayBuffer()), { contentType: item.metadata?.mimetype, upsert: false });
            if (upErr && !/exists|Duplicate/i.test(upErr.message)) skipped++;
            else files++;
          }
          if (list.length < 1000) return;
        }
      };
      await walk("");
      log(`Arquivos ${b.name}: ${files} copiados${skipped ? `, ${skipped} com erro` : ""}`);
    }
    migrationState.done = true;
    log("✅ Migração concluída.");
  } catch (err) {
    migrationState.error = err.message;
    log(`❌ ${err.message}`);
  } finally {
    migrationState.running = false;
  }
}
