import { Zap, MessageSquare, HelpCircle, ListOrdered, Clock, GitBranch, Timer, Bolt, Flag, Sparkles, UserSearch, Globe } from "lucide-react";

export const NODE_W = 248;
export const HEAD_H = 40;
export const BODY_H = 52;
export const PORT_H = 30;
export const PORT_TOP_PAD = 6;

export const TYPES = {
  trigger: { label: "Início", color: "#34c759", icon: Zap, group: "Gatilho", desc: "Quando o cliente manda mensagem" },
  message: { label: "Mensagem", color: "#0071e3", icon: MessageSquare, group: "Mensagens", desc: "Envia um texto" },
  question: { label: "Pergunta", color: "#5856d6", icon: HelpCircle, group: "Mensagens", desc: "Pergunta e guarda a resposta" },
  options: { label: "Menu de opções", color: "#af52de", icon: ListOrdered, group: "Mensagens", desc: "1, 2, 3… um caminho por opção" },
  hours: { label: "Horário comercial", color: "#ff9f0a", icon: Clock, group: "Lógica", desc: "Aberto ou fechado agora" },
  condition: { label: "Condição", color: "#ff2d55", icon: GitBranch, group: "Lógica", desc: "Se a resposta for…" },
  wait: { label: "Espera", color: "#8e8e93", icon: Timer, group: "Lógica", desc: "Pausa antes de seguir" },
  ai: { label: "Atendente IA", color: "#bf5af2", icon: Sparkles, group: "Mensagens", desc: "A IA conversa até resolver ou chamar humano" },
  lookup: { label: "Consultar cliente", color: "#0a84ff", icon: UserSearch, group: "Lógica", desc: "Busca o card do CRM pelo número e responde com os dados" },
  http: { label: "Consultar sistema externo", color: "#5e5ce6", icon: Globe, group: "Lógica", desc: "Busca dados na API da empresa (reservas, pedidos, boletos)" },
  action: { label: "Ação", color: "#ff3b30", icon: Bolt, group: "Ações", desc: "Transferir, etiquetar, encerrar" },
  end: { label: "Fim", color: "#1d1d1f", icon: Flag, group: "Ações", desc: "Encerra o roteiro do bot" }
};

export const PALETTE_GROUPS = ["Mensagens", "Lógica", "Ações"];

export const ACTIONS = {
  transfer: "Transferir para setor / fila humana",
  assign: "Atribuir a um atendente",
  label: "Adicionar etiqueta",
  close: "Encerrar conversa"
};

export const OPERATORS = {
  equals: "é igual a",
  not_equals: "é diferente de",
  contains: "contém",
  not_empty: "foi respondido",
  empty: "está vazio",
  gt: "é maior que",
  lt: "é menor que"
};

export const VALIDATIONS = { text: "Qualquer texto", number: "Número", email: "E-mail", phone: "Telefone", cpf: "CPF" };

export const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Saídas de cada bloco (porta → rótulo). */
export function portsOf(node) {
  const d = node.data || {};
  switch (node.type) {
    case "trigger": return [{ id: "out", label: "Ao receber mensagem" }];
    case "options":
      return [
        ...(d.options || []).map((o, i) => ({ id: o.id, label: `${i + 1}. ${o.label || "Opção"}` })),
        { id: "invalid", label: "Não respondeu certo", muted: true }
      ];
    case "hours": return [{ id: "open", label: "Aberto" }, { id: "closed", label: "Fechado" }];
    case "condition": return [{ id: "true", label: "Sim" }, { id: "false", label: "Não" }];
    case "ai": return [{ id: "done", label: "Resolveu" }, { id: "human", label: "Precisa de humano" }];
    case "http": return [{ id: "ok", label: "Deu certo" }, { id: "error", label: "Falhou", muted: true }];
    case "lookup": return [{ id: "found", label: "Encontrou o cliente" }, { id: "notfound", label: "Não encontrou", muted: true }];
    case "end": return [];
    default: return [{ id: "out", label: "Depois" }];
  }
}

export function nodeHeight(node) {
  return HEAD_H + BODY_H + PORT_TOP_PAD + portsOf(node).length * PORT_H + 8;
}

export function portPoint(node, portId) {
  const i = portsOf(node).findIndex((p) => p.id === portId);
  return { x: node.x + NODE_W, y: node.y + HEAD_H + BODY_H + PORT_TOP_PAD + i * PORT_H + PORT_H / 2 };
}

export const inputPoint = (node) => ({ x: node.x, y: node.y + HEAD_H / 2 });

export function summary(node, ctx = {}) {
  const d = node.data || {};
  switch (node.type) {
    case "trigger": return "O fluxo começa aqui";
    case "message": return d.text || "Escreva a mensagem…";
    case "question": return (d.text || "Escreva a pergunta…") + (d.variable ? `  → {${d.variable}}` : "");
    case "options": return d.text || "Texto do menu…";
    case "hours": return `${(d.days || []).map((x) => DAYS[x]).join(", ") || "Nenhum dia"} · ${d.start || "08:00"}–${d.end || "18:00"}`;
    case "condition": return d.variable ? `Se {${d.variable}} ${OPERATORS[d.operator] || ""} ${d.value || ""}` : "Defina a condição…";
    case "wait": return `Espera ${d.seconds || 0}s`;
    case "action": {
      const base = ACTIONS[d.action] || "Escolha a ação…";
      const extra =
        d.action === "transfer" ? ctx.departments?.find((x) => x.id === d.departmentId)?.name :
        d.action === "assign" ? ctx.team?.find((x) => x.id === d.agentId)?.name :
        d.action === "label" ? ctx.labels?.find((x) => x.id === d.labelId)?.title : null;
      return extra ? `${base}: ${extra}` : base;
    }
    case "end": return d.text || "Encerra sem mensagem";
    case "http": { try { return `${d.method || "GET"} ${new URL(d.url).hostname}`; } catch { return "Configure o endereço da API…"; } }
    case "lookup": return `${ctx.pipelines?.find((p) => p.id === d.pipelineId)?.name || "Todos os funis"}${d.sendFiles ? " · envia anexos" : ""}`;
    case "ai": return ctx.prompts?.find((p) => p.id === d.promptId)?.name ? `Prompt: ${ctx.prompts.find((p) => p.id === d.promptId).name}` : "Escolha o prompt de IA…";
    default: return "";
  }
}

export const uid = (p = "n") => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export function newNode(type, x, y) {
  const base = { id: uid(type), type, x: Math.round(x), y: Math.round(y), data: {} };
  if (type === "message") base.data = { text: "" };
  if (type === "question") base.data = { text: "", variable: "resposta", validation: "text", invalidText: "Não entendi. Pode responder de novo?" };
  if (type === "options") base.data = { text: "Escolha uma opção:", options: [{ id: uid("op"), label: "Opção 1" }, { id: uid("op"), label: "Opção 2" }], invalidText: "Opção inválida. Responda com o número:", maxRetries: 2 };
  if (type === "hours") base.data = { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00", timezone: "America/Sao_Paulo" };
  if (type === "condition") base.data = { variable: "resposta", operator: "equals", value: "" };
  if (type === "wait") base.data = { seconds: 5 };
  if (type === "action") base.data = { action: "transfer", text: "" };
  if (type === "end") base.data = { text: "" };
  if (type === "http") base.data = { method: "GET", url: "", headers: "", body: "", map: [{ var: "", path: "" }], text: "", errorText: "Não consegui consultar agora. Vou te passar para um atendente." };
  if (type === "lookup") base.data = { pipelineId: "", text: "Olá, {nome}! Encontrei seus dados:\n\n", sendFiles: true, notFoundText: "Não encontrei seu cadastro por este número. Vou te passar para um atendente." };
  if (type === "ai") base.data = { promptId: "", maxTurns: 20 };
  return base;
}
