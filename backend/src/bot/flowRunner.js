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
 *
 * Estado da conversa: conversation.botNodeId = bloco que está esperando resposta
 * (question/options); conversation.flowVars = respostas salvas ({nome}, {email}...).
 */
import { updateConversation, recordFlowEvent, addLabelToConversation } from "../config/db.js";

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
  if (waitingNode && (waitingNode.type === "question" || waitingNode.type === "options")) {
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
