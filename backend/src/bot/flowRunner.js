/**
 * Motor do construtor de fluxos (canvas).
 *
 * graph = {
 *   nodes: [{ id, type, x, y, data }],
 *   edges: [{ id, from, port, to }]      // "from" saiu pela porta "port" e vai para "to"
 * }
 *
 * Tipos de bloco e portas de saída:
 *   trigger   → out
 *   message   → out                       data: { text }
 *   question  → out                       data: { text, variable, validation, invalidText }
 *   options   → <id de cada opção>, invalid   data: { text, options:[{id,label}], invalidText, maxRetries }
 *   hours     → open, closed              data: { days:[0..6], start:"08:00", end:"18:00", timezone }
 *   condition → true, false               data: { variable, operator, value }
 *   wait      → out                       data: { seconds }
 *   action    → out                       data: { action: transfer|assign|label|close|human, departmentId, agentId, labelId, text }
 *   end       → (nenhuma)                 data: { text }
 *   lookup    → found, notfound           data: { pipelineId, text, sendFiles, notFoundText }  (Consultar cliente no CRM pelo número do WhatsApp)
 *   http      → ok, error                 data: { method, url, headers, body, map:[{var,path}], text }  (Consultar sistema externo)
 *   ai        → human, done               data: { instructions, knowledge, maxTurns }  (Atendente IA: conversa até resolver ou passar para humano)
 *
 * Estado da conversa: conversation.botNodeId = bloco que está esperando resposta
 * (question/options); conversation.flowVars = respostas salvas ({nome}, {email}...).
 */
import { updateConversation, recordFlowEvent, addLabelToConversation, listMessages, supabase } from "../config/db.js";
import { aiChat, aiConfigured, transcribeAudio } from "../aiClient.js";

const HUMAN_TAG = "[[HUMANO]]";
const DONE_TAG = "[[FIM]]";

/** Atendente IA: responde o cliente com base no Prompt escolhido no bloco. Devolve { text, port, prompt }. */
async function aiTurn({ accountId, conversation, node, vars, dryRun, text }) {
  const d = node.data || {};
  const { data: acc } = await supabase.from("accounts").select("name, enabled_tabs").eq("id", accountId).maybeSingle();
  if (!aiConfigured() || (Array.isArray(acc?.enabled_tabs) && !acc.enabled_tabs.includes("ai"))) {
    return { text: "", port: "human", prompt: null }; // sem IA disponível → passa para humano
  }
  let prompt = null;
  if (d.promptId) {
    const { data } = await supabase.from("ai_prompts").select("*").eq("id", d.promptId).eq("account_id", accountId).maybeSingle();
    prompt = data || null;
  }
  const historySize = prompt?.history_size || 20;
  let history = [];
  let lastIn = null;
  if (dryRun) history = [{ role: "user", content: String(text || "Olá") }];
  else {
    const msgs = await listMessages(accountId, conversation.id).catch(() => []);
    const recent = msgs.filter((m) => m.author !== "system" && (m.text || m.mediaType)).slice(-historySize);
    lastIn = [...recent].reverse().find((m) => m.direction === "in") || null;
    // Áudio do cliente → transcreve e a IA responde em texto. Outras mídias → mensagem padrão.
    const transcripts = new Map();
    for (const m of recent) {
      if (m.direction === "in" && m.mediaType === "audio" && !String(m.text || "").trim() && m.mediaUrl && m === lastIn) {
        const t = await transcribeAudio(m.mediaUrl).catch((err) => { console.warn("[IA] transcrição:", err.message); return null; });
        if (t) transcripts.set(m.id, t);
      }
    }
    if (lastIn && !String(lastIn.text || "").trim() && lastIn.mediaType && !transcripts.has(lastIn.id)) {
      return { text: prompt?.unsupported_media_message || "Ah, que pena! 😅 No momento eu só consigo entender mensagens de texto e áudios. Pode me escrever por aqui?", port: null, prompt };
    }
    for (const m of recent) {
      const role = m.direction === "in" ? "user" : "assistant";
      const content = transcripts.get(m.id) ? `(áudio transcrito) ${transcripts.get(m.id)}` : m.text || (m.mediaType ? `[${m.mediaType === "audio" ? "áudio" : m.mediaType}]` : "");
      if (!content) continue;
      const last = history[history.length - 1];
      if (last && last.role === role) last.content += `\n${content}`;
      else history.push({ role, content });
    }
    while (history.length && history[0].role !== "user") history.shift();
    if (!history.length) history = [{ role: "user", content: String(text || "Olá") }];
  }
  const instructions = prompt?.prompt || d.instructions || "";
  const system = [
    `Você é o atendente virtual de ${acc?.name || "uma empresa"} no WhatsApp. Responda em português do Brasil, de forma natural, curta e humana (sem markdown além de *negrito*).`,
    instructions ? `PROMPT DA EMPRESA (siga à risca):\n${instructions}` : "",
    d.knowledge ? `Base de conhecimento:\n${d.knowledge}` : "",
    "Não invente preços, prazos ou políticas que não estejam no prompt.",
    vars?.nome ? `Nome do cliente: ${vars.nome}.` : "",
    `Se o cliente pedir para falar com uma pessoa, estiver irritado, ou você não souber responder com segurança, avise que vai transferir para um atendente e termine a mensagem com ${HUMAN_TAG}.`,
    `Se a dúvida do cliente foi resolvida e ele se despediu ou agradeceu, responda e termine com ${DONE_TAG}.`
  ].filter(Boolean).join("\n\n");
  let out = await aiChat({ system, messages: history, maxTokens: 500 });
  let port = null;
  if (out.includes(HUMAN_TAG)) port = "human";
  else if (out.includes(DONE_TAG)) port = "done";
  out = out.replaceAll(HUMAN_TAG, "").replaceAll(DONE_TAG, "").trim();
  if (port === "human" && prompt) {
    if (prompt.transfer_message_enabled === false) out = "";
    else if (prompt.transfer_message) out = prompt.transfer_message;
  }
  return { text: out, port, prompt };
}

/** Acha o card do CRM do cliente pelo número do WhatsApp (últimos 8 dígitos). */
async function findLeadByPhone(accountId, phone, pipelineId) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  let q = supabase.from("crm_leads").select("*, crm_pipelines(name, stages, fields), owner:profiles!crm_leads_owner_id_fkey(name)")
    .eq("account_id", accountId).ilike("phone", `%${digits.slice(-8)}`).order("created_at", { ascending: false }).limit(1);
  if (pipelineId) q = q.eq("pipeline_id", pipelineId);
  const { data } = await q.maybeSingle();
  return data || null;
}
function leadVars(lead) {
  const pipe = lead.crm_pipelines || {};
  const fmt = (f, v) => {
    if (v == null || v === "") return "";
    if (f?.type === "date") return String(v).slice(0, 10).split("-").reverse().join("/");
    if (f?.type === "currency") return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return String(v);
  };
  const out = {
    nome: String(lead.name || "").split(" ")[0], nome_completo: lead.name || "", empresa: lead.company || "",
    valor: lead.value != null ? Number(lead.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    etapa: (pipe.stages || []).find((s) => s.id === lead.stage)?.name || "", responsavel: lead.owner?.name || "", email: lead.email || ""
  };
  for (const f of pipe.fields || []) out[f.id] = fmt(f, (lead.custom || {})[f.id]);
  return out;
}

// ---- Consultar sistema externo (API da empresa) ----
import dns from "dns/promises";
import net from "net";
function privateIp(ip) {
  if (net.isIPv6(ip)) { const x = ip.toLowerCase(); return x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:127.") || x.startsWith("::ffff:10.") || x.startsWith("::ffff:192.168."); }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
function pickPath(obj, path) {
  return String(path || "").replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
async function httpCall(d, vars) {
  const url = interpolate(d.url || "", Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, encodeURIComponent(String(v))])));
  let u;
  try { u = new URL(url); } catch { throw new Error("URL inválida"); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Só http/https");
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (addrs.some((a) => privateIp(a.address))) throw new Error("Endereço interno bloqueado");
  const headers = { Accept: "application/json" };
  for (const line of String(d.headers || "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim()] = interpolate(line.slice(i + 1).trim(), vars);
  }
  const method = (d.method || "GET").toUpperCase() === "POST" ? "POST" : "GET";
  let body;
  if (method === "POST" && d.body) { body = interpolate(d.body, vars); headers["Content-Type"] = headers["Content-Type"] || "application/json"; }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(u, { method, headers, body, signal: ctl.signal, redirect: "error" });
    const txt = (await r.text()).slice(0, 200000);
    let json = null;
    try { json = JSON.parse(txt); } catch {}
    return { ok: r.ok, status: r.status, json, txt };
  } finally { clearTimeout(t); }
}

const MAX_STEPS = 40;
const MAX_WAIT_SECONDS = 600; // esperas maiores que 10 min são encurtadas

export function normalize(text = "") {
  return String(text || "")
    // ignora a assinatura do atendente ("*Nome:*" na 1ª linha) e a formatação do WhatsApp
    .replace(/^\s*\*[^*\n]{1,60}:\*\s*\n+/, "")
    .replace(/[*_~`]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function interpolate(text = "", vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== "" ? vars[k] : m));
}

const nodeById = (graph, id) => (graph.nodes || []).find((n) => n.id === id);
const nextOf = (graph, nodeId, port = "out") =>
  (graph.edges || []).find((e) => e.from === nodeId && (e.port || "out") === port)?.to || null;

function isOpenNow({ days = [1, 2, 3, 4, 5], start = "08:00", end = "18:00", timezone = "America/Sao_Paulo" } = {}) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const mins = (parseInt(get("hour"), 10) % 24) * 60 + parseInt(get("minute"), 10);
  const toMin = (s) => {
    const [h, m] = String(s).split(":").map(Number);
    return h * 60 + (m || 0);
  };
  return days.includes(dow) && mins >= toMin(start) && mins < toMin(end);
}

function checkCondition({ variable, operator = "equals", value = "" }, vars) {
  const raw = vars[variable] ?? "";
  const a = normalize(raw);
  const b = normalize(value);
  switch (operator) {
    case "equals": return a === b;
    case "not_equals": return a !== b;
    case "contains": return a.includes(b);
    case "not_empty": return a !== "";
    case "empty": return a === "";
    case "gt": return parseFloat(raw) > parseFloat(value);
    case "lt": return parseFloat(raw) < parseFloat(value);
    default: return false;
  }
}

function validate(validation, text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (validation === "number") return /^-?\d+([.,]\d+)?$/.test(t);
  if (validation === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  if (validation === "phone") return t.replace(/\D/g, "").length >= 10;
  if (validation === "cpf") return t.replace(/\D/g, "").length === 11;
  return true;
}

function matchOption(node, rawText) {
  const options = node.data?.options || [];
  const text = normalize(rawText);
  const num = parseInt(text, 10);
  if (Number.isInteger(num) && num >= 1 && num <= options.length && String(num) === text) return options[num - 1];
  return options.find((o) => {
    const label = normalize(o.label);
    return label && (text === label || text.includes(label));
  });
}

export function optionsText(node, vars) {
  const opts = (node.data?.options || []).map((o, i) => `${i + 1} - ${o.label}`).join("\n");
  return [interpolate(node.data?.text || "", vars), opts].filter(Boolean).join("\n\n");
}

/**
 * Executa o fluxo para uma mensagem recebida.
 * ctx: { accountId, conversation, flow, text, send(text), dryRun }
 * Retorna { handled, state: { botNodeId, flowVars, mode, ended }, log: [texts] }
 */
export async function runGraph(ctx) {
  const { accountId, conversation, flow, text, dryRun = false } = ctx;
  const graph = flow.graph || { nodes: [], edges: [] };
  const vars = { ...(conversation.flowVars || {}) };
  vars.telefone = vars.telefone || String(conversation.externalId || "").split("@")[0];
  vars.nome = vars.nome || conversation.name || "";
  const log = [];
  const patch = {};
  const track = (nodeId, kind, port) => !dryRun && recordFlowEvent(accountId, flow.id, nodeId, kind, port);

  const send = async (msg) => {
    const out = interpolate(msg, vars).trim();
    if (!out) return;
    log.push(out);
    if (!dryRun && ctx.send) await ctx.send(out);
  };

  let currentId = null;

  // 1) Está esperando a resposta de uma pergunta/menu?
  const waitingNode = conversation.botNodeId ? nodeById(graph, conversation.botNodeId) : null;
  if (waitingNode && waitingNode.type === "ai") {
    const turns = (vars.__aiTurns || 0) + 1;
    const max = parseInt(waitingNode.data?.maxTurns, 10) || 20;
    let r;
    try {
      r = turns > max ? { text: "", port: "human" } : await aiTurn({ accountId, conversation, node: waitingNode, vars, dryRun, text });
    } catch (err) {
      console.error("[IA] falhou:", err.message);
      r = { text: "", port: "human" };
    }
    track(waitingNode.id, "reply", r.port || undefined);
    if (r.text) await send(r.text);
    if (!r.port) {
      vars.__aiTurns = turns;
      return { handled: true, state: { botNodeId: waitingNode.id, flowVars: vars }, log };
    }
    delete vars.__aiTurns;
    currentId = nextOf(graph, waitingNode.id, r.port);
    if (r.port === "human" && r.prompt?.transfer_department_id) patch.departmentId = r.prompt.transfer_department_id;
    if (!currentId && r.port === "human") {
      patch.mode = "human";
      return { handled: true, state: { botNodeId: null, flowVars: { ...vars, __ended: true }, ...patch }, log };
    }
  } else   if (waitingNode && (waitingNode.type === "question" || waitingNode.type === "options")) {
    if (waitingNode.type === "question") {
      if (!validate(waitingNode.data?.validation, text)) {
        track(waitingNode.id, "invalid");
        await send(waitingNode.data?.invalidText || "Não entendi. Pode responder de novo? 🙏");
        return { handled: true, state: { botNodeId: waitingNode.id, flowVars: vars }, log };
      }
      track(waitingNode.id, "reply");
      if (waitingNode.data?.variable) vars[waitingNode.data.variable] = String(text).trim();
      currentId = nextOf(graph, waitingNode.id, "out");
    } else {
      const opt = matchOption(waitingNode, text);
      if (!opt) {
        const retries = (vars.__retries || 0) + 1;
        track(waitingNode.id, "invalid");
        const max = waitingNode.data?.maxRetries ?? 2;
        const invalidTarget = nextOf(graph, waitingNode.id, "invalid");
        if (retries > max && invalidTarget) {
          delete vars.__retries;
          currentId = invalidTarget;
        } else {
          vars.__retries = retries;
          await send(waitingNode.data?.invalidText || "Opção inválida. Responda com o número da opção:");
          await send(optionsText(waitingNode, vars));
          return { handled: true, state: { botNodeId: waitingNode.id, flowVars: vars }, log };
        }
      } else {
        delete vars.__retries;
        track(waitingNode.id, "reply", opt.id);
        if (waitingNode.data?.variable) vars[waitingNode.data.variable] = opt.label;
        currentId = nextOf(graph, waitingNode.id, opt.id);
      }
    }
  } else {
    // 2) Começo do fluxo: sai do gatilho.
    const trigger = (graph.nodes || []).find((n) => n.type === "trigger");
    if (!trigger) return { handled: false, state: {}, log };
    track(trigger.id, "sent");
    currentId = nextOf(graph, trigger.id, "out");
  }

  // 3) Anda pelos blocos até precisar de resposta ou acabar.
  let steps = 0;
  while (currentId && steps < MAX_STEPS) {
    steps++;
    const node = nodeById(graph, currentId);
    if (!node) break;
    const d = node.data || {};
    track(node.id, "sent");

    if (node.type === "message") {
      await send(d.text);
      currentId = nextOf(graph, node.id);
    } else if (node.type === "question") {
      await send(d.text);
      return { handled: true, state: { botNodeId: node.id, flowVars: vars }, log };
    } else if (node.type === "options") {
      await send(optionsText(node, vars));
      return { handled: true, state: { botNodeId: node.id, flowVars: vars }, log };
    } else if (node.type === "hours") {
      const port = isOpenNow(d) ? "open" : "closed";
      track(node.id, "reply", port);
      currentId = nextOf(graph, node.id, port);
    } else if (node.type === "condition") {
      const port = checkCondition(d, vars) ? "true" : "false";
      track(node.id, "reply", port);
      currentId = nextOf(graph, node.id, port);
    } else if (node.type === "wait") {
      const secs = Math.min(MAX_WAIT_SECONDS, Math.max(0, parseInt(d.seconds, 10) || 0));
      if (!dryRun && secs > 0) await new Promise((r) => setTimeout(r, secs * 1000));
      else if (dryRun && secs > 0) log.push(`⏱ (espera ${secs}s)`);
      currentId = nextOf(graph, node.id);
    } else if (node.type === "action") {
      if (d.text) await send(d.text);
      if (d.action === "transfer" || d.action === "human") {
        patch.mode = "human";
        if (d.departmentId) patch.departmentId = d.departmentId;
        if (dryRun) log.push(`➡️ (transferido${d.departmentName ? ` para ${d.departmentName}` : " para atendimento humano"})`);
        return { handled: true, state: { botNodeId: null, flowVars: { ...vars, __ended: true }, ...patch }, log };
      }
      if (d.action === "assign" && d.agentId) {
        patch.assignedAgentId = d.agentId;
        patch.mode = "human";
        if (dryRun) log.push("➡️ (atribuído ao atendente)");
        return { handled: true, state: { botNodeId: null, flowVars: { ...vars, __ended: true }, ...patch }, log };
      }
      if (d.action === "label" && d.labelId) {
        if (!dryRun) await addLabelToConversation(accountId, conversation.id, d.labelId);
        else log.push("🏷 (etiqueta aplicada)");
      }
      if (d.action === "close") {
        patch.status = "resolved";
        if (dryRun) log.push("✅ (conversa encerrada)");
        return { handled: true, state: { botNodeId: null, flowVars: {}, ...patch }, log };
      }
      currentId = nextOf(graph, node.id);
    } else if (node.type === "ai") {
      let r;
      try {
        r = await aiTurn({ accountId, conversation, node, vars, dryRun, text });
      } catch (err) {
        console.error("[IA] falhou:", err.message);
        r = { text: "", port: "human" };
      }
      if (r.text) await send(r.text);
      if (!r.port) {
        vars.__aiTurns = 1;
        return { handled: true, state: { botNodeId: node.id, flowVars: vars }, log };
      }
      currentId = nextOf(graph, node.id, r.port);
      if (r.port === "human" && r.prompt?.transfer_department_id) patch.departmentId = r.prompt.transfer_department_id;
      if (!currentId && r.port === "human") {
        patch.mode = "human";
        return { handled: true, state: { botNodeId: null, flowVars: { ...vars, __ended: true }, ...patch }, log };
      }
    } else if (node.type === "http") {
      let port = "error";
      try {
        const r = await httpCall(d, vars);
        vars.api_status = String(r.status);
        if (r.ok) {
          for (const m of d.map || []) {
            if (!m?.var) continue;
            const v = r.json != null ? pickPath(r.json, m.path) : undefined;
            vars[String(m.var).replace(/[^\w]/g, "")] = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
          }
          port = "ok";
        }
        if (dryRun) log.push(`🌐 (consulta externa: HTTP ${r.status})`);
      } catch (err) {
        if (dryRun) log.push(`🌐 (consulta externa falhou: ${err.message})`);
        else console.warn("[Fluxo] consulta externa:", err.message);
      }
      track(node.id, "reply", port);
      if (port === "ok" && d.text) await send(d.text);
      if (port === "error" && d.errorText) await send(d.errorText);
      currentId = nextOf(graph, node.id, port);
    } else if (node.type === "lookup") {
      let lead = null;
      try { lead = await findLeadByPhone(accountId, vars.telefone, d.pipelineId || null); } catch (err) { console.warn("[Fluxo] consulta CRM:", err.message); }
      if (!lead && dryRun) log.push("🔎 (cliente não encontrado no CRM — no teste o número é fictício)");
      if (lead) {
        Object.assign(vars, leadVars(lead));
        track(node.id, "reply", "found");
        if (d.text) await send(d.text);
        if (d.sendFiles) {
          for (const f of (lead.attachments || []).slice(0, 10)) {
            if (dryRun) { log.push(`📎 ${f.name}`); continue; }
            try {
              const { sendMediaUrlToConversation } = await import("../messaging.js");
              const mediaType = /^image\//.test(f.type || "") ? "image" : /^video\//.test(f.type || "") ? "video" : "document";
              await sendMediaUrlToConversation(accountId, conversation, { url: f.url, mediaType, caption: f.name }, { sign: false, fromBot: true });
            } catch (err) { console.warn("[Fluxo] anexo:", err.message); }
          }
        }
        currentId = nextOf(graph, node.id, "found");
      } else {
        track(node.id, "reply", "notfound");
        if (d.notFoundText) await send(d.notFoundText);
        currentId = nextOf(graph, node.id, "notfound");
      }
    } else if (node.type === "end") {
      if (d.text) await send(d.text);
      break;
    } else {
      currentId = nextOf(graph, node.id);
    }
  }

  return { handled: true, state: { botNodeId: null, flowVars: { ...vars, __ended: true, __endedAt: new Date().toISOString() }, ...patch }, log };
}

/** Roda o fluxo de verdade e grava o estado na conversa. */
export async function runActiveFlow({ accountId, conversation, flow, text, send }) {
  const result = await runGraph({ accountId, conversation, flow, text, send });
  if (!result.handled) return false;
  const { botNodeId, flowVars, ...rest } = result.state;
  await updateConversation(accountId, conversation.id, {
    botNodeId: botNodeId || null,
    flowVars: flowVars || {},
    flowId: flow.id,
    ...rest
  });
  return true;
}
