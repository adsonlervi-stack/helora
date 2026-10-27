// Exportação de conversa para fins judiciais/periciais.
// Gera um pacote ZIP com: relatório legível (HTML para imprimir/salvar em PDF),
// transcrição em texto, dados brutos (JSON), as mídias originais e a lista de
// hashes SHA-256 de cada arquivo — para que qualquer alteração posterior seja detectável.
import crypto from "crypto";
import { supabase } from "./config/db.js";
import { createZip } from "./zip.js";

const TZ = "America/Sao_Paulo";
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dt = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
const safe = (s, fb = "arquivo") => String(s || fb).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || fb;
const fmtPhone = (p) => {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d ? `+${d}` : "";
};
const EXT = { image: "jpg", video: "mp4", audio: "ogg", document: "bin", sticker: "webp" };
const TYPE_PT = { text: "Texto", image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento", sticker: "Figurinha", location: "Localização", contact: "Contato" };

async function allMessages(accountId, conversationId, from, to) {
  const out = [];
  for (let page = 0; page < 200; page++) {
    let q = supabase.from("messages").select("*").eq("account_id", accountId).eq("conversation_id", conversationId)
      .order("timestamp", { ascending: true }).order("id", { ascending: true }).range(page * 1000, page * 1000 + 999);
    if (from) q = q.gte("timestamp", from);
    if (to) q = q.lte("timestamp", to);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function senderOf(m, conv) {
  const x = m.extra || {};
  if (m.direction === "in") return conv.is_group ? (m.sender_name || "Participante") : (conv.name || "Cliente");
  if (x.fromPhone) return `Empresa (enviado pelo celular${m.sender_name ? ` · ${m.sender_name}` : ""})`;
  if (m.author === "bot") return "Empresa (robô automático)";
  if (m.author === "system") return "Sistema";
  return `Empresa${m.sender_name ? ` (atendente ${m.sender_name})` : " (atendente)"}`;
}

/**
 * Escreve o ZIP direto na resposta.
 * opts: { from, to, media (bool), exportedBy, exportedById }
 */
export async function exportConversation(res, accountId, conversationId, opts = {}) {
  const { data: conv } = await supabase.from("conversations").select("*").eq("account_id", accountId).eq("id", conversationId).maybeSingle();
  if (!conv) { const e = new Error("Conversa não encontrada."); e.status = 404; throw e; }
  const [{ data: acc }, chanRes] = await Promise.all([
    supabase.from("accounts").select("name").eq("id", accountId).maybeSingle(),
    conv.channel_id ? supabase.from("channels").select("name, phone, platform").eq("id", conv.channel_id).maybeSingle() : Promise.resolve({ data: null })
  ]);
  const chan = chanRes?.data || null;
  const msgs = await allMessages(accountId, conversationId, opts.from, opts.to);

  const now = new Date();
  const contactPhone = conv.phone || String(conv.external_id || "").split("@")[0];
  const root = safe(`Conversa ${conv.name || contactPhone} ${now.toISOString().slice(0, 10)}`);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(root)}.zip"`);
  const zip = createZip(res);
  const hashes = [];
  const add = async (name, data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
    hashes.push({ name, hash: sha256(buf), size: buf.length });
    await zip.add(`${root}/${name}`, buf);
  };

  // ---- Mídias originais ----
  const media = new Map(); // msg id -> { file, hash, size } | { error }
  let total = 0;
  if (opts.media !== false) {
    let n = 0;
    for (const m of msgs) {
      if (!m.media_url) continue;
      n++;
      try {
        if (total > 1500 * 1024 * 1024) { media.set(m.id, { error: "não incluída (limite de tamanho do pacote)" }); continue; }
        const r = await fetch(m.media_url);
        if (!r.ok) { media.set(m.id, { error: `indisponível (HTTP ${r.status})` }); continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        total += buf.length;
        const urlExt = (String(m.media_url).split("?")[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1];
        const docName = m.media_type === "document" && m.text && /\.[a-z0-9]{2,5}$/i.test(m.text) ? safe(m.text) : null;
        const file = `midias/${String(n).padStart(4, "0")}_${docName || `${m.media_type || "arquivo"}.${urlExt || EXT[m.media_type] || "bin"}`}`;
        await add(file, buf);
        media.set(m.id, { file, hash: sha256(buf), size: buf.length });
      } catch (e) {
        media.set(m.id, { error: "falha ao baixar" });
      }
    }
  }

  // ---- Linhas da conversa ----
  const rows = msgs.map((m, i) => {
    const x = m.extra || {};
    const md = media.get(m.id);
    const notes = [];
    if (m.forwarded) notes.push("Encaminhada");
    if (m.quoted_text) notes.push(`Em resposta a: "${String(m.quoted_text).slice(0, 120)}"`);
    if (m.deleted_at) notes.push(`Apagada ${m.deleted_by === "cliente" ? "pelo cliente" : m.deleted_by === "celular" ? "pelo celular da empresa" : ""} em ${dt(m.deleted_at)} (conteúdo preservado)`);
    if ((m.reactions || []).length) notes.push(`Reações: ${(m.reactions || []).map((r) => r.emoji || r).join(" ")}`);
    return {
      n: i + 1,
      dataHora: dt(m.timestamp),
      dataHoraUTC: m.timestamp ? new Date(m.timestamp).toISOString() : "",
      remetente: senderOf(m, conv),
      direcao: m.direction === "in" ? "Recebida" : "Enviada",
      tipo: TYPE_PT[m.media_type || "text"] || m.media_type || "Texto",
      conteudo: m.text || "",
      midia: md?.file || (m.media_url ? `(${md?.error || "não incluída"})` : ""),
      midiaSha256: md?.hash || "",
      idWhatsApp: m.whatsapp_message_id || "",
      idInterno: m.id,
      status: m.status || "",
      observacoes: notes.join(" · ")
    };
  });

  const period = rows.length ? `${rows[0].dataHora} a ${rows[rows.length - 1].dataHora}` : "sem mensagens no período";
  const meta = {
    empresa: acc?.name || "",
    canal: chan ? `${chan.name || chan.platform || "WhatsApp"}${chan.phone ? ` · ${fmtPhone(chan.phone)}` : ""}` : conv.platform,
    plataforma: conv.platform,
    contato: conv.name || "",
    telefoneContato: fmtPhone(contactPhone),
    identificadorContato: conv.external_id || "",
    grupo: !!conv.is_group,
    idConversa: conv.id,
    conversaIniciadaEm: dt(conv.created_at),
    filtroPeriodo: opts.from || opts.to ? `${opts.from ? dt(opts.from) : "início"} até ${opts.to ? dt(opts.to) : "hoje"}` : "conversa completa",
    periodoDasMensagens: period,
    totalMensagens: rows.length,
    totalMidias: [...media.values()].filter((v) => v.file).length,
    exportadoPor: opts.exportedBy || "",
    exportadoEm: `${dt(now.toISOString())} (horário de Brasília) · ${now.toISOString()} (UTC)`,
    sistema: "Helora — plataforma de atendimento",
    fusoHorario: "America/Sao_Paulo (UTC−03:00)"
  };

  // ---- Transcrição em texto (formato parecido com a exportação do WhatsApp) ----
  const txt = [
    "TRANSCRIÇÃO DE CONVERSA",
    `Empresa: ${meta.empresa}`, `Canal: ${meta.canal}`, `Contato: ${meta.contato} ${meta.telefoneContato}`,
    `Período: ${meta.periodoDasMensagens}`, `Exportado por: ${meta.exportadoPor} em ${meta.exportadoEm}`, `Fuso horário: ${meta.fusoHorario}`, "",
    ...rows.map((r) => `[${r.dataHora}] ${r.remetente}: ${r.conteudo}${r.midia ? ` <${r.tipo}: ${r.midia}>` : ""}${r.observacoes ? ` {${r.observacoes}}` : ""}`)
  ].join("\r\n");
  await add("conversa.txt", "﻿" + txt);

  // ---- Dados brutos ----
  await add("conversa.json", JSON.stringify({ metadados: meta, mensagens: rows }, null, 2));

  // ---- Relatório (abre no navegador; Ctrl+P salva em PDF) ----
  const mediaHashTable = rows.filter((r) => r.midiaSha256);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de conversa — ${esc(meta.contato || meta.telefoneContato)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;font-size:12px}
h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:24px 0 8px;border-bottom:1px solid #999;padding-bottom:4px}
table{border-collapse:collapse;width:100%} th,td{border:1px solid #bbb;padding:5px 6px;vertical-align:top;text-align:left}
th{background:#eee;font-size:11px} td{word-break:break-word} .meta td:first-child{width:220px;font-weight:bold;background:#f6f6f6}
.in{background:#fff} .out{background:#f3f8ff} .small{font-size:10px;color:#444;font-family:monospace}
.note{border:1px solid #999;background:#fafafa;padding:10px;margin-top:16px;line-height:1.5}
@media print{body{margin:12mm} tr{page-break-inside:avoid}}
</style></head><body>
<h1>Relatório de exportação de conversa</h1>
<div>Documento gerado automaticamente pelo sistema Helora a partir dos registros armazenados, sem edição manual do conteúdo.</div>
<h2>1. Identificação</h2>
<table class="meta">
${[["Empresa", meta.empresa], ["Canal / número da empresa", meta.canal], ["Contato", meta.contato], ["Telefone do contato", meta.telefoneContato], ["Identificador técnico do contato", meta.identificadorContato],
  ["Tipo", meta.grupo ? "Grupo" : "Conversa individual"], ["ID da conversa", meta.idConversa], ["Conversa iniciada em", meta.conversaIniciadaEm], ["Filtro aplicado", meta.filtroPeriodo],
  ["Período das mensagens", meta.periodoDasMensagens], ["Total de mensagens", meta.totalMensagens], ["Total de mídias anexadas", meta.totalMidias],
  ["Exportado por", meta.exportadoPor], ["Data/hora da exportação", meta.exportadoEm], ["Fuso horário dos registros", meta.fusoHorario]]
  .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("\n")}
</table>
<h2>2. Mensagens</h2>
<table><thead><tr><th>#</th><th>Data/hora</th><th>Remetente</th><th>Tipo</th><th>Conteúdo</th><th>Mídia / observações</th><th>ID da mensagem</th></tr></thead><tbody>
${rows.map((r) => `<tr class="${r.direcao === "Recebida" ? "in" : "out"}"><td>${r.n}</td><td>${esc(r.dataHora)}</td><td>${esc(r.remetente)}<br><span class="small">${esc(r.direcao)}</span></td><td>${esc(r.tipo)}</td><td>${esc(r.conteudo).replace(/\n/g, "<br>")}</td><td>${r.midia ? `${esc(r.midia)}${r.midiaSha256 ? `<br><span class="small">SHA-256: ${r.midiaSha256}</span>` : ""}` : ""}${r.observacoes ? `<br><i>${esc(r.observacoes)}</i>` : ""}</td><td class="small">${esc(r.idWhatsApp || r.idInterno)}${r.status ? `<br>status: ${esc(r.status)}` : ""}</td></tr>`).join("\n")}
</tbody></table>
${mediaHashTable.length ? `<h2>3. Mídias e seus hashes</h2><table><thead><tr><th>#</th><th>Arquivo</th><th>SHA-256</th></tr></thead><tbody>${mediaHashTable.map((r) => `<tr><td>${r.n}</td><td>${esc(r.midia)}</td><td class="small">${r.midiaSha256}</td></tr>`).join("")}</tbody></table>` : ""}
<h2>${mediaHashTable.length ? "4" : "3"}. Integridade</h2>
<div class="note">
Cada arquivo deste pacote tem seu código SHA-256 registrado no arquivo <b>HASHES-SHA256.txt</b>. O SHA-256 é uma "impressão digital" do arquivo:
qualquer alteração, mesmo de um único caractere, gera um código completamente diferente. Para conferir, calcule o SHA-256 do arquivo
(Windows: <code>certutil -hashfile arquivo SHA256</code> · macOS/Linux: <code>shasum -a 256 arquivo</code>) e compare com a lista.<br><br>
As datas e horas são as registradas pelo sistema no recebimento/envio de cada mensagem, no fuso ${esc(meta.fusoHorario)}; o arquivo
<b>conversa.json</b> traz também o horário em UTC. Mensagens apagadas pelo remetente aparecem com o conteúdo preservado e a indicação "Apagada".<br><br>
Observação: este relatório é uma extração técnica dos registros do sistema. Para máxima força probatória, recomenda-se apresentá-lo junto com
o pacote ZIP original (com os hashes) e, se necessário, lavrar ata notarial em cartório ou submeter a perícia.
</div>
</body></html>`;
  await add("Relatorio da conversa.html", html);

  // ---- Lista de hashes (gerada por último, cobre todos os arquivos acima) ----
  const hashTxt = [
    "HASHES SHA-256 DOS ARQUIVOS DESTE PACOTE",
    `Gerado em ${meta.exportadoEm} por ${meta.exportadoPor} · ${meta.sistema}`,
    `Conversa ${meta.idConversa} · ${meta.contato} ${meta.telefoneContato}`,
    "",
    ...hashes.map((h) => `${h.hash}  ${h.name}  (${h.size} bytes)`)
  ].join("\r\n");
  const hashBuf = Buffer.from("﻿" + hashTxt, "utf8");
  const finalHash = sha256(hashBuf);
  await zip.add(`${root}/HASHES-SHA256.txt`, hashBuf);
  await zip.finish();
  return { messages: rows.length, media: meta.totalMidias, finalHash };
}
