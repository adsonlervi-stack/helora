import React, { useEffect, useRef, useState } from "react";
import { Inbox, ArrowRightLeft, CheckCircle2, ChevronDown, RotateCcw } from "lucide-react";

// Ações de primeira classe do ticket, no cabeçalho da conversa:
// - Fila: devolve a conversa (tira o atendente responsável, deixa aberta pro setor pegar)
// - Transferir: escolhe um atendente específico OU um setor
// - Fechar: marca como resolvida (ou reabre, se já estiver resolvida)
export default function TicketActions({
  conversation,
  departments,
  team,
  onAssign,
  onSetDepartment,
  onSetStatus
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTab, setTransferTab] = useState("agent"); // 'agent' | 'department'
  const boxRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setTransferOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const resolved = conversation.status === "resolved";
  const inQueue = !conversation.assignedAgentId;

  const handleMoveToQueue = () => {
    if (inQueue) return;
    onAssign(null);
  };

  const handlePickAgent = (agentId) => {
    onAssign(agentId);
    setTransferOpen(false);
  };

  const handlePickDepartment = (departmentId) => {
    onSetDepartment(departmentId);
    setTransferOpen(false);
  };

  return (
    <div className="ticket-actions">
      <button
        type="button"
        className="ticket-action-btn"
        title={inQueue ? "Já está na fila (sem atendente atribuído)" : "Devolver para a fila — remove o atendente responsável"}
        onClick={handleMoveToQueue}
        disabled={inQueue}
      >
        <Inbox size={14} />
        <span>Fila</span>
      </button>

      <div className="ticket-transfer" ref={boxRef}>
        <button
          type="button"
          className={`ticket-action-btn ${transferOpen ? "open" : ""}`}
          onClick={() => setTransferOpen((v) => !v)}
        >
          <ArrowRightLeft size={14} />
          <span>Transferir</span>
          <ChevronDown size={12} />
        </button>

        {transferOpen && (
          <div className="ticket-transfer-menu">
            <div className="ticket-transfer-tabs">
              <button
                type="button"
                className={transferTab === "agent" ? "active" : ""}
                onClick={() => setTransferTab("agent")}
              >
                Para atendente
              </button>
              <button
                type="button"
                className={transferTab === "department" ? "active" : ""}
                onClick={() => setTransferTab("department")}
              >
                Para setor
              </button>
            </div>

            <div className="ticket-transfer-list">
              {transferTab === "agent" &&
                (team.length > 0 ? (
                  team.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      className={`ticket-transfer-item ${conversation.assignedAgentId === m.id ? "current" : ""}`}
                      onClick={() => handlePickAgent(m.id)}
                    >
                      {m.name || "Sem nome"}
                    </button>
                  ))
                ) : (
                  <div className="ticket-transfer-empty">Nenhum atendente cadastrado.</div>
                ))}

              {transferTab === "department" &&
                (departments.length > 0 ? (
                  departments.map((d) => (
                    <button
                      type="button"
                      key={d.id}
                      className={`ticket-transfer-item ${conversation.departmentId === d.id ? "current" : ""}`}
                      onClick={() => handlePickDepartment(d.id)}
                    >
                      {d.name}
                    </button>
                  ))
                ) : (
                  <div className="ticket-transfer-empty">Nenhum setor cadastrado.</div>
                ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`ticket-action-btn ticket-close-btn ${resolved ? "resolved" : ""}`}
        onClick={() => onSetStatus(resolved ? "open" : "resolved")}
      >
        {resolved ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
        <span>{resolved ? "Reabrir" : "Fechar"}</span>
      </button>
    </div>
  );
}
