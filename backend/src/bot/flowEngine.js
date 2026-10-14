import { updateConversation } from "../config/db.js";

function normalize(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Anda pela árvore a partir de um nó, concatenando o texto dos nós do tipo
 * "message" (que não esperam resposta — disparam e seguem pro próximo
 * automaticamente) até chegar num nó que PARA a execução:
 *  - "menu": espera o cliente escolher uma das opções
 *  - "transfer": entrega a conversa pra um atendente/setor (bot silencia)
 *  - "end": encerra o roteiro (o bot continua no ar, mas sem guiar mais)
 *  - ou um nó "message" sem `next` (equivalente a "end")
 *
 * `maxSteps` existe só como trava de segurança contra um ciclo mal
 * configurado (nó A aponta pro B que aponta de volta pro A).
 */
function walk(flow, startId, maxSteps = 25) {
  const texts = [];
  let node = flow.nodes[startId];
  let steps = 0;

  while (node && steps < maxSteps) {
    steps++;

    if (node.type === "menu") {
      if (node.text) texts.push(node.text);
      return { stopNodeId: node.id, texts };
    }

    if (node.type === "transfer") {
      if (node.text) texts.push(node.text);
      return { stopNodeId: null, texts, transfer: true, transferDepartmentId: node.departmentId || null };
    }

    if (node.type === "end") {
      if (node.text) texts.push(node.text);
      return { stopNodeId: null, texts };
    }

    // "message" — dispara o texto e segue pro próximo nó, se houver.
    if (node.text) texts.push(node.text);
    if (!node.next || !flow.nodes[node.next]) {
      return { stopNodeId: null, texts };
    }
    node = flow.nodes[node.next];
  }

  // Estourou o limite de passos (provável ciclo) — para por segurança.
  return { stopNodeId: null, texts };
}

function matchOption(node, rawText) {
  const text = normalize(rawText);
  return (node.options || []).find((opt) => {
    const m = normalize(opt.match || "");
    return m && (text === m || text.includes(m));
  });
}

async function persistResult(accountId, conversation, result) {
  const patch = { botNodeId: result.stopNodeId };
  if (result.transfer) {
    patch.mode = "human";
    if (result.transferDepartmentId) patch.departmentId = result.transferDepartmentId;
  }
  await updateConversation(accountId, conversation.id, patch);
}

/**
 * Processa uma mensagem recebida contra o fluxo configurável (JSON) da
 * conta. Retorna `null` quando esse fluxo não tem nada a dizer sobre essa
 * mensagem específica (ex: conta sem fluxo configurado, ou o cliente já
 * saiu do roteiro) — nesse caso quem chamou decide o que fazer (palavras-
 * chave configuráveis, ou o menu padrão fixo).
 *
 * @returns {Promise<string|null>}
 */
export async function runFlow(accountId, conversation, rawText, flow) {
  if (!flow || !flow.startNodeId || !flow.nodes || !flow.nodes[flow.startNodeId]) {
    return null;
  }

  // Primeira mensagem da conversa: começa do nó inicial do fluxo.
  if (conversation.isNew) {
    const result = walk(flow, flow.startNodeId);
    await persistResult(accountId, conversation, result);
    return result.texts.join("\n\n") || null;
  }

  // No meio de um menu, esperando a escolha do cliente.
  if (conversation.botNodeId) {
    const node = flow.nodes[conversation.botNodeId];

    if (!node || node.type !== "menu") {
      // Nó inválido ou removido no meio do caminho (fluxo editado depois
      // que a conversa começou) — reseta silenciosamente e deixa o
      // chamador tratar essa mensagem como texto livre.
      await updateConversation(accountId, conversation.id, { botNodeId: null });
      return null;
    }

    const option = matchOption(node, rawText);
    if (!option) {
      return node.fallbackText || "Desculpe, não entendi essa opção. Pode escolher uma das opções acima? 🙏";
    }

    const result = walk(flow, option.next);
    await persistResult(accountId, conversation, result);
    return result.texts.join("\n\n") || null;
  }

  // Fora do fluxo (o roteiro já tinha terminado antes) — deixa o chamador
  // decidir (respostas por palavra-chave / fallback genérico).
  return null;
}
