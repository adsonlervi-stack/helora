import React from "react";
import { Trash2, Plus, X } from "lucide-react";

const TYPE_LABELS = {
  message: "Mensagem",
  menu: "Menu (espera resposta)",
  transfer: "Transferir p/ atendente",
  end: "Encerrar roteiro"
};

// Rótulo curto de um nó, pra usar nos seletores "próximo nó" / "opção leva pra".
export function nodeLabel(node, index) {
  if (!node) return "";
  const preview = (node.text || "").trim().replace(/\s+/g, " ").slice(0, 34);
  return `${index + 1}. ${TYPE_LABELS[node.type] || node.type}${preview ? " — " + preview : ""}`;
}

function NextNodeSelect({ value, onChange, nodeOrder, excludeId, allowEnd = true }) {
  return (
    <select className="flow-select" value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{allowEnd ? "— encerra o roteiro aqui —" : "— escolha um nó —"}</option>
      {nodeOrder
        .filter((n) => n.id !== excludeId)
        .map((n, i) => (
          <option key={n.id} value={n.id}>
            {nodeLabel(n, i)}
          </option>
        ))}
    </select>
  );
}

export default function BotFlowNodeCard({
  node,
  index,
  isStart,
  nodeOrder,
  departments,
  onChange,
  onDelete
}) {
  const update = (patch) => onChange({ ...node, ...patch });

  const updateOption = (i, patch) => {
    const options = [...(node.options || [])];
    options[i] = { ...options[i], ...patch };
    update({ options });
  };

  const addOption = () => {
    update({ options: [...(node.options || []), { match: "", label: "", next: null }] });
  };

  const removeOption = (i) => {
    const options = [...(node.options || [])];
    options.splice(i, 1);
    update({ options });
  };

  return (
    <div className={`flow-node-card ${isStart ? "is-start" : ""}`}>
      <div className="flow-node-head">
        <span className="flow-node-index">Nó {index + 1}</span>
        {isStart && <span className="flow-start-badge">Início</span>}

        <select className="flow-select" value={node.type} onChange={(e) => onChange({ ...node, type: e.target.value })}>
          <option value="message">Mensagem (segue sozinho)</option>
          <option value="menu">Menu (espera resposta)</option>
          <option value="transfer">Transferir p/ atendente</option>
          <option value="end">Encerrar roteiro</option>
        </select>

        <div className="flow-node-head-spacer" />

        <button className="flow-node-delete" title="Excluir este nó" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flow-field">
        <label>Texto que o bot envia</label>
        <textarea
          rows={3}
          value={node.text || ""}
          placeholder="Ex: Olá! 👋 Escolha uma opção..."
          onChange={(e) => update({ text: e.target.value })}
        />
      </div>

      {node.type === "message" && (
        <div className="flow-field">
          <label>Depois, seguir para</label>
          <NextNodeSelect
            value={node.next}
            onChange={(next) => update({ next })}
            nodeOrder={nodeOrder}
            excludeId={node.id}
          />
        </div>
      )}

      {node.type === "transfer" && (
        <div className="flow-field">
          <label>Setor de destino (opcional)</label>
          <select
            className="flow-select"
            style={{ width: "100%" }}
            value={node.departmentId || ""}
            onChange={(e) => update({ departmentId: e.target.value || null })}
          >
            <option value="">Sem setor específico (fila geral)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {node.type === "menu" && (
        <>
          <div className="flow-field">
            <label>Opções (o que o cliente pode responder)</label>
            <div className="flow-options-list">
              {(node.options || []).map((opt, i) => (
                <div className="flow-option-row" key={i}>
                  <input
                    placeholder="ex: 1"
                    value={opt.match || ""}
                    onChange={(e) => updateOption(i, { match: e.target.value })}
                  />
                  <input
                    placeholder="Rótulo (opcional, só pra você)"
                    value={opt.label || ""}
                    onChange={(e) => updateOption(i, { label: e.target.value })}
                  />
                  <NextNodeSelect
                    value={opt.next}
                    onChange={(next) => updateOption(i, { next })}
                    nodeOrder={nodeOrder}
                    excludeId={node.id}
                    allowEnd={false}
                  />
                  <button className="flow-option-remove" title="Remover opção" onClick={() => removeOption(i)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="flow-option-add" onClick={addOption}>
              <Plus size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
              Adicionar opção
            </button>
          </div>

          <div className="flow-field">
            <label>Se o cliente responder algo que não bate com nenhuma opção</label>
            <textarea
              rows={2}
              value={node.fallbackText || ""}
              placeholder="Ex: Desculpe, não entendi. Escolha uma das opções acima."
              onChange={(e) => update({ fallbackText: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}
