import { askConfirm, askPrompt } from "../dialogs.js";
import React, { useEffect, useState } from "react";
import { Plus, Save, RotateCcw } from "lucide-react";
import BotFlowNodeCard, { nodeLabel } from "./BotFlowNodeCard.jsx";
import { getBotFlow, saveBotFlow, getDepartments } from "../api.js";

function newId() {
  return "n_" + Math.random().toString(36).slice(2, 9);
}

function blankMenuFlow() {
  const id = newId();
  return {
    startNodeId: id,
    nodes: {
      [id]: {
        id,
        type: "menu",
        text: "Olá! 👋 Escolha uma opção:\n1 - Falar com um atendente",
        options: [{ match: "1", label: "Falar com atendente", next: null }],
        fallbackText: "Desculpe, não entendi. Pode escolher uma das opções acima?"
      }
    }
  };
}

// Fluxo padrão — equivalente ao menu fixo que a Helora já usava antes dessa
// etapa existir. Serve de ponto de partida pra quem não quer começar do
// zero: já é um roteiro funcional, só ajustar os textos.
function defaultMenuFlow() {
  const n1 = newId();
  const n2 = newId();
  const n3 = newId();
  const n4 = newId();
  return {
    startNodeId: n1,
    nodes: {
      [n1]: {
        id: n1,
        type: "menu",
        text: "Olá! 👋 Escolha uma opção:\n1 - Horário de atendimento\n2 - Falar com um atendente\n3 - Ver nossos planos",
        options: [
          { match: "1", label: "Horário de atendimento", next: n2 },
          { match: "2", label: "Falar com atendente", next: n3 },
          { match: "3", label: "Ver planos", next: n4 }
        ],
        fallbackText: "Desculpe, não entendi. Escolha 1, 2 ou 3."
      },
      [n2]: {
        id: n2,
        type: "message",
        text: "Nosso atendimento funciona de segunda a sexta, das 9h às 18h.",
        next: n1
      },
      [n3]: {
        id: n3,
        type: "transfer",
        text: "Ok! Um atendente humano vai continuar essa conversa a partir de agora. 🙋",
        departmentId: null
      },
      [n4]: {
        id: n4,
        type: "end",
        text: "Temos planos a partir de R$ 99/mês. Digite 'preco' para mais detalhes ou fale com um atendente."
      }
    }
  };
}

function validateFlow(flow) {
  const errors = [];
  const ids = Object.keys(flow.nodes);

  if (!flow.startNodeId || !flow.nodes[flow.startNodeId]) {
    errors.push("Escolha um nó inicial válido.");
  }

  for (const node of Object.values(flow.nodes)) {
    if (!node.text || !node.text.trim()) {
      errors.push(`O nó "${node.id}" está sem texto.`);
    }
    if (node.type === "message" && node.next && !ids.includes(node.next)) {
      errors.push(`Um nó do tipo Mensagem aponta para um próximo nó que não existe mais.`);
    }
    if (node.type === "menu") {
      const options = node.options || [];
      if (options.length === 0) {
        errors.push(`Um nó do tipo Menu não tem nenhuma opção configurada.`);
      }
      options.forEach((opt) => {
        if (!opt.match || !opt.match.trim()) {
          errors.push(`Uma opção de menu está sem a palavra/número que o cliente precisa digitar.`);
        }
        if (opt.next && !ids.includes(opt.next)) {
          errors.push(`Uma opção de menu aponta para um nó que não existe mais.`);
        }
      });
    }
  }

  return errors;
}

export default function AgentsPage() {
  const [flow, setFlow] = useState(undefined); // undefined = carregando, null = sem fluxo salvo ainda
  const [departments, setDepartments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    getBotFlow().then(setFlow).catch(console.error);
    getDepartments().then(setDepartments).catch(console.error);
  }, []);

  if (flow === undefined) {
    return <div className="page">Carregando o fluxo do bot...</div>;
  }

  if (flow === null) {
    return (
      <div className="page">
        <div className="flow-empty-state">
          <h3>Seu chatbot ainda não tem um fluxo próprio</h3>
          <p>
            Hoje o bot responde com um menu fixo (1 - Horário, 2 - Atendente, 3 - Planos). Você pode
            começar a partir desse menu padrão e ajustar do seu jeito, ou criar um roteiro do zero.
          </p>
          <div className="flow-empty-actions">
            <button className="connect-btn" style={{ width: "auto", padding: "10px 20px" }} onClick={() => setFlow(defaultMenuFlow())}>
              Começar do menu padrão
            </button>
            <button className="btn-secondary-flow" onClick={() => setFlow(blankMenuFlow())}>
              Criar do zero
            </button>
          </div>
        </div>
      </div>
    );
  }

  const nodeOrder = Object.values(flow.nodes);

  const updateNode = (updated) => {
    setFlow((f) => ({ ...f, nodes: { ...f.nodes, [updated.id]: updated } }));
    setSavedAt(null);
  };

  const deleteNode = (id) => {
    setFlow((f) => {
      const nodes = { ...f.nodes };
      delete nodes[id];
      let startNodeId = f.startNodeId;
      if (startNodeId === id) {
        startNodeId = Object.keys(nodes)[0] || null;
      }
      return { ...f, nodes, startNodeId };
    });
    setSavedAt(null);
  };

  const addNode = () => {
    const id = newId();
    const node = { id, type: "message", text: "", next: null };
    setFlow((f) => ({ ...f, nodes: { ...f.nodes, [id]: node } }));
    setSavedAt(null);
  };

  const handleSave = async () => {
    const validationErrors = validateFlow(flow);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    setSaving(true);
    try {
      const saved = await saveBotFlow(flow);
      setFlow(saved);
      setSavedAt(new Date());
    } catch (err) {
      setErrors([err?.response?.data?.error || "Não foi possível salvar o fluxo. Tente novamente."]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="card-subtitle" style={{ marginBottom: 18 }}>
        Monte o roteiro que o bot segue no WhatsApp, Messenger e Instagram. Cada nó é um passo:
        uma mensagem, um menu que espera resposta, uma transferência pra atendente, ou o fim do
        roteiro.
      </div>

      {errors.length > 0 && (
        <div className="flow-errors">
          <strong>Não deu pra salvar — corrija antes:</strong>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flow-toolbar">
        <div className="flow-start-picker">
          Nó inicial:
          <select
            className="flow-select"
            value={flow.startNodeId || ""}
            onChange={(e) => {
              setFlow((f) => ({ ...f, startNodeId: e.target.value }));
              setSavedAt(null);
            }}
          >
            {nodeOrder.map((n, i) => (
              <option key={n.id} value={n.id}>
                {nodeLabel(n, i)}
              </option>
            ))}
          </select>
        </div>

        <div className="flow-toolbar-spacer" />

        {savedAt && <span className="flow-save-status">Salvo ✓</span>}

        <button
          className="btn-secondary-flow"
          onClick={async () => {
            if (await askConfirm("Descartar as alterações e recarregar o fluxo salvo?")) {
              getBotFlow().then(setFlow);
              setErrors([]);
              setSavedAt(null);
            }
          }}
        >
          <RotateCcw size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          Descartar alterações
        </button>

        <button className="connect-btn" style={{ width: "auto", padding: "10px 18px" }} onClick={handleSave} disabled={saving}>
          <Save size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          {saving ? "Salvando..." : "Salvar fluxo"}
        </button>
      </div>

      <div className="flow-node-list">
        {nodeOrder.map((node, i) => (
          <BotFlowNodeCard
            key={node.id}
            node={node}
            index={i}
            isStart={node.id === flow.startNodeId}
            nodeOrder={nodeOrder}
            departments={departments}
            onChange={updateNode}
            onDelete={() => deleteNode(node.id)}
          />
        ))}

        <button className="flow-add-node-btn" onClick={addNode}>
          <Plus size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
          Adicionar nó
        </button>
      </div>
    </div>
  );
}
